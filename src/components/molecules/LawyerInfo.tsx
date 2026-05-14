import React, { useEffect, useState } from 'react'
import { usersApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import AddressPicker from '@/components/molecules/AddressPicker'
import { uploadToCloudinary } from '@/utils/cloudinaryUpload'
import {
  Briefcase,
  GraduationCap,
  Languages,
  MapPin,
  FileText,
  Plus,
  Trash2,
  Edit3,
  X,
  Save,
  Loader2,
  ExternalLink
} from 'lucide-react'

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
  experience?: ExperienceEntry[]
  languages?: string[]
  bio?: string
  education?: EducationEntry[]
  city?: string
  state?: string
  // District is required for the profile-verification flow (the
  // court-admin lookup matches on district, not pincode). It used to be
  // missing from this interface even though the server, schema, and
  // AddressPicker all carry it — which meant the read-only Location
  // block never rendered the value after save.
  district?: string
  pincode?: string
  address?: string
  feePerConsultation?: number  // stored in paise, displayed in rupees
}

const parseArrayInput = (value?: string) => {
  if (!value) return []
  return value.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)
}

const joinArrayForInput = (arr?: string[]) => (arr ? arr.join('\n') : '')

const normalizeResponse = (data: any): LawyerInfoShape => {
  const raw = data?.data ?? data ?? {}
  const payload = raw.lawyer ?? raw
  const rawExperience = payload.experience
  const rawEducation = payload.education

  return {
    ...payload,
    experience: Array.isArray(rawExperience)
      ? rawExperience.map((e: any) => (typeof e === 'string' ? { title: e } : e))
      : rawExperience
        ? (typeof rawExperience === 'string' ? [{ title: rawExperience }] : [rawExperience])
        : [],
    education: Array.isArray(rawEducation)
      ? rawEducation.map((ed: any) => (typeof ed === 'string' ? { course: ed } : ed))
      : rawEducation
        ? (typeof rawEducation === 'string' ? [{ course: rawEducation }] : [rawEducation])
        : [],
    languages: Array.isArray(payload.languages)
      ? payload.languages
      : (payload.languages ? payload.languages.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
  }
}

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
  const [languageInput, setLanguageInput] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await usersApi.getLawyerInformation()
        const data = (res as any).data ?? res
        const normalized = normalizeResponse(data)
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
      const list = (s.experience || []).slice()
      list[index] = { ...(list[index] || {}), ...patch }
      return { ...s, experience: list }
    })
  }

  const addExperience = () => setForm((s) => ({ ...s, experience: [...(s.experience || []), {}] }))
  const removeExperience = (index: number) => setForm((s) => ({ ...s, experience: (s.experience || []).filter((_, i) => i !== index) }))

  const addLanguage = (lang: string) => {
    const trimmed = lang.trim()
    if (trimmed && !(form.languages || []).includes(trimmed)) {
      setForm((s) => ({ ...s, languages: [...(s.languages || []), trimmed] }))
    }
    setLanguageInput('')
  }

  const removeLanguage = (index: number) => {
    setForm((s) => ({ ...s, languages: (s.languages || []).filter((_, i) => i !== index) }))
  }

  const handleLanguageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addLanguage(languageInput)
    } else if (e.key === 'Backspace' && !languageInput && (form.languages || []).length > 0) {
      removeLanguage((form.languages || []).length - 1)
    }
  }

  /**
   * Upload a license / bar-council / education-certificate file.
   *
   * The earlier implementation called `usersApi.getPresignedUrl` and tried
   * to PUT directly to S3 — but the server's `generatePresignedUpload`
   * route actually returns Cloudinary signed-upload params (`timestamp`,
   * `signature`, `cloudName`, …), not an S3 PUT URL. The handler therefore
   * always threw "No upload url" and the save aborted with the generic
   * "Failed to save lawyer info" alert, even though the rest of the
   * payload was perfectly valid.
   *
   * We now route through the shared `uploadToCloudinary` util which:
   *   1. asks `storageApi.getSignature('documents')` for the doc-folder
   *      Cloudinary signature
   *   2. POSTs to `/image/upload` or `/raw/upload` based on mime (PDFs go
   *      to `raw`, certificate scans / photos go to `image`)
   *   3. returns the resulting `secure_url`.
   */
  const uploadFileToPresigned = async (file: File): Promise<string | null> => {
    if (!userId) throw new Error('No user id')
    try {
      const url = await uploadToCloudinary(file, { folder: 'documents' })
      return url || null
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
      payload.education = Array.isArray(form.education) ? form.education : []
      payload.experience = Array.isArray(form.experience) ? form.experience : []
      payload.languages = Array.isArray(form.languages) ? form.languages : parseArrayInput((form.languages as any)?.toString?.())

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

      // Re-fetch to get updated data
      const res = await usersApi.getLawyerInformation()
      const data = (res as any).data ?? res
      const normalized = normalizeResponse(data)

      setInitial(normalized)
      setForm(normalized)
      setEditing(false)
      setLicenseFile(null)
      setBarCouncilFile(null)
      setEducationFiles((normalized.education || []).map(() => null))
    } catch (err: any) {
      console.error('Failed to save lawyer info', err)
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save lawyer info'
      alert(`Failed to save lawyer info — ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    setForm(initial)
    setEditing(false)
    setLicenseFile(null)
    setBarCouncilFile(null)
    setEducationFiles((initial.education || []).map(() => null))
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

  const labelClasses = "block text-sm font-medium text-midnight mb-1.5"

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-midnight">Professional Information</h3>
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
        {/* License & Bar Council Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-primary" />
            <h4 className="text-base font-semibold text-midnight">License & Bar Council</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClasses}>License Number</label>
              <input
                disabled={!editing}
                value={form.licenseNumber || ''}
                onChange={(e) => onChange('licenseNumber', e.target.value)}
                className={inputClasses}
                placeholder="Enter license number"
              />
            </div>
            <div>
              <label className={labelClasses}>License Proof</label>
              {form.licenseProofUrl && !editing ? (
                <a
                  href={form.licenseProofUrl}
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

                  onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)}
                  className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg text-sm text-gray-500">No document uploaded</div>
              )}
            </div>
            <div>
              <label className={labelClasses}>Bar Council ID</label>
              <input
                disabled={!editing}
                value={form.barCouncilId || ''}
                onChange={(e) => onChange('barCouncilId', e.target.value)}
                className={inputClasses}
                placeholder="Enter bar council ID"
              />
            </div>
            <div>
              <label className={labelClasses}>Bar Council Proof</label>
              {form.barCouncilProofUrl && !editing ? (
                <a
                  href={form.barCouncilProofUrl}
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

                  onChange={(e) => setBarCouncilFile(e.target.files?.[0] ?? null)}
                  className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 rounded-lg text-sm text-gray-500">No document uploaded</div>
              )}
            </div>
            <div>
              <label className={labelClasses}>Bar Council Name</label>
              <input
                disabled={!editing}
                value={form.barCouncil || ''}
                onChange={(e) => onChange('barCouncil', e.target.value)}
                className={inputClasses}
                placeholder="Enter bar council name"
              />
            </div>
            <div>
              <label className={labelClasses}>Years of Experience</label>
              <input
                disabled={!editing}
                type="number"
                value={form.experienceYears ?? ''}
                onChange={(e) => onChange('experienceYears', e.target.value ? Number(e.target.value) : undefined)}
                className={inputClasses}
                placeholder="e.g. 5"
              />
            </div>
            <div>
              <label className={labelClasses}>Consultation Fee (₹)</label>
              <div className="relative">
                <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium ${editing ? '' : 'text-gray-400'}`}>₹</span>
                <input
                  disabled={!editing}
                  type="number"
                  min="0"
                  step="1"
                  value={form.feePerConsultation != null ? Math.round(form.feePerConsultation / 100) : ''}
                  onChange={(e) => {
                    const rupees = e.target.value ? Number(e.target.value) : undefined
                    onChange('feePerConsultation', rupees != null ? rupees * 100 : undefined)
                  }}
                  className={`${inputClasses} pl-9`}
                  placeholder="e.g. 500"
                />
              </div>
              {editing && (
                <p className="mt-1 text-xs text-gray-500">Enter your consultation fee in rupees. Clients will see this amount when booking.</p>
              )}
            </div>
          </div>
        </section>

        {/* Experience Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" />
              <h4 className="text-base font-semibold text-midnight">Work Experience</h4>
            </div>
            {editing && (
              <button
                type="button"
                onClick={addExperience}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary border border-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Experience
              </button>
            )}
          </div>
          <div className="space-y-4">
            {(form.experience || []).map((exp, idx) => (
              <div key={idx} className="p-4 border-2 border-gray-100 rounded-lg bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-midnight">Experience #{idx + 1}</span>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => removeExperience(idx)}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>Title / Role</label>
                    <input
                      disabled={!editing}
                      value={exp?.title || ''}
                      onChange={(e) => updateExperience(idx, { title: e.target.value })}
                      className={inputClasses}
                      placeholder="e.g. Senior Associate"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Organisation</label>
                    <input
                      disabled={!editing}
                      value={exp?.organisation || ''}
                      onChange={(e) => updateExperience(idx, { organisation: e.target.value })}
                      className={inputClasses}
                      placeholder="e.g. XYZ Law Firm"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>From</label>
                    <input
                      disabled={!editing}
                      type="month"
                      value={exp?.from || ''}
                      onChange={(e) => updateExperience(idx, { from: e.target.value })}
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>To</label>
                    <input
                      disabled={!editing}
                      type="month"
                      value={exp?.to || ''}
                      onChange={(e) => updateExperience(idx, { to: e.target.value })}
                      className={inputClasses}
                    />
                  </div>
                </div>
              </div>
            ))}
            {(!(form.experience || []).length) && (
              <div className="py-8 text-center text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                No work experience added yet
              </div>
            )}
          </div>
        </section>

        {/* Education Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-primary" />
              <h4 className="text-base font-semibold text-midnight">Education</h4>
            </div>
            {editing && (
              <button
                type="button"
                onClick={addEducation}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary border border-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Education
              </button>
            )}
          </div>
          <div className="space-y-4">
            {(form.education || []).map((ed, idx) => (
              <div key={idx} className="p-4 border-2 border-gray-100 rounded-lg bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-midnight">Education #{idx + 1}</span>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => removeEducation(idx)}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>University</label>
                    <input
                      disabled={!editing}
                      value={ed?.university || ''}
                      onChange={(e) => updateEducation(idx, { university: e.target.value })}
                      className={inputClasses}
                      placeholder="e.g. National Law University"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Course / Degree</label>
                    <input
                      disabled={!editing}
                      value={ed?.course || ''}
                      onChange={(e) => updateEducation(idx, { course: e.target.value })}
                      className={inputClasses}
                      placeholder="e.g. LLB"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Start Year</label>
                    <input
                      disabled={!editing}
                      type="number"
                      value={ed?.startYear || ''}
                      onChange={(e) => updateEducation(idx, { startYear: e.target.value })}
                      className={inputClasses}
                      placeholder="e.g. 2015"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Completion Year</label>
                    <input
                      disabled={!editing}
                      type="number"
                      value={ed?.completionYear || ''}
                      onChange={(e) => updateEducation(idx, { completionYear: e.target.value })}
                      className={inputClasses}
                      placeholder="e.g. 2018"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClasses}>Certificate</label>
                    {ed?.certificateUrl && !editing ? (
                      <a
                        href={ed.certificateUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Certificate
                      </a>
                    ) : editing ? (
                      <input
                        type="file"
      
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          setEducationFiles((prev) => {
                            const copy = prev.slice()
                            copy[idx] = f
                            return copy
                          })
                        }}
                        className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                      />
                    ) : (
                      <div className="px-4 py-2.5 bg-gray-50 rounded-lg text-sm text-gray-500">No certificate uploaded</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(!(form.education || []).length) && (
              <div className="py-8 text-center text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                No education added yet
              </div>
            )}
          </div>
        </section>

        {/* Languages & Bio Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Languages className="w-5 h-5 text-primary" />
            <h4 className="text-base font-semibold text-midnight">Languages & Bio</h4>
          </div>
          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className={labelClasses}>Languages</label>
              <div className={`w-full px-3 py-2 border-2 rounded-lg transition-colors min-h-[48px] flex flex-wrap items-center gap-2
                ${editing
                  ? 'border-gray-200 bg-white focus-within:border-primary'
                  : 'border-transparent bg-gray-50'
                }`}
              >
                {(form.languages || []).map((lang, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full"
                  >
                    {lang}
                    {editing && (
                      <button
                        type="button"
                        onClick={() => removeLanguage(idx)}
                        className="ml-1 hover:text-red-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                ))}
                {editing && (
                  <input
                    type="text"
                    value={languageInput}
                    onChange={(e) => setLanguageInput(e.target.value)}
                    onKeyDown={handleLanguageKeyDown}
                    onBlur={() => languageInput.trim() && addLanguage(languageInput)}
                    className="flex-1 min-w-[120px] outline-none bg-transparent text-sm py-1"
                    placeholder={form.languages?.length ? "Add more..." : "Type and press Enter or comma"}
                  />
                )}
                {!editing && !(form.languages || []).length && (
                  <span className="text-sm text-gray-500">No languages added</span>
                )}
              </div>
              {editing && (
                <p className="mt-1.5 text-xs text-gray-500">Press Enter or comma to add a language. Backspace to remove last.</p>
              )}
            </div>
            <div>
              <label className={labelClasses}>Bio</label>
              <textarea
                disabled={!editing}
                value={form.bio || ''}
                onChange={(e) => onChange('bio', e.target.value)}
                className={`${inputClasses} min-h-[120px] resize-none`}
                placeholder="Write a brief description about yourself and your practice..."
              />
            </div>
          </div>
        </section>

        {/* Location Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-primary" />
            <h4 className="text-base font-semibold text-midnight">Location</h4>
          </div>
          {editing ? (
            <div className="space-y-4">
              <AddressPicker
                value={{
                  state: form.state,
                  district: form.district,
                  city: form.city,
                  pincode: form.pincode,
                }}
                onChange={(next) => {
                  setForm((s) => ({
                    ...s,
                    state: next.state,
                    district: next.district,
                    city: next.city,
                    pincode: next.pincode,
                  }))
                }}
              />
              <div>
                <label className={labelClasses}>Address</label>
                <input
                  value={form.address || ''}
                  onChange={(e) => onChange('address', e.target.value)}
                  className={inputClasses}
                  placeholder="Enter your office address"
                />
              </div>
            </div>
          ) : (
            // Read-only summary. District is rendered as a first-class
            // field next to State because the verification flow keys off
            // it — without surfacing it here the lawyer couldn't tell
            // whether their saved address actually feeds the court-admin
            // lookup.
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClasses}>City</label>
                <input disabled value={form.city || ''} className={inputClasses} />
              </div>
              <div>
                <label className={labelClasses}>District</label>
                <input disabled value={form.district || ''} className={inputClasses} />
              </div>
              <div>
                <label className={labelClasses}>State</label>
                <input disabled value={form.state || ''} className={inputClasses} />
              </div>
              <div>
                <label className={labelClasses}>Pincode</label>
                <input disabled value={form.pincode || ''} className={inputClasses} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClasses}>Address</label>
                <input disabled value={form.address || ''} className={inputClasses} />
              </div>
            </div>
          )}
        </section>
      </form>
    </div>
  )
}

export default LawyerInfo
