import { FC, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ShieldCheck, Wallet, CreditCard, Paperclip, FileText, Image as ImageIcon, X, Loader2 } from 'lucide-react'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'
import { useAuthStore } from '@/stores/authStore'
import { startOrgRequestRazorpayCheckout } from '@/services/orgPaymentFlow'
import { organizationsApi, storageApi } from '@/services/api'
import { pickCloudinaryResourceType } from '@/utils/cloudinaryUpload'
import type { Organization, VerifiedLawyer } from '@/types'

interface PendingDoc {
  localId: string
  file: File
  status: 'pending' | 'uploading' | 'uploaded' | 'failed'
  error?: string
}

const MAX_DOC_MB = 10
const MAX_DOC_BYTES = MAX_DOC_MB * 1024 * 1024

/**
 * Public firm detail + consultation booking.
 *
 * The booking flow now mirrors the mobile `OrgBookingScreen`:
 *  1. Client picks date, duration, meeting type, notes (≥20 chars), and
 *     payment method (razorpay / wallet).
 *  2. We POST `/organizations/:id/appointment-requests` which returns
 *     `{ request, payment, paidVia }`. The server has already created a
 *     Razorpay order at this point.
 *  3. If paidVia === 'razorpay' we open Razorpay checkout against the order.
 *     The shared `startOrgRequestRazorpayCheckout` helper handles signature
 *     verification via `appointmentsApi.confirmPayment`.
 *  4. On success (or when wallet was used) we route to /app/firms-requests.
 *
 * Previously this page collected nothing about payment and the user was
 * dropped on the "My requests" page with no payment trigger — the request
 * sat with PENDING status and a stale order until they happened to revisit.
 */
const FirmDetailPage: FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fetchPublicOrgById = useOrganizationStore((s) => s.fetchPublicOrgById)
  const createRequest = useOrganizationStore((s) => s.createRequest)
  const user = useAuthStore((s) => s.user)

  const [org, setOrg] = useState<(Organization & { lawyers: VerifiedLawyer[] }) | null>(null)
  const [loading, setLoading] = useState(true)

  // Booking form state
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationMins, setDurationMins] = useState<15 | 30 | 60 | 120>(30)
  const [meetingType, setMeetingType] = useState<'AUDIO_CALL' | 'VIDEO_CALL' | 'OFFICE_VISIT'>('VIDEO_CALL')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'wallet'>('razorpay')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Supporting documents the client wants the firm to see ahead of triage.
  // Same pattern as lawyer-direct bookings: held client-side until the
  // request lands, then uploaded + attached via the org-request docs API.
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const pickFiles = (files: FileList | null) => {
    if (!files) return
    const next: PendingDoc[] = []
    Array.from(files).forEach((file) => {
      if (file.size > MAX_DOC_BYTES) {
        next.push({
          localId: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          status: 'failed',
          error: `Too large (max ${MAX_DOC_MB} MB)`,
        })
      } else {
        next.push({
          localId: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          status: 'pending',
        })
      }
    })
    setPendingDocs((prev) => [...prev, ...next])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePendingDoc = (localId: string) => {
    setPendingDocs((prev) => prev.filter((d) => d.localId !== localId))
  }

  /**
   * Cloudinary-upload each pending doc and POST it to
   * `/organizations/clients/me/requests/:id/documents` so the org head
   * sees it on their request triage screen. Failures are surfaced per-file
   * but never roll back the booking.
   */
  const uploadDocsTo = async (requestId: string) => {
    const queue = pendingDocs.filter((d) => d.status === 'pending')
    if (queue.length === 0) return
    let sig: any
    try {
      const sigRes = await storageApi.getSignature('appointment-docs')
      sig = (sigRes as any)?.data ?? sigRes
    } catch (err: any) {
      setPendingDocs((prev) =>
        prev.map((d) =>
          d.status === 'pending'
            ? { ...d, status: 'failed', error: err?.message || 'Could not get upload signature' }
            : d,
        ),
      )
      return
    }

    const { cloudName, apiKey, signature, timestamp, folder } = sig

    for (const doc of queue) {
      setPendingDocs((prev) =>
        prev.map((d) => (d.localId === doc.localId ? { ...d, status: 'uploading' } : d)),
      )
      try {
        // Same image/raw routing as the rest of the platform — PDFs
        // ride on /image/upload so they preview inline for the org head.
        const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${pickCloudinaryResourceType(doc.file.type)}/upload`
        const fd = new FormData()
        fd.append('file', doc.file)
        fd.append('api_key', apiKey)
        fd.append('timestamp', String(timestamp))
        fd.append('signature', signature)
        if (folder) fd.append('folder', folder)
        const r = await fetch(endpoint, { method: 'POST', body: fd })
        if (!r.ok) throw new Error(`Cloudinary ${r.status}`)
        const uploaded = await r.json()
        const url: string = uploaded.secure_url || uploaded.url
        if (!url) throw new Error('No URL returned')
        await organizationsApi.attachRequestDocument(requestId, {
          fileurl: url,
          fileName: doc.file.name,
          mimeType: doc.file.type || 'application/octet-stream',
          size: doc.file.size,
        })
        setPendingDocs((prev) =>
          prev.map((d) => (d.localId === doc.localId ? { ...d, status: 'uploaded' } : d)),
        )
      } catch (err: any) {
        setPendingDocs((prev) =>
          prev.map((d) =>
            d.localId === doc.localId
              ? { ...d, status: 'failed', error: err?.message || 'Upload failed' }
              : d,
          ),
        )
      }
    }
  }

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetchPublicOrgById(id)
      .then((data) => setOrg(data?.organization || null))
      .finally(() => setLoading(false))
  }, [id, fetchPublicOrgById])

  const notesLength = notes.trim().length
  const notesValid = notesLength >= 20
  const formValid = !!id && !!scheduledAt && notesValid

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    if (!scheduledAt) {
      setError('Pick a date and time.')
      return
    }
    if (!notesValid) {
      setError('Please describe your matter in at least 20 characters so the firm can route you to the right lawyer.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await createRequest(id, {
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMins,
        meetingType,
        notes: notes.trim(),
        paymentMethod,
      })
      // Server response shape: { request, payment, paidVia }. Some defensive
      // unwrap because older deploys wrap in `{ data: ... }`.
      const payload = (result as any)?.data ?? result
      const paidVia = payload?.paidVia
      const payment = payload?.payment
      const request = payload?.request ?? payload

      // Attach any client-uploaded supporting docs to the freshly-minted
      // request. Best-effort: errors surface in the doc picker but never
      // block payment or navigation. The org head will see these docs on
      // their request triage view.
      if (request?.id) {
        await uploadDocsTo(request.id)
      }

      if (paidVia === 'razorpay' && payment?.providerOrderId && payment?.id) {
        // Open Razorpay immediately. On checkout success the helper calls
        // /appointments/confirm-payment which materialises the booking; we
        // then send the user to their requests page to track the status.
        await startOrgRequestRazorpayCheckout({
          request,
          payment,
          prefill: {
            name: user?.name,
            email: (user as any)?.email,
            contact: String((user as any)?.phone ?? ''),
          },
          onSuccess: () => {
            setSuccess('Payment received — your request is now pending the firm.')
            setTimeout(() => navigate('/app/firms-requests'), 1200)
          },
        })
        // Closing Razorpay without paying leaves the request pending; the
        // user can resume from /app/firms-requests via the Pay-now button.
        setSubmitting(false)
        return
      }

      // Wallet path (server has already debited / held funds) — straight to
      // the requests page.
      setSuccess('Request sent — the firm will assign a lawyer shortly.')
      setTimeout(() => navigate('/app/firms-requests'), 1200)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Booking failed')
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
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {org.name}
            {org.isVerified && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified
              </span>
            )}
          </h1>
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
              <p className="text-xs text-white/80 mt-1">
                Pay now — the firm picks the right lawyer and confirms your slot.
              </p>
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
                <label className="block text-sm font-medium text-gray-700">
                  Describe your matter
                  <span className="ml-1 text-gray-400 font-normal">(min 20 chars)</span>
                </label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`mt-1 block w-full px-3 py-2 border rounded-md sm:text-sm ${
                    notes && !notesValid ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="What is the matter about? Any deadlines, prior context, or key facts the firm should know?"
                />
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className={notesValid ? 'text-emerald-600' : 'text-gray-400'}>
                    {notesValid ? 'Looks good.' : 'A bit more detail helps the firm route you correctly.'}
                  </span>
                  <span className={notesValid ? 'text-gray-400' : 'text-red-500'}>
                    {notesLength} / 20
                  </span>
                </div>
              </div>

              {/* Supporting documents — optional. The org head sees these on
                  their triage screen and can OCR/summarize each one before
                  assigning a lawyer. */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-gray-700">
                    Attach documents
                    <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/5"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    Add files
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => pickFiles(e.target.files)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  PDFs &amp; images work best. The firm extracts text + summarises each
                  attachment before assigning a lawyer.
                </p>

                {pendingDocs.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {pendingDocs.map((d) => {
                      const isImg = (d.file.type || '').startsWith('image/')
                      return (
                        <li
                          key={d.localId}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${
                            d.status === 'failed'
                              ? 'border-red-200 bg-red-50'
                              : d.status === 'uploaded'
                                ? 'border-emerald-200 bg-emerald-50'
                                : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          {isImg ? (
                            <ImageIcon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-800 truncate">{d.file.name}</div>
                            <div className="text-[11px] text-gray-500">
                              {(d.file.size / 1024).toFixed(0)} KB
                              {d.status === 'uploading' && ' · Uploading…'}
                              {d.status === 'uploaded' && ' · Attached'}
                              {d.status === 'failed' && d.error && ` · ${d.error}`}
                            </div>
                          </div>
                          {d.status === 'uploading' && (
                            <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin flex-shrink-0" />
                          )}
                          {(d.status === 'pending' || d.status === 'failed') && !submitting && (
                            <button
                              type="button"
                              onClick={() => removePendingDoc(d.localId)}
                              className="p-1 rounded hover:bg-gray-200 text-gray-500"
                              aria-label="Remove file"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Pay with</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('razorpay')}
                    className={`flex items-center justify-center gap-2 px-2 py-2 rounded-md text-xs font-medium border ${
                      paymentMethod === 'razorpay' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    Razorpay
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('wallet')}
                    className={`flex items-center justify-center gap-2 px-2 py-2 rounded-md text-xs font-medium border ${
                      paymentMethod === 'wallet' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    <Wallet className="w-4 h-4" />
                    Wallet
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={submitting || !formValid} className="w-full">
                {submitting
                  ? 'Processing…'
                  : paymentMethod === 'razorpay'
                    ? 'Pay & request consultation'
                    : 'Request consultation'}
              </Button>
              <p className="text-xs text-gray-500 text-center">
                Your payment is held in escrow until the firm assigns a lawyer.
                It auto-refunds if the request is cancelled or expires.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default FirmDetailPage
