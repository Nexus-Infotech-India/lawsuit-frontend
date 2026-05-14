import { FC, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Check, Loader2, ArrowRight, Upload, FileCheck2, IdCard,
  Briefcase, MapPin, ShieldCheck, Sparkles, AlertCircle,
} from 'lucide-react'
import {
  lawyersApi,
  usersApi,
  courtAdminApi,
} from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import AddressPicker from '@/components/molecules/AddressPicker'
import { pickCloudinaryResourceType } from '@/utils/cloudinaryUpload'

interface LawyerInfoShape {
  licenseNumber?: string
  barCouncilId?: string
  licenseProofUrl?: string
  barCouncilProofUrl?: string
  specializations?: string[]
  languages?: string[]
  experienceYears?: number
  feePerConsultation?: number
  bio?: string
  city?: string
  state?: string
  district?: string
  pincode?: string
  address?: string
}

const SPECIALIZATIONS = [
  'Civil', 'Criminal', 'Corporate', 'Family', 'Property', 'Tax',
  'Labour', 'Constitutional', 'Cyber', 'IP', 'Banking', 'Consumer',
]

const LANGUAGES = [
  'English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Marathi',
  'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu', 'Odia',
]

const STEPS = [
  { id: 1, label: 'Identity', icon: IdCard },
  { id: 2, label: 'License & Bar', icon: FileCheck2 },
  { id: 3, label: 'Practice', icon: Briefcase },
  { id: 4, label: 'Location', icon: MapPin },
  { id: 5, label: 'Verification', icon: ShieldCheck },
] as const

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

interface CourtAdminOption {
  id: string
  name?: string
  court?: { name?: string; pincode?: string }
}

const LawyerOnboardingPage: FC = () => {
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user) as any

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [info, setInfo] = useState<LawyerInfoShape>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLicense, setUploadingLicense] = useState(false)
  const [uploadingBar, setUploadingBar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneToast, setDoneToast] = useState<string | null>(null)

  // Step 5 — court admins by pincode
  const [adminOptions, setAdminOptions] = useState<CourtAdminOption[]>([])
  const [pickedAdminId, setPickedAdminId] = useState('')
  const [submittingVerification, setSubmittingVerification] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'submitted' | 'failed'>('idle')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await usersApi.getLawyerInformation()
        const raw = (res as any).data?.data ?? (res as any).data ?? {}
        const payload = raw.lawyer ?? raw
        setInfo(payload)
      } catch {
        // first-time onboarding ok
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Pull eligible court admins when entering Step 5. We try the pincode
  // first (most-specific) and fall back to the district-wide list when
  // the pincode returns nothing — a single pincode covers a tiny slice of
  // a district, so without this fallback most lawyers see an empty list
  // and can't pick anyone to send their verification to. Mirrors the
  // mobile `LawyerVerificationRequestScreen` discovery pattern.
  useEffect(() => {
    if (step !== 5) return
    if (!info.pincode && !info.district) return
    let cancelled = false
    ;(async () => {
      try {
        let data: CourtAdminOption[] = []
        if (info.pincode) {
          const res = await courtAdminApi.getAdminsByPincode(info.pincode)
          const list = ((res as any).data?.data ?? (res as any).data ?? []) as CourtAdminOption[]
          data = Array.isArray(list) ? list : []
        }
        if (data.length === 0 && info.district) {
          const res = await courtAdminApi.getAdminsByDistrict(info.district, info.state)
          const list = ((res as any).data?.data ?? (res as any).data ?? []) as CourtAdminOption[]
          data = Array.isArray(list) ? list : []
        }
        if (!cancelled) setAdminOptions(data)
      } catch {
        if (!cancelled) setAdminOptions([])
      }
    })()
    return () => { cancelled = true }
  }, [step, info.pincode, info.district, info.state])

  const update = (patch: Partial<LawyerInfoShape>) => setInfo((s) => ({ ...s, ...patch }))

  const showToast = (msg: string) => {
    setDoneToast(msg)
    setTimeout(() => setDoneToast(null), 2500)
  }

  const persist = async () => {
    setSaving(true)
    setError(null)
    try {
      await usersApi.postLawyerInformation(info)
      showToast('Saved')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save')
      throw err
    } finally {
      setSaving(false)
    }
  }

  const uploadLicenseProof = async (file: File, kind: 'license' | 'bar') => {
    if (kind === 'license') setUploadingLicense(true); else setUploadingBar(true)
    setError(null)
    try {
      // Get Cloudinary signed-upload params from /lawyers/apply
      const sigRes = await lawyersApi.apply({
        fileName: file.name,
        fileType: file.type,
        userId: authUser?.id,
      })
      const sig = (sigRes.data?.data ?? sigRes.data) as {
        timestamp: number
        signature: string
        cloudName: string
        apiKey: string
        folder: string
      }
      if (!sig?.signature) throw new Error('Signature unavailable')

      const formData = new FormData()
      formData.append('file', file)
      formData.append('timestamp', String(sig.timestamp))
      formData.append('signature', sig.signature)
      formData.append('api_key', sig.apiKey)
      formData.append('folder', sig.folder)

      // `pickCloudinaryResourceType` lives in the shared upload util.
      // It puts images AND PDFs on /image/upload — PDFs in particular
      // need this so Cloudinary serves them with
      // `Content-Type: application/pdf` (otherwise the court admin's
      // verify page opens the URL and sees "Failed to load PDF document").
      const resourceType = pickCloudinaryResourceType(file.type)
      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`,
        { method: 'POST', body: formData },
      )
      if (!cloudRes.ok) throw new Error('Cloudinary upload failed')
      const cloudData = await cloudRes.json()
      const url: string = cloudData.secure_url || cloudData.url
      if (!url) throw new Error('Upload returned no URL')

      const patch = kind === 'license' ? { licenseProofUrl: url } : { barCouncilProofUrl: url }
      const next = { ...info, ...patch }
      setInfo(next)
      await usersApi.postLawyerInformation(next)
      showToast(`${kind === 'license' ? 'License' : 'Bar council'} proof uploaded`)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Upload failed')
    } finally {
      if (kind === 'license') setUploadingLicense(false); else setUploadingBar(false)
    }
  }

  const submitVerification = async () => {
    if (!pickedAdminId) {
      setError('Pick a court admin to send your application to')
      return
    }
    setSubmittingVerification(true)
    setError(null)
    try {
      await courtAdminApi.requestVerification(pickedAdminId)
      setVerificationStatus('submitted')
      showToast('Verification request submitted')
    } catch (err: any) {
      setVerificationStatus('failed')
      setError(err?.response?.data?.error || 'Failed to submit verification request')
    } finally {
      setSubmittingVerification(false)
    }
  }

  const goNext = async () => {
    try {
      // Persist profile data before advancing (steps 1–4)
      if (step <= 4) await persist()
      setStep((s) => (Math.min(5, s + 1) as any))
    } catch {
      /* error already shown */
    }
  }

  const toggleArrayItem = (key: 'specializations' | 'languages', item: string) => {
    const set = new Set<string>(info[key] || [])
    if (set.has(item)) set.delete(item); else set.add(item)
    update({ [key]: Array.from(set) })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lawyer onboarding</h1>
          <p className="text-sm text-gray-500">Complete your profile and submit for verification.</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const isDone = step > s.id
          const isActive = step === s.id
          return (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <button
                onClick={() => setStep(s.id as any)}
                className={`flex items-center gap-2 ${isActive ? 'text-primary' : isDone ? 'text-green-600' : 'text-gray-400'}`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isActive ? 'bg-primary text-white' : isDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 ${isDone ? 'bg-green-200' : 'bg-gray-100'}`} />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Identity</h2>
            <p className="text-sm text-gray-500">Confirm your name and contact. These come from your sign-up account.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                <input
                  value={authUser?.name || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  value={authUser?.email || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Need to fix these? Use the{' '}
              <Link to="/lawyer/profile" className="text-primary hover:underline">profile page</Link>.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">License & bar council</h2>
            <p className="text-sm text-gray-500">Required so a court admin can verify you.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">License number</label>
                <input
                  value={info.licenseNumber || ''}
                  onChange={(e) => update({ licenseNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Bar council ID</label>
                <input
                  value={info.barCouncilId || ''}
                  onChange={(e) => update({ barCouncilId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <UploadField
                label="License proof"
                existingUrl={info.licenseProofUrl}
                uploading={uploadingLicense}
                onPick={(file) => uploadLicenseProof(file, 'license')}
              />
              <UploadField
                label="Bar council proof"
                existingUrl={info.barCouncilProofUrl}
                uploading={uploadingBar}
                onPick={(file) => uploadLicenseProof(file, 'bar')}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Practice</h2>
            <p className="text-sm text-gray-500">Helps clients find the right lawyer.</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Specializations</label>
              <div className="flex flex-wrap gap-2">
                {SPECIALIZATIONS.map((s) => {
                  const active = info.specializations?.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleArrayItem('specializations', s)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${active
                        ? 'bg-primary text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Languages</label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => {
                  const active = info.languages?.includes(l)
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => toggleArrayItem('languages', l)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${active
                        ? 'bg-primary text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                    >
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Experience (years)</label>
                <input
                  type="number"
                  min={0}
                  value={info.experienceYears ?? ''}
                  onChange={(e) => update({ experienceYears: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fee per consultation (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={info.feePerConsultation ?? ''}
                  onChange={(e) => update({ feePerConsultation: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                {info.feePerConsultation != null && (
                  <p className="text-xs text-gray-400 mt-1">{fmt(info.feePerConsultation)} per session</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bio</label>
              <textarea
                rows={4}
                value={info.bio || ''}
                onChange={(e) => update({ bio: e.target.value })}
                placeholder="Tell clients about your practice, areas of focus, and notable cases."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Office location</h2>
            <p className="text-sm text-gray-500">Used for proximity search and to map you to a court admin.</p>
            {/* AddressPicker centralises pincode → state/district/city
                resolution (and shows a locality picker when the pincode
                maps to multiple post offices). District is captured so
                Step 5 can fall back to the wider district-based court-
                admin list when the pincode-narrow list is empty. */}
            <AddressPicker
              value={{
                pincode: info.pincode,
                state: info.state,
                district: info.district,
                city: info.city,
              }}
              onChange={(next) =>
                update({
                  pincode: next.pincode,
                  state: next.state,
                  district: next.district,
                  city: next.city,
                })
              }
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Street address</label>
              <input
                value={info.address || ''}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="Building, street, landmark"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Submit for verification</h2>
            <p className="text-sm text-gray-500">
              Pick a court admin in your pincode. They'll review your license and bar council proofs.
            </p>
            {!info.pincode && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm">
                Set your pincode in step 4 first.
              </div>
            )}
            {info.pincode && adminOptions.length === 0 && (
              <div className="bg-blue-50 border border-blue-100 text-blue-800 px-3 py-2 rounded-lg text-sm">
                No court admins are mapped to pincode {info.pincode} yet. Try a nearby pincode or contact platform support.
              </div>
            )}
            {adminOptions.length > 0 && (
              <div className="space-y-2">
                {adminOptions.map((a) => (
                  <label
                    key={a.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${pickedAdminId === a.id
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <input
                      type="radio"
                      name="admin"
                      checked={pickedAdminId === a.id}
                      onChange={() => setPickedAdminId(a.id)}
                      className="text-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{a.name || 'Court admin'}</div>
                      {a.court?.name && (
                        <div className="text-xs text-gray-500">{a.court.name}{a.court.pincode ? ` · ${a.court.pincode}` : ''}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {verificationStatus === 'submitted' ? (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
                <div>
                  <strong>Submitted.</strong> You'll be notified when the court admin makes a decision.
                  <div className="mt-2">
                    <button
                      onClick={() => navigate('/lawyer/dashboard')}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Go to dashboard →
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={submitVerification}
                disabled={!pickedAdminId || submittingVerification}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {submittingVerification ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {submittingVerification ? 'Submitting…' : 'Submit verification request'}
              </button>
            )}
          </div>
        )}

        {/* Footer nav */}
        {step < 5 && (
          <div className="flex justify-between items-center pt-6 mt-6 border-t border-gray-100">
            <button
              onClick={() => setStep((s) => (Math.max(1, s - 1) as any))}
              disabled={step === 1}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={goNext}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Saving…' : (
                <>
                  Save & continue <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {doneToast && (
        <div className="fixed right-6 bottom-6 z-50">
          <div className="px-5 py-3 rounded-xl shadow-lg bg-green-600 text-white text-sm flex items-center gap-2">
            <Check className="w-4 h-4" /> {doneToast}
          </div>
        </div>
      )}
    </div>
  )
}

interface UploadFieldProps {
  label: string
  existingUrl?: string
  uploading: boolean
  onPick: (file: File) => void
}

const UploadField: FC<UploadFieldProps> = ({ label, existingUrl, uploading, onPick }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
    <div className="flex items-center gap-2">
      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 cursor-pointer">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? 'Uploading…' : existingUrl ? 'Replace' : 'Upload'}
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onPick(file)
            e.target.value = ''
          }}
        />
      </label>
      {existingUrl && (
        <a href={existingUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
          View current
        </a>
      )}
    </div>
  </div>
)

export default LawyerOnboardingPage
