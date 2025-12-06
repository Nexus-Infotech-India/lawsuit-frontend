import React, { useEffect, useState } from 'react'
import { usersApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

interface EducationEntry {
  university?: string
  course?: string
  startYear?: string
  completionYear?: string
  certificateUrl?: string
}

interface ExperienceEntry {
  title?: string
  organisation?: string
  from?: string
  to?: string
}

interface LawyerInfoShape {
  licenseNumber?: string
  licenseProofUrl?: string
  barCouncilId?: string
  barCouncilProofUrl?: string
  barCouncil?: string
  experienceYears?: number
  exprience?: ExperienceEntry[]
  languages?: string[]
  bio?: string
  education?: EducationEntry[]
  city?: string
  state?: string
  pincode?: string
  address?: string
}

const parseArrayInput = (value?: string) => {
  if (!value) return []
  // split by newline or comma
  return value.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)
}

const joinArrayForInput = (arr?: string[]) => (arr ? arr.join('\n') : '')

const LawyerInfo: React.FC = () => {
  const authUser = useAuthStore((s) => s.user)
  const userId = authUser?.id

  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [initial, setInitial] = useState<LawyerInfoShape>({})

  const [form, setForm] = useState<LawyerInfoShape>({})
  const [licenseFile, setLicenseFile] = useState<File | null>(null)
  const [barCouncilFile, setBarCouncilFile] = useState<File | null>(null)
  const [educationFiles, setEducationFiles] = useState<(File | null)[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await usersApi.getLawyerInformation()
        const data = (res as any).data ?? res
        // Backend sometimes wraps response in { lawyer: { ... } }
        const raw = data.data ?? data ?? {}
        const payload = raw.lawyer ?? raw
        // prefer 'experience' key from backend but also accept 'exprience'
        const rawExperience = payload.experience ?? payload.exprience
        const rawEducation = payload.education
        // normalize arrays into our object shapes
        const normalized: LawyerInfoShape = {
          ...payload,
          exprience: Array.isArray(rawExperience)
            ? rawExperience.map((e: any) => (typeof e === 'string' ? { title: e } : e))
            : rawExperience
              ? (typeof rawExperience === 'string' ? [{ title: rawExperience }] : [rawExperience])
              : [],
          education: Array.isArray(rawEducation)
            ? rawEducation.map((ed: any) => (typeof ed === 'string' ? { course: ed } : ed))
            : rawEducation
              ? (typeof rawEducation === 'string' ? [{ course: rawEducation }] : [rawEducation])
              : [],
          languages: Array.isArray(payload.languages) ? payload.languages : (payload.languages ? payload.languages.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
        }
        setInitial(normalized)
        setForm(normalized)
        setEducationFiles((normalized.education || []).map(() => null))
      } catch (err) {
        console.error('Failed to load lawyer info', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const onChange = (k: keyof LawyerInfoShape, v: any) => setForm((s) => ({ ...s, [k]: v }))

  const updateEducation = (index: number, patch: Partial<EducationEntry>) => {
    setForm((s) => {
      const list = (s.education || []).slice()
      list[index] = { ...(list[index] || {}), ...patch }
      return { ...s, education: list }
    })
  }

  const addEducation = () => {
    setForm((s) => ({ ...s, education: [...(s.education || []), {}] }))
    setEducationFiles((f) => [...f, null])
  }

  const removeEducation = (index: number) => {
    setForm((s) => ({ ...s, education: (s.education || []).filter((_, i) => i !== index) }))
    setEducationFiles((f) => f.filter((_, i) => i !== index))
  }

  const updateExperience = (index: number, patch: Partial<ExperienceEntry>) => {
    setForm((s) => {
      const list = (s.exprience || []).slice()
      list[index] = { ...(list[index] || {}), ...patch }
      return { ...s, exprience: list }
    })
  }

  const addExperience = () => setForm((s) => ({ ...s, exprience: [...(s.exprience || []), {}] }))

  const removeExperience = (index: number) => setForm((s) => ({ ...s, exprience: (s.exprience || []).filter((_, i) => i !== index) }))

  const uploadFileToPresigned = async (file: File) => {
    if (!userId) throw new Error('No user id')
    try {
      const resp = await usersApi.getPresignedUrl(userId, { fileName: file.name, mimeType: file.type, size: file.size })
      const body = (resp as any).data ?? resp
      const upload = body.upload || body || {}
      const uploadUrl: string = upload.uploadUrl || upload.upload_url || upload.uploadUrl
      const fileUrl: string = upload.fileUrl || upload.file_url || upload.fileUrl
      if (!uploadUrl) throw new Error('No upload url')
      await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
      return fileUrl || null
    } catch (err) {
      console.error('Upload failed', err)
      throw err
    }
  }

  const onSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSubmitting(true)
    try {
  const payload: any = { ...form }
      // ensure arrays of objects
  payload.education = Array.isArray(form.education) ? form.education : []
  // send to backend using 'experience' key (backend may expect this) and also include exprience for compatibility
  payload.experience = Array.isArray(form.exprience) ? form.exprience : []
  payload.exprience = Array.isArray(form.exprience) ? form.exprience : []
      payload.languages = Array.isArray(form.languages) ? form.languages : parseArrayInput((form.languages as any)?.toString?.())

      // upload per-education certificates if present
      if (educationFiles && educationFiles.length) {
        for (let i = 0; i < educationFiles.length; i++) {
          const f = educationFiles[i]
          if (f) {
            const url = await uploadFileToPresigned(f)
            if (url) {
              payload.education = payload.education || []
              payload.education[i] = { ...(payload.education[i] || {}), certificateUrl: url }
            }
          }
        }
      }

      if (licenseFile) {
        const url = await uploadFileToPresigned(licenseFile)
        if (url) payload.licenseProofUrl = url
      }
      if (barCouncilFile) {
        const url = await uploadFileToPresigned(barCouncilFile)
        if (url) payload.barCouncilProofUrl = url
      }

      await usersApi.postLawyerInformation(payload)
      const res = await usersApi.getLawyerInformation()
      const data = (res as any).data ?? res
      const payload2 = data.data ?? data ?? {}
      const normalized: LawyerInfoShape = {
        ...payload2,
        exprience: Array.isArray(payload2.exprience) ? payload2.exprience : (payload2.exprience ? [payload2.exprience] : []),
        education: Array.isArray(payload2.education) ? payload2.education : (payload2.education ? [payload2.education] : []),
        languages: Array.isArray(payload2.languages) ? payload2.languages : (payload2.languages ? payload2.languages.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
      }
      setInitial(normalized)
      setForm(normalized)
      setEditing(false)
      setLicenseFile(null)
      setBarCouncilFile(null)
  setEducationFiles((normalized.education || []).map(() => null))
    } catch (err) {
      console.error('Failed to save lawyer info', err)
      alert('Failed to save lawyer info')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-4">Loading…</div>

  return (
    <div className="bg-white rounded p-4 relative">
      <div className="flex items-start justify-end">
        {/* <h3 className="text-lg font-semibold">Lawyer Information</h3> */}
        <div>
          <button onClick={() => setEditing((s) => !s)} className="text-sm px-3 py-1 border rounded bg-gray-50 hover:bg-gray-100">{editing ? 'Cancel' : 'Edit'}</button>
        </div>
      </div>

      <form className="mt-4 space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">License Number</label>
            <input disabled={!editing} value={form.licenseNumber || ''} onChange={(e) => onChange('licenseNumber', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Bar Council ID</label>
            <input disabled={!editing} value={form.barCouncilId || ''} onChange={(e) => onChange('barCouncilId', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Bar Council Name</label>
            <input disabled={!editing} value={form.barCouncil || ''} onChange={(e) => onChange('barCouncil', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Experience Years</label>
            <input disabled={!editing} type="number" value={form.experienceYears ?? ''} onChange={(e) => onChange('experienceYears', e.target.value ? Number(e.target.value) : undefined)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <label className="block text-sm font-medium">Experiences</label>
              {editing && (
                <button type="button" onClick={addExperience} className="text-lg text-primary px-2 bg-primary/10 rounded"> + </button>
              )}
            </div>
            <div className="space-y-3 mt-2">
              {(form.exprience || []).map((exp, idx) => (
                <div key={idx} className="p-3 border rounded">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Experience #{idx + 1}</div>
                    {editing && <button type="button" onClick={() => removeExperience(idx)} className="text-sm text-red-600">Remove</button>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                    <div>
                      <label className="block text-sm">Title</label>
                      <input disabled={!editing} value={exp?.title || ''} onChange={(e) => updateExperience(idx, { title: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-sm">Organisation</label>
                      <input disabled={!editing} value={exp?.organisation || ''} onChange={(e) => updateExperience(idx, { organisation: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-sm">From</label>
                      <input disabled={!editing} type="month" value={exp?.from || ''} onChange={(e) => updateExperience(idx, { from: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-sm">To</label>
                      <input disabled={!editing} type="month" value={exp?.to || ''} onChange={(e) => updateExperience(idx, { to: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
                    </div>
                  </div>
                </div>
              ))}
              {(!(form.exprience || []).length) && !editing && <div className="text-sm text-gray-500">No experiences added</div>}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <label className="block text-sm font-medium">Education</label>
              {editing && (
                <button type="button" onClick={addEducation} className="text-lg text-primary px-2 bg-primary/10 rounded">+</button>
              )}
            </div>
            <div className="space-y-3 mt-2">
              {(form.education || []).map((ed, idx) => (
                <div key={idx} className="p-3 border rounded">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Education #{idx + 1}</div>
                    {editing && <button type="button" onClick={() => removeEducation(idx)} className="text-sm text-red-600">Remove</button>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                    <div>
                      <label className="block text-sm">University</label>
                      <input disabled={!editing} value={ed?.university || ''} onChange={(e) => updateEducation(idx, { university: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-sm">Course</label>
                      <input disabled={!editing} value={ed?.course || ''} onChange={(e) => updateEducation(idx, { course: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-sm">Start Year</label>
                      <input disabled={!editing} type="number" value={ed?.startYear || ''} onChange={(e) => updateEducation(idx, { startYear: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-sm">Completion Year</label>
                      <input disabled={!editing} type="number" value={ed?.completionYear || ''} onChange={(e) => updateEducation(idx, { completionYear: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm">Certificate</label>
                      {ed?.certificateUrl && !editing && (
                        <div className="mt-1"><a href={ed.certificateUrl} target="_blank" rel="noreferrer" className="text-primary underline">View certificate</a></div>
                      )}
                      {editing && (
                        <input type="file" accept="image/*,application/pdf" onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          setEducationFiles((prev) => {
                            const copy = prev.slice()
                            copy[idx] = f
                            return copy
                          })
                        }} className="mt-1 block w-full" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(!(form.education || []).length) && !editing && <div className="text-sm text-gray-500">No education added</div>}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Languages (comma or newline separated)</label>
            <textarea disabled={!editing} value={joinArrayForInput(form.languages)} onChange={(e) => onChange('languages', parseArrayInput(e.target.value))} className="mt-1 block w-full border rounded px-3 py-2 h-20" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Bio</label>
            <textarea disabled={!editing} value={form.bio || ''} onChange={(e) => onChange('bio', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2 h-28" />
          </div>
          <div>
            <label className="block text-sm font-medium">City</label>
            <input disabled={!editing} value={form.city || ''} onChange={(e) => onChange('city', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">State</label>
            <input disabled={!editing} value={form.state || ''} onChange={(e) => onChange('state', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Pincode</label>
            <input disabled={!editing} value={form.pincode || ''} onChange={(e) => onChange('pincode', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Address</label>
            <input disabled={!editing} value={form.address || ''} onChange={(e) => onChange('address', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">License proof</label>
            {form.licenseProofUrl && !editing && (
              <div className="mt-1"><a href={form.licenseProofUrl} target="_blank" rel="noreferrer" className="text-primary underline">View uploaded</a></div>
            )}
            {editing && <input type="file" accept="image/*,application/pdf" onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full" />}
          </div>
          <div>
            <label className="block text-sm font-medium">Bar council proof</label>
            {form.barCouncilProofUrl && !editing && (
              <div className="mt-1"><a href={form.barCouncilProofUrl} target="_blank" rel="noreferrer" className="text-primary underline">View uploaded</a></div>
            )}
            {editing && <input type="file" accept="image/*,application/pdf" onChange={(e) => setBarCouncilFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full" />}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={!editing || submitting} className="px-4 py-2 bg-primary text-white rounded disabled:opacity-60">{submitting ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

export default LawyerInfo
