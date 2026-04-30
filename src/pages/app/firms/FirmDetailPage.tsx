import { FC, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'
import type { Organization, VerifiedLawyer } from '@/types'

const FirmDetailPage: FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fetchPublicOrgById = useOrganizationStore((s) => s.fetchPublicOrgById)
  const createRequest = useOrganizationStore((s) => s.createRequest)

  const [org, setOrg] = useState<(Organization & { lawyers: VerifiedLawyer[] }) | null>(null)
  const [loading, setLoading] = useState(true)

  // Booking form state
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationMins, setDurationMins] = useState<15 | 30 | 60 | 120>(30)
  const [meetingType, setMeetingType] = useState<'AUDIO_CALL' | 'VIDEO_CALL' | 'OFFICE_VISIT'>('VIDEO_CALL')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetchPublicOrgById(id)
      .then((data) => setOrg(data?.organization || null))
      .finally(() => setLoading(false))
  }, [id, fetchPublicOrgById])

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !scheduledAt) return
    setSubmitting(true)
    setError(null)
    try {
      await createRequest(id, {
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMins,
        meetingType,
        notes: notes || undefined,
      })
      setSuccess("Request sent — you'll be notified when a lawyer is assigned.")
      setTimeout(() => navigate('/app/firms-requests'), 1500)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Booking failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading firm…</div>
  if (!org) return <div className="text-center py-12 text-gray-500">Firm not found.</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex gap-6">
        {org.avatarUrl ? (
          <img src={org.avatarUrl} alt={org.name} className="w-24 h-24 rounded-full object-cover" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center text-3xl font-bold">
            {org.name?.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
          <p className="text-sm text-gray-500">
            {org.city || org.district || ''}{org.pincode ? ` · ${org.pincode}` : ''}
          </p>
          {org.practiceAreas?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {org.practiceAreas.map((p) => (
                <span key={p} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{p}</span>
              ))}
            </div>
          )}
          {org.about && <p className="mt-3 text-sm text-gray-700">{org.about}</p>}
          {org.consultationFee != null && (
            <p className="mt-3 text-lg font-semibold text-gray-900">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(org.consultationFee / 100)}
              <span className="text-sm text-gray-500 font-normal"> / consultation</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Verified lawyers</h2>
            {org.lawyers?.length > 0 ? (
              <ul className="divide-y divide-gray-100">
                {org.lawyers.map((l) => (
                  <li key={l.id} className="py-3 flex items-center gap-3">
                    {l.avatarUrl ? (
                      <img src={l.avatarUrl} alt={l.name} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">
                        {l.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{l.name}</div>
                      <div className="text-xs text-gray-500">
                        {(l.specializations || []).join(' · ')}
                        {l.experienceYears != null ? ` · ${l.experienceYears}y exp` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No lawyers listed yet.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <form onSubmit={handleBook} className="sticky top-6 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-primary p-4 text-white">
              <h2 className="text-lg font-semibold">Book with this firm</h2>
            </div>
            <div className="p-5 space-y-4">
              {success && (
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>
              )}
              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">Date & time</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Duration</label>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[15, 30, 60, 120].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDurationMins(d as 15 | 30 | 60 | 120)}
                      className={`px-2 py-1.5 rounded-md text-xs font-medium border ${durationMins === d ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-700'}`}
                    >
                      {d}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Meeting type</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { v: 'AUDIO_CALL', l: 'Audio' },
                    { v: 'VIDEO_CALL', l: 'Video' },
                    { v: 'OFFICE_VISIT', l: 'Office' },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setMeetingType(opt.v as any)}
                      className={`px-2 py-1.5 rounded-md text-xs font-medium border ${meetingType === opt.v ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-700'}`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm"
                  placeholder="Briefly describe your matter (optional)"
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Sending request…' : 'Request consultation'}
              </Button>
              <p className="text-xs text-gray-500 text-center">
                You'll pay only after the firm assigns a lawyer.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default FirmDetailPage
