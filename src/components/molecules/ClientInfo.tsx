import React, { useEffect, useState } from 'react'
import { usersApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

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
        const payload = data.client ?? data ?? {}
        setInitial(payload)
        setForm(payload)
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
      // refresh
      const res = await usersApi.getClientInformation()
      const data = (res as any).data ?? res
      const payload2 = data.client ?? data ?? {}
      setInitial(payload2)
      setForm(payload2)
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

  if (loading) return <div className="p-4">Loading…</div>

  return (
    <div className="bg-white rounded p-4 relative">
      <div className="flex items-start justify-end">
        {/* <h3 className="text-lg font-semibold">Client Information</h3> */}
        <div>
          <button
            onClick={() => setEditing((s) => !s)}
            className="text-sm px-3 py-1 border rounded bg-gray-50 hover:bg-gray-100"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      <form className="mt-4 space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">City</label>
            <input disabled={!editing} value={form.city || ''} onChange={(e) => onChange('city', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">State</label>
            <input disabled={!editing} value={form.state || ''} onChange={(e) => onChange('state', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Country</label>
            <input disabled={!editing} value={form.country || ''} onChange={(e) => onChange('country', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Pincode</label>
            <input disabled={!editing} value={form.pincode || ''} onChange={(e) => onChange('pincode', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Date of birth</label>
            <input disabled={!editing} type="date" value={form.dob ? form.dob.split('T')[0] : ''} onChange={(e) => onChange('dob', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Gender</label>
            <select disabled={!editing} value={form.gender || ''} onChange={(e) => onChange('gender', e.target.value || undefined)} className="mt-1 block w-full border rounded px-3 py-2">
              <option value="">Select</option>
              {genderOptions.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Income</label>
            <input disabled={!editing} type="number" value={form.income ?? ''} onChange={(e) => onChange('income', e.target.value ? Number(e.target.value) : undefined)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Caste</label>
            <select disabled={!editing} value={form.caste || ''} onChange={(e) => onChange('caste', e.target.value || undefined)} className="mt-1 block w-full border rounded px-3 py-2">
              <option value="">Select</option>
              {casteOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Income proof</label>
            {form.incomeProofUrl && !editing && (
              <div className="mt-1">
                <a href={form.incomeProofUrl} target="_blank" rel="noreferrer" className="text-primary underline">View uploaded proof</a>
              </div>
            )}
            {editing && (
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setIncomeFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full" />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">Caste proof</label>
            {form.casteProofUrl && !editing && (
              <div className="mt-1">
                <a href={form.casteProofUrl} target="_blank" rel="noreferrer" className="text-primary underline">View uploaded proof</a>
              </div>
            )}
            {editing && (
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setCasteFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full" />
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={!editing || submitting} className="px-4 py-2 bg-primary text-white rounded disabled:opacity-60">
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ClientInfo
