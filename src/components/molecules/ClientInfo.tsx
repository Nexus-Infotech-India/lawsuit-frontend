import React, { useEffect, useState } from 'react'
import { usersApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { 
  MapPin, 
  User, 
  FileText, 
  Edit3, 
  X, 
  Save,
  Loader2,
  ExternalLink,
  Calendar,
  Wallet
} from 'lucide-react'

type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY'
type Caste = 'GENERAL' | 'OBC' | 'SC' | 'ST' | 'EWS' | 'OTHER'

const genderOptions: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: "Prefer not to say" },
]

const casteOptions: { value: Caste; label: string }[] = [
  { value: 'GENERAL', label: 'General' },
  { value: 'OBC', label: 'OBC' },
  { value: 'SC', label: 'SC' },
  { value: 'ST', label: 'ST' },
  { value: 'EWS', label: 'EWS' },
  { value: 'OTHER', label: 'Other' },
]

interface ClientInfoShape {
  city?: string
  state?: string
  country?: string
  pincode?: string
  dob?: string
  gender?: Gender
  income?: number
  incomeProofUrl?: string
  caste?: Caste
  casteProofUrl?: string
}

const normalizeResponse = (data: any): ClientInfoShape => {
  const raw = data?.data ?? data ?? {}
  const payload = raw.client ?? raw
  return { ...payload }
}

const ClientInfo: React.FC = () => {
  const authUser = useAuthStore((s) => s.user)
  const userId = authUser?.id

  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [initial, setInitial] = useState<ClientInfoShape>({})

  const [form, setForm] = useState<ClientInfoShape>({})
  const [incomeFile, setIncomeFile] = useState<File | null>(null)
  const [casteFile, setCasteFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await usersApi.getClientInformation()
        const data = (res as any).data ?? res
        const normalized = normalizeResponse(data)
        setInitial(normalized)
        setForm(normalized)
      } catch (err) {
        console.error('Failed to load client info', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const onChange = (k: keyof ClientInfoShape, v: any) => {
    setForm((s) => ({ ...s, [k]: v }))
  }

  const uploadFileToPresigned = async (file: File): Promise<string | null> => {
    if (!userId) throw new Error('No user id')
    try {
      // usersApi.getPresignedUrl returns { upload: { uploadUrl, fileUrl, method } }
      const resp = await usersApi.getPresignedUrl(userId, { fileName: file.name, mimeType: file.type, size: file.size })
      const body = (resp as any).data ?? resp
      const upload = body.upload || body || {}
      const uploadUrl: string = upload.uploadUrl || upload.upload_url || upload.uploadUrl
      const fileUrl: string = upload.fileUrl || upload.file_url || upload.fileUrl
      if (!uploadUrl) throw new Error('No upload url')

      // PUT the file to S3 presigned url
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          "x-amz-acl": "public-read"
        },
        body: file,
      })

      return fileUrl || null
    } catch (err) {
      console.error('Upload failed', err)
      throw err
    }
  }

  const onSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    // validation: if income or caste changed, require corresponding proof
    const incomeChanged = (initial.income ?? null) !== (form.income ?? null)
    const casteChanged = (initial.caste ?? null) !== (form.caste ?? null)

    if (incomeChanged && !incomeFile && !form.incomeProofUrl) {
      alert('Income proof is required when income is changed')
      return
    }
    if (casteChanged && !casteFile && !form.casteProofUrl) {
      alert('Caste proof is required when caste is changed')
      return
    }

    setSubmitting(true)
    try {
      const payload: any = { ...form }

      if (incomeFile) {
        const url = await uploadFileToPresigned(incomeFile)
        if (url) payload.incomeProofUrl = url
      }
      if (casteFile) {
        const url = await uploadFileToPresigned(casteFile)
        if (url) payload.casteProofUrl = url
      }

      await usersApi.postClientInformation(payload)
      
      // Re-fetch to get updated data
      const res = await usersApi.getClientInformation()
      const data = (res as any).data ?? res
      const normalized = normalizeResponse(data)
      
      setInitial(normalized)
      setForm(normalized)
      setEditing(false)
      setIncomeFile(null)
      setCasteFile(null)
    } catch (err) {
      console.error('Failed to save client info', err)
      alert('Failed to save client info')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    setForm(initial)
    setEditing(false)
    setIncomeFile(null)
    setCasteFile(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-gray-600">Loading...</span>
      </div>
    )
  }

  const inputClasses = `w-full px-4 py-2.5 border-2 rounded-lg transition-colors
    ${editing 
      ? 'border-gray-200 bg-white focus:border-primary focus:outline-none' 
      : 'border-transparent bg-gray-50 text-gray-700 cursor-default'
    }`

  const selectClasses = `w-full px-4 py-2.5 border-2 rounded-lg transition-colors appearance-none
    ${editing 
      ? 'border-gray-200 bg-white focus:border-primary focus:outline-none cursor-pointer' 
      : 'border-transparent bg-gray-50 text-gray-700 cursor-default'
    }`

  const labelClasses = "block text-sm font-medium text-midnight mb-1.5"

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-midnight">Personal Information</h3>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button 
                type="button"
                onClick={handleCancel} 
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button 
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-midnight transition-colors disabled:opacity-60"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button 
              onClick={() => setEditing(true)} 
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary border-2 border-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              Edit Profile
            </button>
          )}
        </div>
      </div>

      <form className="p-6 space-y-8" onSubmit={onSubmit}>
        {/* Personal Details Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-primary" />
            <h4 className="text-base font-semibold text-midnight">Personal Details</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClasses}>Date of Birth</label>
              <input 
                disabled={!editing} 
                type="date" 
                value={form.dob ? form.dob.split('T')[0] : ''} 
                onChange={(e) => onChange('dob', e.target.value)} 
                className={inputClasses}
              />
            </div>
            <div>
              <label className={labelClasses}>Gender</label>
              <select 
                disabled={!editing} 
                value={form.gender || ''} 
                onChange={(e) => onChange('gender', e.target.value || undefined)} 
                className={selectClasses}
              >
                <option value="">Select gender</option>
                {genderOptions.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Location Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-primary" />
            <h4 className="text-base font-semibold text-midnight">Location</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClasses}>City</label>
              <input 
                disabled={!editing} 
                value={form.city || ''} 
                onChange={(e) => onChange('city', e.target.value)} 
                className={inputClasses}
                placeholder="e.g. Mumbai"
              />
            </div>
            <div>
              <label className={labelClasses}>State</label>
              <input 
                disabled={!editing} 
                value={form.state || ''} 
                onChange={(e) => onChange('state', e.target.value)} 
                className={inputClasses}
                placeholder="e.g. Maharashtra"
              />
            </div>
            <div>
              <label className={labelClasses}>Country</label>
              <input 
                disabled={!editing} 
                value={form.country || ''} 
                onChange={(e) => onChange('country', e.target.value)} 
                className={inputClasses}
                placeholder="e.g. India"
              />
            </div>
            <div>
              <label className={labelClasses}>Pincode</label>
              <input 
                disabled={!editing} 
                value={form.pincode || ''} 
                onChange={(e) => onChange('pincode', e.target.value)} 
                className={inputClasses}
                placeholder="e.g. 400001"
              />
            </div>
          </div>
        </section>

        {/* Financial & Category Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-primary" />
            <h4 className="text-base font-semibold text-midnight">Financial & Category Information</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClasses}>Annual Income (₹)</label>
              <input 
                disabled={!editing} 
                type="number" 
                value={form.income ?? ''} 
                onChange={(e) => onChange('income', e.target.value ? Number(e.target.value) : undefined)} 
                className={inputClasses}
                placeholder="e.g. 500000"
              />
            </div>
            <div>
              <label className={labelClasses}>Income Proof</label>
              {form.incomeProofUrl && !editing ? (
                <a 
                  href={form.incomeProofUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Document
                </a>
              ) : editing ? (
                <input 
                  type="file" 
                  accept="image/*,application/pdf" 
                  onChange={(e) => setIncomeFile(e.target.files?.[0] ?? null)} 
                  className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg text-sm text-gray-500">No document uploaded</div>
              )}
            </div>
            <div>
              <label className={labelClasses}>Category</label>
              <select 
                disabled={!editing} 
                value={form.caste || ''} 
                onChange={(e) => onChange('caste', e.target.value || undefined)} 
                className={selectClasses}
              >
                <option value="">Select category</option>
                {casteOptions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClasses}>Category Certificate</label>
              {form.casteProofUrl && !editing ? (
                <a 
                  href={form.casteProofUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Document
                </a>
              ) : editing ? (
                <input 
                  type="file" 
                  accept="image/*,application/pdf" 
                  onChange={(e) => setCasteFile(e.target.files?.[0] ?? null)} 
                  className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg text-sm text-gray-500">No document uploaded</div>
              )}
            </div>
          </div>
        </section>
      </form>
    </div>
  )
}

export default ClientInfo
