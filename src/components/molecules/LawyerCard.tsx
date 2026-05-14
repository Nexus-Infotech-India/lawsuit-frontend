import { FC, MouseEvent, useState, useEffect, useRef } from 'react'
import { appointmentsApi, storageApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import useWalletStore from '@/stores/walletStore'
import { useNavigate } from 'react-router-dom'
import { Wallet, CreditCard, ShieldCheck, Paperclip, FileText, Image as ImageIcon, X, Loader2 } from 'lucide-react'
import { pickCloudinaryResourceType } from '@/utils/cloudinaryUpload'

import SlotSelect from '../molecules/SlotSelect'

/**
 * Per-file upload state for documents the client wants to share with the
 * lawyer ahead of the consultation. We keep the picked `File` object around
 * so we can defer the upload until AFTER booking succeeds — that way a
 * failed booking doesn't leave orphan files in Cloudinary, and a successful
 * booking can attach the docs to the freshly-minted `appointmentId`.
 */
interface PendingDoc {
  /** Local UUID for keying the list and tracking upload state. */
  localId: string
  file: File
  status: 'pending' | 'uploading' | 'uploaded' | 'failed'
  error?: string
}

/** Hard cap that matches the chat-attachment limit. */
const MAX_DOC_MB = 10
const MAX_DOC_BYTES = MAX_DOC_MB * 1024 * 1024
/** Minimum description length so the lawyer has enough context to triage. */
const MIN_NOTES_CHARS = 10
const MAX_NOTES_CHARS = 1000

interface LawyerCardProps {
  id: string;
  name: string;
  specialization: string[];
  experienceYears: number;
  rating: number;
  fee: number;
  location: string;
  languages: string[];
  avatar?: string;
  distance?: number;
  isVerified?: boolean;
  onView: (id: string) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const LawyerCard: FC<LawyerCardProps> = ({
  id,
  name,
  specialization,
  experienceYears,
  rating,
  fee,
  location,
  languages,
  avatar,
  distance,
  isVerified,
  onView,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'wallet'>('razorpay')
  // Brief written description of the issue (≥10 chars). The lawyer reads
  // this in their appointment card; the server stores it on Appointment.notes.
  const [notes, setNotes] = useState('')
  // Documents the client wants the lawyer to see ahead of the call.
  // Held client-side until booking succeeds, then uploaded to Cloudinary and
  // attached via `POST /appointments/:id/documents` — that endpoint hooks
  // the file into the existing OCR + AI-summary pipeline, so by the time
  // the lawyer opens the appointment the extracted text is ready.
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const authUser = useAuthStore((s) => s.user)
  const walletBalance = useWalletStore((s) => s.balance)
  const fetchBalance = useWalletStore((s) => s.fetchBalance)
  const navigate = useNavigate();

  const notesTrimmedLength = notes.trim().length
  const notesValid = notesTrimmedLength >= MIN_NOTES_CHARS

  useEffect(() => {
    if (isExpanded) {
      fetchBalance()
    }
  }, [isExpanded])

  const insufficientBalance = walletBalance < fee

  const handleConsultNow = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  // Reset the booking widget after a successful flow (or when the user
  // collapses it). Centralised so we don't accidentally leak pending docs
  // or stale notes into a subsequent booking attempt.
  const resetBookingState = () => {
    setIsExpanded(false)
    setSelectedDate(null)
    setSelectedSlot(null)
    setNotes('')
    setPendingDocs([])
    setErrorMsg(null)
  }

  // Add picked files to the staged list. We validate size up-front and
  // surface a per-file error rather than aborting the whole pick — the
  // user might pick 3 valid files and 1 oversize file, and we want the
  // 3 to still queue.
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
   * Upload all `pending` docs to Cloudinary then attach each one to the
   * just-created appointment. Best-effort — if Cloudinary or the attach
   * call fails for a file we mark it `failed` and keep going; the booking
   * itself isn't rolled back because the lawyer can still see the typed
   * notes, and the client can re-upload via the AppointmentDocumentsPanel
   * later.
   */
  const uploadPendingDocsTo = async (appointmentId: string) => {
    const docsToUpload = pendingDocs.filter((d) => d.status === 'pending')
    if (docsToUpload.length === 0) return

    // One signed payload covers an entire upload session — Cloudinary's
    // timestamp tolerance is generous enough for serial uploads.
    let sig: any
    try {
      const sigRes = await storageApi.getSignature('appointment-docs')
      sig = (sigRes as any)?.data ?? sigRes
    } catch (err: any) {
      // Mark everything failed but don't block the booking — the appointment
      // is already created server-side.
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
        // PDFs go on /image/upload alongside true images so they're
        // served with `Content-Type: application/pdf` and render inline
        // on download. /raw/upload would store them with octet-stream
        // and break the lawyer-side preview.
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

        // Attach to the appointment — server creates the Document row + kicks
        // off OCR/extract so the lawyer's appointment card shows the parsed
        // text by the time they open it.
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

  const handleConfirm = async () => {
    if (!selectedDate || !selectedSlot) return;
    // Notes are required (≥10 chars) so the lawyer has enough context to
    // prepare. The form gates the button on `notesValid` too, but we
    // re-check here so a fuzzed click can't slip past the gate.
    if (!notesValid) {
      setErrorMsg(`Please describe your issue in at least ${MIN_NOTES_CHARS} characters.`)
      return
    }
    setErrorMsg(null)
    setIsProcessing(true)

    // parse selectedSlot like "9:30 AM" into hours/minutes
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

    try {
      const scheduledAt = parseSlotToISO(selectedDate, selectedSlot)
      const trimmedNotes = notes.trim()

      if (paymentMethod === 'wallet') {
        // Wallet payment — instant booking
        const res = await appointmentsApi.book({
          lawyerId: id,
          scheduledAt,
          durationMins: 30,
          meetingType: 'VIDEO_CALL',
          paymentMethod: 'wallet',
          notes: trimmedNotes,
        })
        // Refresh wallet balance
        try { await fetchBalance() } catch { }

        // Attach any pending documents to the appointment we just created.
        // Best-effort: failures are surfaced in the picker UI but never
        // block navigation away from the widget.
        const appointmentId =
          (res as any)?.data?.appointment?.id ?? (res as any)?.appointment?.id
        if (appointmentId) {
          await uploadPendingDocsTo(appointmentId)
        }

        setIsProcessing(false)
        resetBookingState()
        navigate(authUser?.role === 'LAWYER' ? '/lawyer/appointments' : '/app/appointments', { replace: true })
        return
      }

      // Razorpay flow — backend only creates a payment order (no appointment yet)
      const res = await appointmentsApi.book({
        lawyerId: id,
        scheduledAt,
        durationMins: 30,
        meetingType: 'VIDEO_CALL',
        notes: trimmedNotes,
      })
      const payload = res.data || res

      if (payload.error) {
        throw new Error(payload.error)
      }

      const payment = payload.payment
      if (!payment?.id) {
        console.error('Unexpected booking response:', payload)
        throw new Error('Failed to create payment order. Please try again.')
      }

      const providerOrderId = payment.providerOrderId
      if (!providerOrderId) {
        throw new Error('Payment order could not be created. Please try again later.')
      }

      const rzpKey = (import.meta.env.VITE_RAZORPAY_KEY as string) || ''
      if (!(window as any).Razorpay) {
        throw new Error('Payment gateway not loaded. Please refresh the page.')
      }

      const options: any = {
        key: rzpKey,
        amount: payment.amount * 100, // payment.amount is in rupees, Razorpay expects paise
        currency: payment.currency ?? 'INR',
        name: 'NyayaX',
        description: `Consultation with ${name}`,
        order_id: providerOrderId,
        handler: async (resp: any) => {
          try {
            // confirmPayment now returns `{ success, appointmentId }` — we
            // use the id to attach pending docs to the freshly-created
            // appointment. Falling back to a navigate-only flow if the
            // server didn't return one (older deploys).
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
            resetBookingState()
            navigate(authUser?.role === 'LAWYER' ? '/lawyer/appointments' : '/app/appointments', { replace: true })
          } catch (err) {
            console.error('Confirm payment failed', err)
            setErrorMsg('Payment succeeded but booking confirmation failed. Please contact support.')
          } finally {
            setIsProcessing(false)
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
            setIsProcessing(false)
          }
        }
      }

      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', () => {
        setIsProcessing(false)
        setErrorMsg('Payment failed. The slot has NOT been booked — you can try again.')
      })
      rzp.open()
      return
    } catch (err: any) {
      console.error('Booking error', err)
      const msg = err?.response?.data?.error || err?.message || 'Booking failed'
      if (msg.toLowerCase().includes('slot not available')) {
        setErrorMsg('This slot has already been booked. Please select a different time.')
        setSelectedSlot(null)
      } else {
        setErrorMsg(msg)
      }
      setIsProcessing(false)
    }
  }

  return (
    <div
      className={`
        group relative p-6 rounded-lg bg-white
        transition-all duration-300
        ${isExpanded ? 'shadow-lg' : 'hover:shadow-lg hover:bg-gray-50'}
      `}
    >
      {/* ==== LEFT: Avatar + Hover "View Profile" ==== */}
      <div className="flex items-start gap-6">
        <div className="relative">
          <img
            src={
              avatar ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=200`
            }
            alt={name}
            className="w-24 h-24 rounded-full object-cover flex-shrink-0"
          />

          {/* Hover-only "View Profile" text */}
          <p
            onClick={(e) => {
              e.stopPropagation();
              onView(id);
            }}
            className="absolute left-0 right-0 -bottom-10 text-center
                       text-sm font-medium text-primary
                       opacity-0 group-hover:opacity-100
                       transition-opacity duration-200 cursor-pointer"
          >
            View Profile
          </p>
        </div>

        {/* ==== CENTER: Info ==== */}
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              {/* Clickable name + verified badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <h3
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(id);
                  }}
                  className="text-xl font-semibold text-gray-900
                             cursor-pointer hover:text-primary transition-colors"
                >
                  {name}
                </h3>
                {isVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                    <ShieldCheck className="w-3 h-3" />
                    Verified
                  </span>
                )}
              </div>

              <div className="mt-1 text-sm font-medium text-primary">
                {specialization.join(' • ')}
              </div>

              <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {experienceYears} years experience
                </span>
                <span>•</span>
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {location}
                </span>
                {distance != null && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center text-blue-600 font-medium">
                      📍 {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} away
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* ==== RIGHT: Rating, Fee, Availability, Consult ==== */}
            <div className="text-right space-y-2">
              <div className="flex items-center justify-end gap-1 text-sm text-green-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Available Now
              </div>

              {/* Fee */}
              <div className="text-lg font-semibold text-primary">
                {fmt(fee)}/hr
              </div>

              {/* Availability + Consult Now */}
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  onClick={handleConsultNow}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-primary rounded-md
                             hover:bg-primary/90 transition-colors"
                >
                  Consult Now
                </button>
              </div>
            </div>
          </div>

          {/* Languages */}
          <div className="mt-4 text-sm text-gray-500">
            Languages:{' '}
            <span className="text-gray-700">{languages.join(', ')}</span>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-1 mt-2">
            <span className="text-yellow-400">★</span>
            <span className="font-medium text-gray-900">{rating}</span>
            <span className="text-sm text-gray-500 ml-2">(261 Reviews)</span>
          </div>
        </div>
      </div>

      {/* ==== EXPANDED SECTION ==== */}
      {isExpanded && (
        <div className="mt-6 border-t pt-6 animate-in slide-in-from-top-2 duration-300">
          <SlotSelect
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            onDateChange={setSelectedDate}
            onSlotChange={setSelectedSlot}
            lawyerId={id}
          />

          {/* Describe-the-issue + supporting documents — shown only after a
              slot is picked so the booking flow reads naturally:
              pick time → add context → pay. The lawyer sees this content
              from their Appointments page once the booking lands. */}
          {selectedDate && selectedSlot && (
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
                  PDFs &amp; images work best. The lawyer can extract / OCR the text from each file
                  inside their appointment view before the call.
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
                          {(d.status === 'pending' || d.status === 'failed') && !isProcessing && (
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

          {/* Payment Method Toggle */}
          {selectedDate && selectedSlot && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm font-medium text-gray-700 mb-2">Payment Method</div>
              <div className="flex gap-3">
                <button
                  onClick={() => setPaymentMethod('razorpay')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${paymentMethod === 'razorpay'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <CreditCard className={`w-4 h-4 ${paymentMethod === 'razorpay' ? 'text-primary' : 'text-gray-400'}`} />
                  <span className={`text-sm font-medium ${paymentMethod === 'razorpay' ? 'text-primary' : 'text-gray-700'}`}>Razorpay</span>
                </button>
                <button
                  onClick={() => !insufficientBalance && setPaymentMethod('wallet')}
                  disabled={insufficientBalance}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${paymentMethod === 'wallet'
                    ? 'border-primary bg-primary/5'
                    : insufficientBalance
                      ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                      : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <Wallet className={`w-4 h-4 ${paymentMethod === 'wallet' ? 'text-primary' : 'text-gray-400'}`} />
                  <span className={`text-sm font-medium ${paymentMethod === 'wallet' ? 'text-primary' : 'text-gray-700'}`}>Wallet ({fmt(walletBalance)})</span>
                </button>
              </div>
              {insufficientBalance && (
                <p className="text-xs text-amber-600 mt-1.5">Insufficient wallet balance.</p>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleConfirm}
              disabled={!selectedDate || !selectedSlot || !notesValid || isProcessing}
              className={`
                px-6 py-2 rounded-md font-medium transition-colors
                ${selectedDate && selectedSlot && notesValid
                  ? 'bg-primary text-white hover:bg-primary/90'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }
              `}
              title={
                !selectedDate || !selectedSlot
                  ? 'Pick a date and time first'
                  : !notesValid
                    ? `Describe your issue in at least ${MIN_NOTES_CHARS} characters first`
                    : undefined
              }
            >
              {isProcessing ? 'Processing…' : paymentMethod === 'wallet' ? 'Pay from Wallet' : 'Confirm Booking'}
            </button>
          </div>
          {errorMsg && <div className="mt-2 text-red-500 text-sm">{errorMsg}</div>}
        </div>
      )}
    </div>
  );
};

export default LawyerCard;