import { FC, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  Building,
  User,
  Hash,
  ArrowLeft,
} from 'lucide-react'
import { courtAdminExtApi, courtAdminApi } from '@/services/api'
import { unwrapList } from '@/utils/unwrap'
import { friendlyError } from '@/utils/errors'

interface Court {
  id: string
  name?: string
  type?: string
  state?: string
  district?: string
  pincode?: string
  address?: string
}

/**
 * Court-admin self-registration.
 *
 * Server contract (`POST /court-admin/register`) requires:
 *   name, email, phone, password, courtId, registrationNumber
 * plus optional: idProofUrl, authorizationProofUrl, avatarUrl.
 *
 * After creating the account the user is told to sign in. Most features stay
 * locked until a super-admin authorizes them — we surface that copy on the
 * success card.
 */
const CourtAdminRegisterPage: FC = () => {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    pincode: '',
    courtId: '',
    registrationNumber: '',
    idProofUrl: '',
    authorizationProofUrl: '',
  })
  const [showPw, setShowPw] = useState(false)
  const [courts, setCourts] = useState<Court[]>([])
  const [loadingCourts, setLoadingCourts] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const update = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }))

  const lookupCourts = async () => {
    setError(null)
    if (!/^\d{6}$/.test(form.pincode.trim())) {
      setError('Enter a valid 6-digit pincode to find nearby courts.')
      return
    }
    setLoadingCourts(true)
    setCourts([])
    try {
      const res = await courtAdminApi.getCourtsByPincode(form.pincode.trim())
      const list = unwrapList<Court>(res.data, 'courts')
      setCourts(list)
      if (list.length === 0) {
        setError('No courts found for that pincode. Try a different pincode or contact support.')
      }
    } catch (err) {
      setError(friendlyError(err, "We couldn't look up courts for that pincode."))
    } finally {
      setLoadingCourts(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) return setError('Please enter your full name.')
    if (!/.+@.+\..+/.test(form.email.trim())) return setError('Please enter a valid email address.')
    if (!form.phone.trim()) return setError('Please enter a phone number.')
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    if (form.password !== form.confirmPassword) return setError("Password and confirmation don't match.")
    if (!form.courtId) return setError('Please pick the court you administer.')
    if (!form.registrationNumber.trim()) return setError('Please enter your court admin registration number.')

    setSubmitting(true)
    try {
      const payload: any = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        courtId: form.courtId,
        registrationNumber: form.registrationNumber.trim(),
      }
      if (form.idProofUrl.trim()) payload.idProofUrl = form.idProofUrl.trim()
      if (form.authorizationProofUrl.trim()) payload.authorizationProofUrl = form.authorizationProofUrl.trim()
      await courtAdminExtApi.selfRegister(payload)
      setSuccess(true)
      setTimeout(() => navigate('/auth/court-admin-login', { replace: true }), 2500)
    } catch (err) {
      setError(friendlyError(err, "We couldn't create your court-admin account."))
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Account created</h1>
          <p className="text-sm text-gray-500 mt-2">
            You can now sign in. Most features will stay locked until a super admin reviews and
            authorizes your account.
          </p>
          <Link
            to="/auth/court-admin-login"
            className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Go to court admin sign-in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="w-full max-w-2xl mx-auto">
        <Link to="/auth/court-admin-login" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-indigo-50">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Court Admin registration</h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Self-onboard as a court administrator. Your account will be reviewed by a platform super
            admin before you can verify lawyers or organizations.
          </p>

          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            {/* Section: Personal */}
            <Section title="Personal details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={User} label="Full name" value={form.name} onChange={(v) => update('name', v)} required />
                <Field icon={Mail} label="Email" type="email" value={form.email} onChange={(v) => update('email', v)} required />
                <Field icon={Phone} label="Phone" value={form.phone} onChange={(v) => update('phone', v)} required />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => update('password', e.target.value)}
                      autoComplete="new-password"
                      required
                      className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      tabIndex={-1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">At least 8 characters.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={(e) => update('confirmPassword', e.target.value)}
                      autoComplete="new-password"
                      required
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Section: Court */}
            <Section title="Court assignment">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Pincode *</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={form.pincode}
                      onChange={(e) => update('pincode', e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                      placeholder="6-digit pincode"
                      inputMode="numeric"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={lookupCourts}
                  disabled={loadingCourts}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
                >
                  {loadingCourts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building className="w-4 h-4" />}
                  Find courts
                </button>
              </div>
              {courts.length > 0 && (
                <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100">
                  {courts.map((c) => {
                    const active = c.id === form.courtId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => update('courtId', c.id)}
                        className={`w-full text-left px-3 py-2.5 transition-colors ${active ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className={`text-sm font-medium ${active ? 'text-indigo-800' : 'text-gray-900'}`}>
                          {c.name || 'Court'}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {[c.type, c.district, c.state, c.pincode].filter(Boolean).join(' · ')}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              <Field
                icon={Hash}
                label="Court admin registration number"
                value={form.registrationNumber}
                onChange={(v) => update('registrationNumber', v)}
                required
              />
            </Section>

            {/* Section: Optional proofs */}
            <Section title="Proof documents (optional)">
              <p className="text-xs text-gray-500 -mt-1 mb-2">
                If you already have a hosted URL for your ID proof / authorization letter, paste it here.
                Otherwise upload them later from your profile.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="ID proof URL"
                  value={form.idProofUrl}
                  onChange={(v) => update('idProofUrl', v)}
                  placeholder="https://…"
                />
                <Field
                  label="Authorization proof URL"
                  value={form.authorizationProofUrl}
                  onChange={(v) => update('authorizationProofUrl', v)}
                  placeholder="https://…"
                />
              </div>
            </Section>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {submitting ? 'Creating account…' : 'Create court-admin account'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/auth/court-admin-login" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">{title}</h2>
    {children}
  </div>
)

const Field: FC<{
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
  icon?: React.ComponentType<{ className?: string }>
}> = ({ label, value, onChange, type = 'text', required, placeholder, icon: Icon }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}
      {required && ' *'}
    </label>
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`w-full ${Icon ? 'pl-9' : 'pl-3'} pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200`}
      />
    </div>
  </div>
)

export default CourtAdminRegisterPage
