import { FC, useState, useEffect, useMemo, useRef } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Lawyer } from '@/types'
import Button from '@/components/atoms/Button'
import SlotSelect from '@/components/molecules/SlotSelect'
import Info from '@/components/molecules/Info'
import Reviews from '@/components/molecules/Reviews'
import QA from '@/components/molecules/QA'
import Articles from '@/components/molecules/Articles'
import { lawyersApi, appointmentsApi, storageApi } from '@/services/api'
import { pickCloudinaryResourceType } from '@/utils/cloudinaryUpload'
import { useNotificationStore } from '../../stores/notificationStore'
import { useAppointmentStore } from '../../stores/appointmentStore'
import useWalletStore from '../../stores/walletStore'
import { useAuthStore } from '../../stores/authStore'
import { Shield, Wallet, CreditCard, Paperclip, FileText, Image as ImageIcon, X, Loader2 } from 'lucide-react'

/**
 * Per-file upload state for documents the client wants to share with the
 * lawyer ahead of the consultation. We hold the picked `File` until AFTER
 * booking succeeds — that way a failed booking doesn't leave orphans in
 * Cloudinary, and a successful booking attaches docs to the freshly-minted
 * `appointmentId` via `POST /appointments/:id/documents` so the lawyer sees
 * them (and the extracted text / AI summary) in their appointment view.
 */
interface PendingDoc {
  localId: string
  file: File
  status: 'pending' | 'uploading' | 'uploaded' | 'failed'
  error?: string
}

const MAX_DOC_MB = 10
const MAX_DOC_BYTES = MAX_DOC_MB * 1024 * 1024
const MIN_NOTES_CHARS = 10
const MAX_NOTES_CHARS = 1000

const tabs = [
  { id: 'info', label: 'Info' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'qa', label: 'Q&A' },
  { id: 'articles', label: 'Articles' },
]

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const LawyerDetailPage: FC = () => {
  const { id } = useParams<{ id: string }>()

  const [lawyer, setLawyer] = useState<Lawyer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<string>('info')

  // Booking state
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'wallet'>('razorpay')
  const [bookingError, setBookingError] = useState<string | null>(null)
  // Required description of the issue. Stored on Appointment.notes server-side
  // and surfaced to the lawyer in their appointment card alongside the docs.
  const [notes, setNotes] = useState('')
  // Documents the client wants the lawyer to see ahead of the call. Held
  // client-side until booking succeeds, then uploaded to Cloudinary and
  // attached via `POST /appointments/:id/documents` (which kicks off OCR +
  // AI-summary on the server) so the lawyer sees the parsed text by the time
  // they open the appointment.
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Booking section ref so `?book=1` (used by the /app/book/:lawyerId
  // redirect) can scroll the user straight to the slot picker. Without
  // this the deep-link lands on the lawyer header and the user has to
  // hunt for the booking widget.
  const bookingRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mediationId = searchParams.get('mediationId') || undefined
  const shouldAutoBook = searchParams.get('book') === '1'

  const walletBalance = useWalletStore((s) => s.balance)
  const fetchBalance = useWalletStore((s) => s.fetchBalance)
  const authUser = useAuthStore((s) => s.user)

  const notesTrimmedLength = notes.trim().length
  const notesValid = notesTrimmedLength >= MIN_NOTES_CHARS

  useEffect(() => {
    fetchBalance()
  }, [])

  // When the user lands here via /app/book/:lawyerId, scroll the booking
  // card into view once the lawyer payload finishes loading. Uses a
  // requestAnimationFrame so the layout has settled before we measure.
  useEffect(() => {
    if (!shouldAutoBook || loading) return
    const id = requestAnimationFrame(() => {
      bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(id)
  }, [shouldAutoBook, loading])

  useEffect(() => {
    if (!id) return

    const fetchLawyer = async () => {
      setLoading(true)
      try {
        const res = await lawyersApi.getById(id)
        const raw = (res as any).data?.lawyer ?? (res as any).data?.data ?? (res as any).data ?? res
        console.log('[LawyerDetailPage] raw lawyer API response:', raw)

        const mapped = {
          id: raw.id ?? raw.user?.id ?? id, // fallback to URL param
          name: raw.user?.name ?? raw.name ?? raw.fullName ?? 'Unknown',
          specialization: Array.isArray(raw.specializations) ? raw.specializations : (Array.isArray(raw.specialization) ? raw.specialization : []),
          experienceYears: raw.experienceYears ?? raw.experience ?? 0,
          rating: raw.rating ?? raw.user?.rating ?? 0,
          reviewsCount: raw.totalReviews ?? raw.reviewsCount ?? 0,
          fee: (raw.feePerConsultation ?? raw.fee ?? raw.price ?? 0) / 100,
          location: [raw.city, raw.state].filter(Boolean).join(', ') || raw.address || '',
          languages: Array.isArray(raw.languages) ? raw.languages : (raw.language ? [raw.language] : []),
          avatar: raw.user?.avatarUrl ?? raw.avatarUrl ?? raw.avatar ?? undefined,
          isVerified: raw.isVerified ?? raw.user?.isVerified ?? false,
        }

        setLawyer(mapped as any)
      } catch (err: any) {
        setError(err?.message || 'Failed to load lawyer')
      } finally {
        setLoading(false)
      }
    }

    fetchLawyer()
  }, [id])

  const handleBook = () => {
    if (!lawyer) return
    if (!notesValid) {
      setBookingError(`Please describe your issue in at least ${MIN_NOTES_CHARS} characters first.`)
      return
    }
    setIsModalOpen(true)
    setPaymentSuccess(false)
    setBookingError(null)
    setPaymentMethod('razorpay')
  }

  // Add picked files to the staged list. Size is validated per-file so a
  // valid pick doesn't get blocked by an oversize sibling.
  const handleFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const newDocs: PendingDoc[] = []
    Array.from(files).forEach((file) => {
      if (file.size > MAX_DOC_BYTES) {
        newDocs.push({
          localId: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          status: 'failed',
          error: `Too large (max ${MAX_DOC_MB} MB)`,
        })
        return
      }
      newDocs.push({
        localId: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'pending',
      })
    })
    setPendingDocs((prev) => [...prev, ...newDocs])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePendingDoc = (localId: string) => {
    setPendingDocs((prev) => prev.filter((d) => d.localId !== localId))
  }

  /**
   * Upload all `pending` docs to Cloudinary then attach each to the
   * just-created appointment. Best-effort: if a single file fails we mark it
   * `failed` and continue so the rest still land. The booking itself isn't
   * rolled back — the lawyer still sees the typed notes, and the client can
   * re-upload via the AppointmentDocumentsPanel from their appointments list.
   */
  const uploadPendingDocsTo = async (appointmentId: string) => {
    const docsToUpload = pendingDocs.filter((d) => d.status === 'pending')
    if (docsToUpload.length === 0) return

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

    for (const doc of docsToUpload) {
      setPendingDocs((prev) =>
        prev.map((d) => (d.localId === doc.localId ? { ...d, status: 'uploading' } : d)),
      )
      try {
        // PDFs ride on /image/upload so the file is served with the
        // correct Content-Type when the lawyer previews it later.
        const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${pickCloudinaryResourceType(doc.file.type)}/upload`
        const fd = new FormData()
        fd.append('file', doc.file)
        fd.append('api_key', apiKey)
        fd.append('timestamp', String(timestamp))
        fd.append('signature', signature)
        if (folder) fd.append('folder', folder)
        const uploadRes = await fetch(endpoint, { method: 'POST', body: fd })
        if (!uploadRes.ok) {
          const body = await uploadRes.text().catch(() => '')
          throw new Error(`Cloudinary ${uploadRes.status}: ${body.slice(0, 120)}`)
        }
        const uploaded = await uploadRes.json()
        const url: string = uploaded.secure_url || uploaded.url
        if (!url) throw new Error('Upload succeeded but no URL was returned')

        // Server creates the Document row and kicks off OCR/extract so the
        // lawyer's appointment view shows the parsed text + AI summary by
        // the time they open the appointment.
        await appointmentsApi.addDocument(appointmentId, {
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

  const parseSlotToISO = (date: Date, slot: string) => {
    const [time, period] = slot.split(' ')
    const [hStr, mStr] = time.split(':')
    let h = parseInt(hStr, 10)
    const m = parseInt(mStr || '0', 10)
    if (period === 'PM' && h < 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    const d = new Date(date)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }

  const handlePayNow = async () => {
    console.log('[handlePayNow] lawyer:', lawyer, 'date:', selectedDate, 'slot:', selectedSlot, 'method:', paymentMethod)
    if (!lawyer || !selectedDate || !selectedSlot) return

    if (paymentMethod === 'wallet') {
      // Wallet payment — instant booking
      try {
        setPaymentLoading(true)
        const datetimeIso = parseSlotToISO(selectedDate, selectedSlot)
        const trimmedNotes = notes.trim()
        const res = await appointmentsApi.book({
          lawyerId: lawyer.id,
          scheduledAt: datetimeIso,
          durationMins: 30,
          meetingType: 'VIDEO_CALL',
          paymentMethod: 'wallet',
          notes: trimmedNotes,
          ...(mediationId ? { mediationId } : {}),
        })

        // Attach any pending documents to the just-created appointment so the
        // lawyer sees them (and the auto-generated AI summary) in their card.
        const appointmentId =
          (res as any)?.data?.appointment?.id ?? (res as any)?.appointment?.id
        if (appointmentId) {
          await uploadPendingDocsTo(appointmentId)
        }

        setPaymentSuccess(true)

        // Refresh stores
        try { await useNotificationStore.getState().fetchNotifications() } catch { }
        try { await useAppointmentStore.getState().fetchAppointments() } catch { }
        try { await fetchBalance() } catch { }

        setToastVisible(true)
        setTimeout(() => {
          setIsModalOpen(false)
          setToastVisible(false)
          navigate('/app/appointments')
        }, 2500)
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || 'Wallet payment failed'
        if (msg.toLowerCase().includes('slot not available')) {
          setBookingError('This slot has already been booked. Please go back and select a different time.')
        } else {
          setBookingError(msg)
        }
      } finally {
        setPaymentLoading(false)
      }
    } else {
      // Razorpay payment — backend only creates a payment order, no appointment yet.
      // Appointment is created on confirmPayment after successful Razorpay payment.
      try {
        setPaymentLoading(true)
        setBookingError(null)
        const datetimeIso = parseSlotToISO(selectedDate, selectedSlot)
        const trimmedNotes = notes.trim()
        const res = await appointmentsApi.book({
          lawyerId: lawyer.id,
          scheduledAt: datetimeIso,
          durationMins: 30,
          meetingType: 'VIDEO_CALL',
          notes: trimmedNotes,
          ...(mediationId ? { mediationId } : {}),
        })

        const payload = res.data || res
        console.log('[handlePayNow] booking response payload:', JSON.stringify(payload, null, 2))

        if (payload.error) {
          throw new Error(payload.error)
        }

        const payment = payload?.payment
        if (!payment?.id) {
          console.error('Unexpected booking response:', payload)
          throw new Error('Failed to create payment order. Please try again.')
        }

        const providerOrderId = payment.providerOrderId

        if (!(window as any).Razorpay) {
          throw new Error('Payment gateway not loaded. Please refresh the page and try again.')
        }

        if (!providerOrderId) {
          throw new Error('Payment order could not be created. Please try again later.')
        }

        const rzpKey = (import.meta.env.VITE_RAZORPAY_KEY as string) || ''
        const options: any = {
          key: rzpKey,
          amount: payment.amount * 100, // payment.amount is in rupees, Razorpay expects paise
          currency: payment.currency ?? 'INR',
          name: 'NyayaX',
          description: `Consultation with ${lawyer.name}`,
          order_id: providerOrderId,
          handler: async (resp: any) => {
            try {
              // confirmPayment creates the appointment on the backend and
              // returns `{ success, appointmentId }`. We use the id to attach
              // pending docs to the freshly-created appointment.
              const confirmRes = await appointmentsApi.confirmPayment(payment.id, {
                appointmentId: payment.id,
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              })
              const confirmPayload = (confirmRes as any)?.data ?? confirmRes
              const apptId: string | null = confirmPayload?.appointmentId ?? null
              if (apptId) {
                await uploadPendingDocsTo(apptId)
              }
              setPaymentSuccess(true)
              try { await useNotificationStore.getState().fetchNotifications() } catch { }
              try { await useAppointmentStore.getState().fetchAppointments() } catch { }

              setToastVisible(true)
              setTimeout(() => {
                setIsModalOpen(false)
                setToastVisible(false)
                navigate('/app/appointments')
              }, 900)
            } catch (confirmErr: any) {
              console.error('Confirm payment error:', confirmErr)
              setBookingError('Payment succeeded but booking failed. Please contact support.')
              setPaymentLoading(false)
            }
          },
          prefill: {
            name: authUser?.name,
            email: (authUser as any)?.email,
            contact: (authUser as any)?.phone,
          },
          notes: { paymentId: payment.id },
          theme: { color: '#0B4D64' },
          modal: {
            ondismiss: () => {
              setPaymentLoading(false)
            }
          }
        }
        const rzp = new (window as any).Razorpay(options)
        rzp.on('payment.failed', () => {
          setPaymentLoading(false)
          setBookingError('Payment failed. The slot has NOT been booked — you can try again.')
        })
        rzp.open()
        return
      } catch (err: any) {
        console.error('Booking error', err)
        // No appointment was created, so no orphan cleanup needed
        const msg = err?.response?.data?.error || err?.message || 'Booking failed'
        if (msg.toLowerCase().includes('slot not available')) {
          setBookingError('This slot has already been booked. Please close this dialog and select a different time.')
          setSelectedSlot(null)
        } else {
          setBookingError(msg)
        }
      } finally {
        setPaymentLoading(false)
      }
    }
  }

  const headerStats = useMemo(() => ({
    rating: lawyer?.rating ?? 0,
    reviews: lawyer?.reviewsCount ?? 0,
    experience: lawyer?.experienceYears ?? 0,
    fee: lawyer?.fee ?? 0,
  }), [lawyer])

  const insufficientBalance = walletBalance < headerStats.fee

  if (loading) return <div className="text-center py-12">Loading...</div>
  if (error) return <div className="text-red-500 text-center py-12">{error}</div>
  if (!lawyer) return <div className="text-center py-12">Lawyer not found</div>

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4">
        <Link to="/app/home" className="hover:underline">Home</Link>
        <span className="mx-2">›</span>
        <Link to="/app/search" className="hover:underline">Lawyers</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{lawyer.name}</span>
      </nav>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="bg-white rounded-xl shadow-sm p-6 flex gap-6">
            <img
              src={lawyer.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(lawyer.name)}`}
              alt={lawyer.name}
              className="w-36 h-36  object-cover flex-shrink-0"
            />

            <div className="flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">{lawyer.name}</h1>
                  <div className="mt-2 text-sm text-gray-600">{Array.isArray(lawyer.specialization) ? lawyer.specialization.join(' • ') : (lawyer.specialization ?? '')}</div>
                  <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
                    <div>{headerStats.experience} years of experience </div>
                    <div>|</div>
                    <div>{lawyer.location}</div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  {lawyer.isVerified && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700 border border-green-200">
                      <Shield className="w-4 h-4" />
                      Court Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b">
            <div className="flex space-x-8">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors
                    ${activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-b-xl rounded-tr-xl">
            {activeTab === 'info' && <Info lawyerId={lawyer.id} />}
            {activeTab === 'reviews' && <Reviews lawyerId={lawyer.id} />}
            {activeTab === 'qa' && <QA />}
            {activeTab === 'articles' && <Articles />}
          </div>
        </div>

        {/* RIGHT: 1/3 */}
        <div className="lg:col-span-1" ref={bookingRef}>
          <h1 className="mt-3 mb-3 text-lg text-gray-600 font-semibold">Select your slot</h1>
          <div className="mt-2 sticky top-6 bg-white rounded-xl shadow-sm ">
            <div className="bg-primary rounded-t-xl p-4 text-white">
              <h2 className="text-lg font-semibold">Book a Consultation</h2>
            </div>
            <div className="p-6">
              <SlotSelect
                selectedDate={selectedDate}
                selectedSlot={selectedSlot}
                onDateChange={(d) => {
                  setSelectedDate(d)
                  setSelectedSlot(null)
                }}
                onSlotChange={(s) => setSelectedSlot(s)}
                lawyerId={lawyer.id}
              />

              {/* Fee display */}
              {headerStats.fee > 0 ? (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                  <span className="text-sm text-gray-600">Consultation Fee</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(headerStats.fee)}
                  </span>
                </div>
              ) : (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  This lawyer has not set their consultation fee yet. Booking is unavailable.
                </div>
              )}

              {/* Describe-the-issue + supporting documents — shown only after
                  a slot is picked so the flow reads: pick time → add context
                  → pay. The lawyer sees this content (and the AI-parsed text
                  from each doc) on their Appointments page. */}
              {selectedDate && selectedSlot && headerStats.fee > 0 && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  {/* Notes textarea (required, ≥10 chars) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Describe your issue
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        (min {MIN_NOTES_CHARS} characters)
                      </span>
                    </label>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES_CHARS))}
                      placeholder="What is the matter about? Any deadlines, prior context, or key facts the lawyer should know?"
                      className={`mt-1 block w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                        notes && !notesValid ? 'border-red-300' : 'border-gray-300 focus:border-primary'
                      }`}
                    />
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className={notesValid ? 'text-emerald-600' : 'text-gray-400'}>
                        {notesValid
                          ? 'Looks good — the lawyer can prepare ahead of the call.'
                          : `A bit more detail helps the lawyer prepare.`}
                      </span>
                      <span className={notesValid ? 'text-gray-400' : 'text-red-500'}>
                        {notesTrimmedLength} / {MIN_NOTES_CHARS}
                      </span>
                    </div>
                  </div>

                  {/* Documents picker (optional) */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium text-gray-700">
                        Attach documents
                        <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/5"
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
                      onChange={(e) => handleFilesPicked(e.target.files)}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      PDFs &amp; images work best. The lawyer can extract / OCR the text from each
                      file inside their appointment view before the call.
                    </p>

                    {pendingDocs.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {pendingDocs.map((d) => {
                          const isImg = (d.file.type || '').startsWith('image/')
                          return (
                            <li
                              key={d.localId}
                              className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
                                d.status === 'failed'
                                  ? 'border-red-200 bg-red-50'
                                  : d.status === 'uploaded'
                                    ? 'border-emerald-200 bg-emerald-50'
                                    : 'border-gray-200 bg-gray-50'
                              }`}
                            >
                              {isImg ? (
                                <ImageIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                              ) : (
                                <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-800 truncate">{d.file.name}</div>
                                <div className="text-xs text-gray-500">
                                  {(d.file.size / 1024).toFixed(0)} KB
                                  {d.status === 'uploading' && ' · Uploading…'}
                                  {d.status === 'uploaded' && ' · Attached'}
                                  {d.status === 'failed' && d.error && ` · ${d.error}`}
                                </div>
                              </div>
                              {d.status === 'uploading' && (
                                <Loader2 className="w-4 h-4 text-gray-500 animate-spin flex-shrink-0" />
                              )}
                              {(d.status === 'pending' || d.status === 'failed') && !paymentLoading && (
                                <button
                                  type="button"
                                  onClick={() => removePendingDoc(d.localId)}
                                  className="p-1 rounded hover:bg-gray-200 text-gray-500"
                                  aria-label="Remove file"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleBook}
              disabled={!selectedDate || !selectedSlot || headerStats.fee <= 0 || !notesValid}
              className="w-full"
            >
              {headerStats.fee <= 0
                ? 'Fee Not Set'
                : !selectedDate || !selectedSlot
                  ? 'Pick a slot first'
                  : !notesValid
                    ? `Describe issue (${notesTrimmedLength}/${MIN_NOTES_CHARS})`
                    : 'Book Consultation'}
            </Button>
          </div>
        </div>
      </div>

      {/* Modal: Booking + Payment Method Selection */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="text-lg font-semibold">Confirm & Pay</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-gray-600">Lawyer: <span className="font-medium">{lawyer.name}</span></div>
              <div className="text-sm text-gray-600">Date: <span className="font-medium">{selectedDate ? format(selectedDate, 'PPP') : '-'}</span></div>
              <div className="text-sm text-gray-600">Slot: <span className="font-medium">{selectedSlot ?? '-'}</span></div>
              <div className="text-sm text-gray-800">Amount: <span className="font-medium">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(headerStats.fee)}</span></div>

              {/* Payment Method Toggle */}
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm font-medium text-gray-700 mb-3">Payment Method</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setPaymentMethod('razorpay')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${paymentMethod === 'razorpay'
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <CreditCard className={`w-5 h-5 ${paymentMethod === 'razorpay' ? 'text-primary' : 'text-gray-400'}`} />
                    <div className="text-left">
                      <div className={`text-sm font-medium ${paymentMethod === 'razorpay' ? 'text-primary' : 'text-gray-700'}`}>Razorpay</div>
                      <div className="text-xs text-gray-400">Card / UPI / Bank</div>
                    </div>
                  </button>
                  <button
                    onClick={() => !insufficientBalance && setPaymentMethod('wallet')}
                    disabled={insufficientBalance}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${paymentMethod === 'wallet'
                      ? 'border-primary bg-primary/5'
                      : insufficientBalance
                        ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                        : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <Wallet className={`w-5 h-5 ${paymentMethod === 'wallet' ? 'text-primary' : 'text-gray-400'}`} />
                    <div className="text-left">
                      <div className={`text-sm font-medium ${paymentMethod === 'wallet' ? 'text-primary' : 'text-gray-700'}`}>Wallet</div>
                      <div className="text-xs text-gray-400">Bal: {fmt(walletBalance)}</div>
                    </div>
                  </button>
                </div>
                {insufficientBalance && paymentMethod !== 'wallet' && (
                  <p className="text-xs text-amber-600 mt-2">Insufficient wallet balance for this appointment.</p>
                )}
              </div>

              {paymentSuccess && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
                  <div className="font-medium">Payment successful ✅</div>
                  <div className="text-xs text-green-700/90">
                    You can attach supporting documents and view AI summaries from your <strong>Appointments</strong> list.
                  </div>
                </div>
              )}
              {bookingError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <div className="font-medium mb-1">⚠️ Booking Failed</div>
                  <div>{bookingError}</div>
                </div>
              )}
            </div>

            <div className="p-5 border-t flex items-center gap-3">
              <Button onClick={() => setIsModalOpen(false)} variant="ghost">Cancel</Button>
              <Button onClick={handlePayNow} className="ml-auto" disabled={paymentLoading || paymentSuccess || !selectedDate || !selectedSlot}>
                {paymentLoading ? 'Processing…' : paymentSuccess ? 'Paid' : paymentMethod === 'wallet' ? 'Pay from Wallet' : 'Pay Now'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Small toast */}
      {toastVisible && (
        <div className="fixed right-6 bottom-6 z-50">
          <div className="bg-green-600 text-white px-4 py-2 rounded shadow">Booking confirmed — redirecting…</div>
        </div>
      )}
    </div>
  )
}

export default LawyerDetailPage