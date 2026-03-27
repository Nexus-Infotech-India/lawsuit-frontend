import { FC, MouseEvent, useState, useEffect } from 'react'
import { appointmentsApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import useWalletStore from '@/stores/walletStore'
import { useNavigate } from 'react-router-dom'
import { Wallet, CreditCard, ShieldCheck } from 'lucide-react'

import SlotSelect from '../molecules/SlotSelect'

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
  const authUser = useAuthStore((s) => s.user)
  const walletBalance = useWalletStore((s) => s.balance)
  const fetchBalance = useWalletStore((s) => s.fetchBalance)
  const navigate = useNavigate();

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

  const handleConfirm = async () => {
    if (!selectedDate || !selectedSlot) return;
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

      if (paymentMethod === 'wallet') {
        // Wallet payment — instant booking
        await appointmentsApi.book({
          lawyerId: id,
          scheduledAt,
          durationMins: 30,
          meetingType: 'VIDEO_CALL',
          paymentMethod: 'wallet',
        })
        // Refresh wallet balance
        try { await fetchBalance() } catch { }
        setIsExpanded(false)
        setSelectedDate(null)
        setSelectedSlot(null)
        setIsProcessing(false)
        navigate('/app/appointments', { replace: true })
        return
      }

      // Razorpay flow — backend only creates a payment order (no appointment yet)
      const res = await appointmentsApi.book({ lawyerId: id, scheduledAt, durationMins: 30, meetingType: 'VIDEO_CALL' })
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
            // confirmPayment creates the appointment on the backend
            await appointmentsApi.confirmPayment(payment.id, {
              appointmentId: payment.id,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            })
            setIsExpanded(false)
            setSelectedDate(null)
            setSelectedSlot(null)
            navigate('/app/appointments', { replace: true })
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
              disabled={!selectedDate || !selectedSlot || isProcessing}
              className={`
                px-6 py-2 rounded-md font-medium transition-colors
                ${selectedDate && selectedSlot
                  ? 'bg-primary text-white hover:bg-primary/90'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }
              `}
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