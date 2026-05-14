import { FC, useEffect, useState } from 'react'
import { Loader2, Save, ShieldCheck } from 'lucide-react'
import { useCourtAdminStore } from '../../stores/courtAdminStore'
import { courtAdminApi } from '@/services/api'
import { friendlyError } from '@/utils/errors'
import UploadInput from '@/components/atoms/UploadButton'
import AddressPicker from '@/components/molecules/AddressPicker'

/**
 * Court admin profile + court details editor.
 *
 * Mirrors the mobile `EditCourtAdminProfileScreen` end-to-end:
 *   • personal info (name / phone / avatar / registration number)
 *   • court details (name / type / address / pincode / state / district / city)
 *
 * Replaces the earlier "Settings Coming Soon" stub — `courtAdminApi.updateMe`
 * and `updateMyCourt` were already wired but no UI surfaced them.
 *
 * Loads via `/court-admin/me`, which returns `{ user, court }`. Saves go to
 * `/court-admin/me` (admin fields) and `/court-admin/me/court` (court fields)
 * independently so a partial edit on one half doesn't blow away the other.
 */
const CourtAdminProfilePage: FC = () => {
  const { user, logout } = useCourtAdminStore()

  // Admin fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [registrationNumber, setRegistrationNumber] = useState('')

  // Court fields
  const [courtName, setCourtName] = useState('')
  const [courtType, setCourtType] = useState('')
  const [courtAddress, setCourtAddress] = useState('')
  const [courtPincode, setCourtPincode] = useState('')
  const [courtState, setCourtState] = useState('')
  const [courtDistrict, setCourtDistrict] = useState('')
  const [courtCity, setCourtCity] = useState('')

  const [loading, setLoading] = useState(true)
  const [savingAdmin, setSavingAdmin] = useState(false)
  const [savingCourt, setSavingCourt] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Hydrate the form from `/court-admin/me`. Falls back to `user` from the
  // auth store for name/avatar so the inputs aren't empty during the round-
  // trip — server values overwrite once they arrive.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await courtAdminApi.getMe()
        const data = (res as any).data ?? res
        const me = data.user ?? data.admin ?? data
        const court = data.court ?? data.user?.court ?? null
        if (cancelled) return
        setName(me?.name ?? '')
        setEmail(me?.email ?? '')
        setPhone(me?.phone ?? '')
        setAvatarUrl(me?.avatarUrl ?? null)
        setRegistrationNumber(me?.registrationNumber ?? '')
        if (court) {
          setCourtName(court.name ?? '')
          setCourtType(court.type ?? '')
          setCourtAddress(court.address ?? '')
          setCourtPincode(court.pincode ?? '')
          setCourtState(court.state ?? '')
          setCourtDistrict(court.district ?? '')
          setCourtCity(court.city ?? '')
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err, "We couldn't load your profile."))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const saveAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAdmin(true)
    setError(null)
    try {
      await courtAdminApi.updateMe({
        name: name || undefined,
        phone: phone || undefined,
        avatarUrl: avatarUrl ?? undefined,
        registrationNumber: registrationNumber || undefined,
      })
      showToast('Profile updated')
    } catch (err) {
      setError(friendlyError(err, "We couldn't save your profile."))
    } finally {
      setSavingAdmin(false)
    }
  }

  const saveCourt = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingCourt(true)
    setError(null)
    try {
      await courtAdminApi.updateMyCourt({
        name: courtName || undefined,
        type: courtType || undefined,
        address: courtAddress || undefined,
        pincode: courtPincode || undefined,
        state: courtState || undefined,
        district: courtDistrict || undefined,
        city: courtCity || undefined,
      })
      showToast('Court details updated')
    } catch (err) {
      setError(friendlyError(err, "We couldn't save the court details."))
    } finally {
      setSavingCourt(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <Loader2 className="w-7 h-7 mx-auto text-indigo-600 animate-spin" />
        <p className="mt-3 text-sm text-gray-500">Loading your profile…</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <button
          onClick={() => logout()}
          className="text-sm text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md transition-colors"
        >
          Sign Out
        </button>
      </div>

      {toast && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Personal details */}
      <form onSubmit={saveAdmin} className="bg-white shadow-sm border border-gray-100 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Personal details</h2>
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800">
            {user?.role === 'COURT_ADMIN' ? 'Court Admin' : user?.role}
          </span>
        </div>

        <div className="flex items-start gap-5">
          {/* Avatar uploader (Cloudinary signed) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Photo</label>
            <UploadInput
              imageUrl={avatarUrl}
              setImageUrl={(url) =>
                setAvatarUrl(typeof url === 'function' ? url(avatarUrl) : url)
              }
              width="fixed"
              // Profile photo — restrict the OS file picker to images so
              // the user can't pick a PDF/DOCX that won't render as an
              // avatar anyway. Mirrors the other profile pages.
              accept="image/*"
            />
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full name" value={name} onChange={setName} required />
            <Field label="Email" value={email} onChange={() => { /* immutable */ }} disabled />
            <Field label="Phone" value={phone} onChange={setPhone} />
            <Field label="Registration number" value={registrationNumber} onChange={setRegistrationNumber} />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingAdmin}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {savingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save personal details
          </button>
        </div>
      </form>

      {/* Court details */}
      <form onSubmit={saveCourt} className="bg-white shadow-sm border border-gray-100 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Court details</h2>
        <p className="text-sm text-gray-500 -mt-2">
          Lawyers and organizations submit verification requests to this court based on the address details here.
          Keeping these accurate helps requests reach you.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Court name" value={courtName} onChange={setCourtName} />
          <Field label="Court type" value={courtType} onChange={setCourtType} placeholder="District / High Court / Tribunal …" />
          <div className="sm:col-span-2">
            <Field label="Address" value={courtAddress} onChange={setCourtAddress} />
          </div>
        </div>

        {/* AddressPicker handles pincode → state/district/city auto-fill
            (and, for metros, surfaces a locality picker when one pincode
            maps to multiple post offices). */}
        <AddressPicker
          value={{ pincode: courtPincode, state: courtState, district: courtDistrict, city: courtCity }}
          onChange={(next) => {
            setCourtPincode(next.pincode || '')
            setCourtState(next.state || '')
            setCourtDistrict(next.district || '')
            setCourtCity(next.city || '')
          }}
        />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingCourt}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {savingCourt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save court details
          </button>
        </div>
      </form>
    </div>
  )
}

const Field: FC<{
  label: string
  value: string
  onChange: (next: string) => void
  required?: boolean
  disabled?: boolean
  placeholder?: string
}> = ({ label, value, onChange, required, disabled, placeholder }) => (
  <div>
    <label className="block text-xs font-medium text-gray-700 mb-1">
      {label}
      {required && <span className="text-red-500"> *</span>}
    </label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
    />
  </div>
)

export default CourtAdminProfilePage
