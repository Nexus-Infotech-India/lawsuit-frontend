import { FC, useEffect, useState } from 'react'
import { Mail, Lock, AlertTriangle, Copy, Check, Wallet, X as XIcon, Loader2, ShieldCheck, ShieldOff, IndianRupee } from 'lucide-react'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'
import { organizationsApi } from '@/services/api'
import { friendlyError } from '@/utils/errors'
import AddressPicker from '@/components/molecules/AddressPicker'

/**
 * Surfaces the result of the credentials email after a lawyer is created.
 * - `success`: short green toast, auto-dismisses.
 * - `failure-with-password`: persistent red banner showing the plaintext
 *   temp password the org head can share manually (the server only returns
 *   this when delivery genuinely failed; on success the password is never
 *   exposed to this side).
 */
type CredentialsResult =
  | { kind: 'success'; email: string; provider?: string }
  | { kind: 'manual'; email: string }
  | {
      kind: 'failure'
      email: string
      reason: string
      provider?: string
      tempPassword?: string
    }

// `password` stays in the form so the org head CAN still set one if they
// prefer to share it out-of-band, but it's no longer required — leaving it
// empty triggers the server-side flow that generates a temporary password
// and emails it to the lawyer.
const blank = {
  name: '', email: '', phone: '', password: '',
  licenseNumber: '', barCouncilId: '',
  specializations: '',
  feePerConsultation: '',
  pincode: '', city: '', state: '',
  bio: '',
  experienceYears: '',
}

const OrganizationLawyersPage: FC = () => {
  const lawyers = useOrganizationStore((s) => s.lawyers)
  const fetchLawyers = useOrganizationStore((s) => s.fetchLawyers)
  const addLawyer = useOrganizationStore((s) => s.addLawyer)
  const loadingLawyers = useOrganizationStore((s) => s.loadingLawyers)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...blank })
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [credentialsResult, setCredentialsResult] = useState<CredentialsResult | null>(null)
  const [copied, setCopied] = useState(false)
  // Per-lawyer salary drawer. `salaryFor` is the lawyer-id whose config we're
  // editing; `null` means the drawer is closed.
  const [salaryFor, setSalaryFor] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLawyers().catch(() => { })
  }, [fetchLawyers])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((s) => ({ ...s, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      // Strip `password` when it's empty so the server takes the
      // "generate + email" branch. Sending an empty string would fail the
      // server's `z.string().min(8).optional()` check, and sending a real
      // value tells the server to skip the credentials email.
      const payload: any = {
        name: form.name,
        email: form.email,
        phone: form.phone,
      }
      if (form.password) payload.password = form.password
      if (form.licenseNumber) payload.licenseNumber = form.licenseNumber
      if (form.barCouncilId) payload.barCouncilId = form.barCouncilId
      if (form.specializations) {
        payload.specializations = form.specializations.split(',').map((s) => s.trim()).filter(Boolean)
      }
      if (form.feePerConsultation) payload.feePerConsultation = Number(form.feePerConsultation)
      if (form.pincode) payload.pincode = form.pincode
      if (form.city) payload.city = form.city
      if (form.state) payload.state = form.state
      if (form.bio) payload.bio = form.bio
      if (form.experienceYears) payload.experienceYears = Number(form.experienceYears)

      const result = await addLawyer(payload)
      // Server returns `{ lawyer, credentialsEmail: { delivered, provider, error?, tempPassword? } }`
      // when it auto-generated the password. We branch on three outcomes:
      //   1. success: short auto-dismissing toast.
      //   2. failure (email send broken, e.g. Brevo sender unverified): show a
      //      persistent banner with the temp password the server returned so
      //      the org head can deliver it manually. No auto-dismiss.
      //   3. org head supplied their own password: just toast a reminder to
      //      share it securely.
      const credentialsEmail = (result as any)?.credentialsEmail
      const usedGenerated = !form.password
      if (usedGenerated && credentialsEmail?.delivered) {
        setCredentialsResult({
          kind: 'success',
          email: form.email,
          provider: credentialsEmail.provider,
        })
        setToast(`Credentials emailed to ${form.email}.`)
        setTimeout(() => setToast(null), 5000)
      } else if (usedGenerated && credentialsEmail && !credentialsEmail.delivered) {
        setCredentialsResult({
          kind: 'failure',
          email: form.email,
          reason: credentialsEmail.error || `Mail provider returned no delivery (${credentialsEmail.provider || 'unknown'}).`,
          provider: credentialsEmail.provider,
          tempPassword: credentialsEmail.tempPassword,
        })
        setToast(null)
      } else {
        setCredentialsResult({ kind: 'manual', email: form.email })
        setToast(`Lawyer added — share the password with ${form.email} securely.`)
        setTimeout(() => setToast(null), 5000)
      }
      setForm({ ...blank })
      setShowForm(false)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to add lawyer')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Lawyers</h1>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add lawyer'}
        </Button>
      </div>

      {toast && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {toast}
        </div>
      )}

      {/* Email delivery failed — surface the temp password the server
          returned so the org head can share it manually. The lawyer will
          still be forced to rotate this on first login. */}
      {credentialsResult?.kind === 'failure' && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-800">
                Couldn't email credentials to {credentialsResult.email}.
              </p>
              <p className="mt-1 text-red-700 break-words">
                {credentialsResult.reason}
              </p>
              {credentialsResult.tempPassword && (
                <div className="mt-3 rounded-md border border-red-200 bg-white p-3">
                  <p className="text-xs font-medium text-gray-700">
                    Share this temporary password with the lawyer (they'll be required to change it at first sign-in):
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 px-2 py-1.5 rounded bg-gray-100 text-sm font-mono text-gray-900 break-all">
                      {credentialsResult.tempPassword}
                    </code>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(credentialsResult.tempPassword || '')
                          setCopied(true)
                          setTimeout(() => setCopied(false), 2000)
                        } catch {
                          // Clipboard API can fail under non-HTTPS / iframe contexts.
                          // The password is still visible above — operator can copy by hand.
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs text-red-700/90">
                Fix tip: in the Brevo dashboard, verify the sender email under
                <em> Senders &amp; IPs</em>, or configure <code>SMTP_*</code> env
                vars on the server as a fallback. Then click <em>Resend</em> on
                this lawyer's row (or use the forgot-password flow on the login page).
              </p>
              <button
                type="button"
                onClick={() => setCredentialsResult(null)}
                className="mt-3 text-xs font-medium text-red-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Onboard a new lawyer</h2>
          {/* Two onboarding modes. Leaving the password blank is the default
              and most common: the server generates a temp password, emails
              it to the lawyer, and forces a rotation at first login. Setting
              one manually skips the email — for cases where the org head
              prefers to share credentials over a private channel. */}
          <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-800 flex gap-2">
            <Mail className="w-5 h-5 flex-shrink-0 text-indigo-600" />
            <div>
              <p className="font-medium">Credentials go straight to the lawyer's inbox.</p>
              <p className="text-xs mt-0.5 text-indigo-700/90">
                Leave the password field blank — we'll generate a temporary one and email it
                with the login link. The lawyer is required to change it on first sign-in.
                Set a password manually only if you'd rather share it out-of-band.
              </p>
            </div>
          </div>
          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name" name="name" value={form.name} onChange={handleChange} required />
            <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
            <Field label="Phone" name="phone" value={form.phone} onChange={handleChange} required />
            <Field
              label="Temporary password (optional)"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Leave blank to email a generated one"
              icon={<Lock className="w-4 h-4 text-gray-400" />}
            />
            <Field label="License number" name="licenseNumber" value={form.licenseNumber} onChange={handleChange} />
            <Field label="Bar Council ID" name="barCouncilId" value={form.barCouncilId} onChange={handleChange} />
            <Field label="Specializations (comma separated)" name="specializations" value={form.specializations} onChange={handleChange} />
            <Field label="Fee per consultation (₹)" name="feePerConsultation" type="number" value={form.feePerConsultation} onChange={handleChange} />
            <Field label="Experience (years)" name="experienceYears" type="number" value={form.experienceYears} onChange={handleChange} />
            <div className="sm:col-span-2">
              {/* Address — AddressPicker fills state + city from the
                  pincode lookup. The lawyer model doesn't store district
                  separately, so we surface it for UX but drop it from the
                  payload (handleSubmit only forwards pincode / city / state). */}
              <AddressPicker
                value={{
                  pincode: form.pincode,
                  state: form.state,
                  district: '',
                  city: form.city,
                }}
                onChange={(next) =>
                  setForm((s) => ({
                    ...s,
                    pincode: next.pincode || '',
                    state: next.state || '',
                    city: next.city || '',
                  }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Bio</label>
              <textarea
                name="bio"
                rows={3}
                value={form.bio}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? (form.password ? 'Creating account…' : 'Creating + emailing…')
                : (form.password ? 'Add lawyer' : 'Add lawyer & email credentials')}
            </Button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loadingLawyers ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading lawyers…</div>
        ) : lawyers.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-base font-medium text-gray-900">No lawyers yet</h3>
            <p className="text-sm text-gray-500 mt-1">Add your first lawyer to start receiving requests.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lawyer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bar Council</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specializations</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {lawyers.map((l) => (
                <tr key={l.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {l.avatarUrl ? (
                        <img src={l.avatarUrl} alt={l.name} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">
                          {l.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{l.name}</div>
                        <div className="text-xs text-gray-500">{l.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{l.barCouncilId || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {(l.specializations || []).join(', ') || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {l.feePerConsultation != null
                      ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(l.feePerConsultation)
                      : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${l.isVerified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                      {l.isVerified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => setSalaryFor({ id: l.id, name: l.name })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs font-medium"
                      title="Manage salary configuration, hold/release, preview cycle, and pay"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      Salary
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {salaryFor && (
        <LawyerSalaryDrawer
          lawyerId={salaryFor.id}
          lawyerName={salaryFor.name}
          onClose={() => setSalaryFor(null)}
        />
      )}
    </div>
  )
}

// ─── Per-lawyer salary drawer ──────────────────────────────────────────
//
// Wraps the 9 `organizationsApi` salary methods so the org head can:
//   • view + edit the salary config (baseSalary + bonusPer*),
//   • hold or release payouts (audit-trailed by reason),
//   • preview the current cycle's earnings, and
//   • pay this cycle (with optional bonus / deduction).
//
// All amounts are entered and displayed in rupees. The server stores
// `baseSalary` (and likely bonuses) in paise — divide by 100 when reading
// and multiply by 100 when writing. We follow the same convention as the
// `feePerConsultation` column above.

type SalaryConfig = {
  baseSalary?: number | null
  bonusPerConsultation?: number | null
  bonusPerCaseClosed?: number | null
  bonusPerWonCase?: number | null
  isOnHold?: boolean
  holdReason?: string | null
}

const LawyerSalaryDrawer: FC<{
  lawyerId: string
  lawyerName: string
  onClose: () => void
}> = ({ lawyerId, lawyerName, onClose }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [config, setConfig] = useState<SalaryConfig>({})

  // Editable rupee strings (paise persistence handled at save time).
  const [baseSalary, setBaseSalary] = useState('')
  const [bonusConsultation, setBonusConsultation] = useState('')
  const [bonusCaseClosed, setBonusCaseClosed] = useState('')
  const [bonusWonCase, setBonusWonCase] = useState('')
  const [reason, setReason] = useState('')

  const [savingConfig, setSavingConfig] = useState(false)
  const [busyAction, setBusyAction] = useState<null | 'hold' | 'release' | 'pay'>(null)

  const now = new Date()
  const [cycleMonth, setCycleMonth] = useState(now.getMonth() + 1)
  const [cycleYear, setCycleYear] = useState(now.getFullYear())
  const [preview, setPreview] = useState<any>(null)
  const [previewing, setPreviewing] = useState(false)

  // Optional adjustments on the Pay action.
  const [bonusAmount, setBonusAmount] = useState('')
  const [deductionAmount, setDeductionAmount] = useState('')
  const [payNotes, setPayNotes] = useState('')

  const loadConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await organizationsApi.getLawyerSalaryConfig(lawyerId)
      const data = (res as any).data ?? res
      const cfg: SalaryConfig = data.config ?? data.salary ?? data
      setConfig(cfg)
      setBaseSalary(toRupeesString(cfg.baseSalary))
      setBonusConsultation(toRupeesString(cfg.bonusPerConsultation))
      setBonusCaseClosed(toRupeesString(cfg.bonusPerCaseClosed))
      setBonusWonCase(toRupeesString(cfg.bonusPerWonCase))
    } catch (err) {
      setError(friendlyError(err, "We couldn't load this lawyer's salary settings."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lawyerId])

  const showNotice = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 3500)
  }

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingConfig(true)
    setError(null)
    try {
      await organizationsApi.setLawyerSalaryConfig(lawyerId, {
        baseSalary: rupeesToPaise(baseSalary),
        bonusPerConsultation: rupeesToPaise(bonusConsultation),
        bonusPerCaseClosed: rupeesToPaise(bonusCaseClosed),
        bonusPerWonCase: rupeesToPaise(bonusWonCase),
        reason: reason || undefined,
      })
      showNotice('Salary configuration updated')
      setReason('')
      await loadConfig()
    } catch (err) {
      setError(friendlyError(err, "We couldn't save the config."))
    } finally {
      setSavingConfig(false)
    }
  }

  const onHold = async () => {
    const r = window.prompt('Reason for holding salary? (required, audit-trailed)')
    if (!r) return
    setBusyAction('hold')
    setError(null)
    try {
      await organizationsApi.holdLawyerSalary(lawyerId, r)
      showNotice('Salary placed on hold')
      await loadConfig()
    } catch (err) {
      setError(friendlyError(err, "Couldn't place hold."))
    } finally {
      setBusyAction(null)
    }
  }

  const onRelease = async () => {
    const r = window.prompt('Reason for releasing the hold? (optional)') ?? ''
    setBusyAction('release')
    setError(null)
    try {
      await organizationsApi.releaseLawyerSalary(lawyerId, r || undefined)
      showNotice('Salary hold released')
      await loadConfig()
    } catch (err) {
      setError(friendlyError(err, "Couldn't release hold."))
    } finally {
      setBusyAction(null)
    }
  }

  const onPreview = async () => {
    setPreviewing(true)
    setError(null)
    setPreview(null)
    try {
      const res = await organizationsApi.previewLawyerSalary(lawyerId, { cycleMonth, cycleYear })
      const data = (res as any).data ?? res
      setPreview(data.preview ?? data)
    } catch (err) {
      setError(friendlyError(err, "Couldn't preview the cycle."))
    } finally {
      setPreviewing(false)
    }
  }

  const onPay = async () => {
    if (!confirm(`Pay ${lawyerName} for ${cycleMonth}/${cycleYear}? Wallet ledger will be debited from the org wallet.`)) return
    setBusyAction('pay')
    setError(null)
    try {
      await organizationsApi.payLawyerSalary(lawyerId, {
        cycleMonth,
        cycleYear,
        bonusAmount: rupeesToPaise(bonusAmount) ?? undefined,
        deductionAmount: rupeesToPaise(deductionAmount) ?? undefined,
        notes: payNotes || undefined,
      })
      showNotice('Salary paid for this cycle')
      setBonusAmount('')
      setDeductionAmount('')
      setPayNotes('')
      setPreview(null)
      await loadConfig()
    } catch (err) {
      setError(friendlyError(err, "Couldn't pay this cycle."))
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-full max-w-xl bg-white shadow-xl flex flex-col">
        <header className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Manage salary</h2>
            <p className="text-xs text-gray-500">{lawyerName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded hover:bg-gray-100 text-gray-500">
            <XIcon className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {notice && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500">
              <Loader2 className="w-5 h-5 mx-auto animate-spin text-indigo-600" />
              <p className="mt-2">Loading…</p>
            </div>
          ) : (
            <>
              {/* Hold status */}
              <section className="rounded-lg border border-gray-200 p-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {config.isOnHold ? (
                    <ShieldOff className="w-5 h-5 text-red-600 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {config.isOnHold ? 'Salary is on hold' : 'Salary is active'}
                    </div>
                    {config.isOnHold && config.holdReason && (
                      <div className="text-xs text-gray-600 mt-0.5">Reason: {config.holdReason}</div>
                    )}
                  </div>
                </div>
                {config.isOnHold ? (
                  <button
                    onClick={onRelease}
                    disabled={busyAction === 'release'}
                    className="text-xs font-medium px-3 py-1.5 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {busyAction === 'release' ? 'Releasing…' : 'Release hold'}
                  </button>
                ) : (
                  <button
                    onClick={onHold}
                    disabled={busyAction === 'hold'}
                    className="text-xs font-medium px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {busyAction === 'hold' ? 'Holding…' : 'Hold salary'}
                  </button>
                )}
              </section>

              {/* Config */}
              <form onSubmit={saveConfig} className="rounded-lg border border-gray-200 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Configuration</h3>
                  <span className="text-[11px] text-gray-400">amounts in ₹</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <SmallField label="Base salary / month" value={baseSalary} onChange={setBaseSalary} />
                  <SmallField label="Bonus per consultation" value={bonusConsultation} onChange={setBonusConsultation} />
                  <SmallField label="Bonus per case closed" value={bonusCaseClosed} onChange={setBonusCaseClosed} />
                  <SmallField label="Bonus per case won" value={bonusWonCase} onChange={setBonusWonCase} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reason for change (audit log)</label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Annual revision"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {savingConfig && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Save configuration
                  </button>
                </div>
              </form>

              {/* Cycle preview + pay */}
              <section className="rounded-lg border border-gray-200 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Cycle preview &amp; pay</h3>
                  <div className="flex items-center gap-2">
                    <select
                      value={cycleMonth}
                      onChange={(e) => setCycleMonth(Number(e.target.value))}
                      className="px-2 py-1 border border-gray-300 rounded text-xs"
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(2024, i).toLocaleString('en-IN', { month: 'short' })}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={cycleYear}
                      onChange={(e) => setCycleYear(Number(e.target.value))}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                    />
                    <button
                      onClick={onPreview}
                      disabled={previewing}
                      className="px-2.5 py-1 rounded-md border border-gray-200 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                    >
                      {previewing ? 'Loading…' : 'Preview'}
                    </button>
                  </div>
                </div>

                {preview && (
                  <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs space-y-1">
                    <PreviewRow label="Base salary" value={preview.baseSalary} />
                    <PreviewRow label="Consultation bonuses" value={preview.consultationBonus} />
                    <PreviewRow label="Case-closed bonuses" value={preview.caseClosedBonus} />
                    <PreviewRow label="Case-won bonuses" value={preview.wonCaseBonus} />
                    <PreviewRow label="Net payable" value={preview.netPayable ?? preview.totalPayable} highlight />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <SmallField label="Extra bonus this cycle (₹)" value={bonusAmount} onChange={setBonusAmount} />
                  <SmallField label="Deduction this cycle (₹)" value={deductionAmount} onChange={setDeductionAmount} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                  <input
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={onPay}
                    disabled={busyAction === 'pay' || config.isOnHold}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
                    title={config.isOnHold ? 'Release the hold first' : 'Pay this cycle'}
                  >
                    {busyAction === 'pay' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Pay this cycle
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

const SmallField: FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
    />
  </div>
)

const PreviewRow: FC<{ label: string; value?: number | null; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className={`flex items-center justify-between ${highlight ? 'pt-1 border-t border-gray-200 font-semibold text-gray-900' : 'text-gray-700'}`}>
    <span>{label}</span>
    <span>{value != null ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value / 100) : '—'}</span>
  </div>
)

// ── helpers ────────────────────────────────────────────────────────────
const toRupeesString = (paise?: number | null): string =>
  paise == null ? '' : String(Math.round(paise / 100))

const rupeesToPaise = (rupees: string): number | undefined => {
  if (rupees == null || rupees.trim() === '') return undefined
  const n = Number(rupees)
  if (Number.isNaN(n)) return undefined
  return Math.round(n * 100)
}

const Field: FC<{
  label: string
  name: string
  value: string
  type?: string
  required?: boolean
  placeholder?: string
  icon?: React.ReactNode
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}> = ({ label, name, value, onChange, type = 'text', required, placeholder, icon }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700">{label}{required && ' *'}</label>
    <div className="relative mt-1">
      {icon && (
        <span className="absolute inset-y-0 left-2 flex items-center pointer-events-none">{icon}</span>
      )}
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className={`block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm ${icon ? 'pl-7' : ''}`}
      />
    </div>
  </div>
)

export default OrganizationLawyersPage
