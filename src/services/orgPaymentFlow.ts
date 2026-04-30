import { appointmentsApi } from '@/services/api'
import type { OrgAppointmentRequest } from '@/types'

/**
 * Razorpay checkout flow for an org-assigned appointment request.
 *
 * Triggered from two places:
 *  1. The client's "My firm requests" page when they tap the Pay-now button.
 *  2. The notification handler when a client taps an ORG_APPOINTMENT_REQUEST_ASSIGNED.
 *
 * Backend contract:
 *  - When the org assigned the lawyer, the response was
 *      { request, payment: { id, providerOrderId, amount /* rupees */, currency }, paidVia: 'razorpay' }
 *  - We open Razorpay checkout against payment.providerOrderId.
 *  - On success, we POST /appointments/confirm-payment WITHOUT an appointmentId — the backend
 *    resolves it via providerOrderId and creates the Appointment from the request's metadata.
 */
export interface StartCheckoutOptions {
  /** The org appointment request — must include payment info populated post-assignment. */
  request: OrgAppointmentRequest | undefined
  /**
   * If you don't have the request object handy (e.g. from a notification), pass these directly.
   * One of `request` or `payment` must be provided.
   */
  payment?: { id: string; providerOrderId: string; amount: number; currency?: string }
  /** Optional Razorpay prefill data. */
  prefill?: { name?: string; email?: string; contact?: string }
  onSuccess?: () => void
}

export async function startOrgRequestRazorpayCheckout(opts: StartCheckoutOptions): Promise<void> {
  const { request, prefill, onSuccess } = opts
  const payment = opts.payment ?? (request as any)?.payment
  if (!payment?.providerOrderId || !payment?.id) {
    throw new Error('No active payment order found for this request')
  }

  if (!(window as any).Razorpay) {
    throw new Error('Razorpay SDK not loaded — refresh the page and try again.')
  }

  const rzpKey = (import.meta.env.VITE_RAZORPAY_KEY as string) || ''
  const orgName = request?.organization?.name || 'Lawsuit'
  const lawyerName = request?.assignedLawyer?.name

  const options: any = {
    key: rzpKey,
    amount: payment.amount * 100, // payment.amount is in rupees, Razorpay needs paise
    currency: payment.currency ?? 'INR',
    name: 'NyayaX',
    description: lawyerName
      ? `Consultation with ${lawyerName} (${orgName})`
      : `Consultation with ${orgName}`,
    order_id: payment.providerOrderId,
    handler: async (resp: any) => {
      try {
        // Backend resolves the appointment from providerOrderId; appointmentId is unused.
        await appointmentsApi.confirmPayment(payment.id, {
          appointmentId: payment.id,
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_signature: resp.razorpay_signature,
        })
        onSuccess?.()
      } catch (err) {
        console.error('confirmPayment error', err)
        alert('Payment succeeded but booking confirmation failed. Please contact support.')
      }
    },
    prefill,
    notes: { paymentId: payment.id, requestId: request?.id },
    theme: { color: '#0B4D64' },
  }

  const rzp = new (window as any).Razorpay(options)
  rzp.on('payment.failed', () => {
    alert('Payment failed. Please try again.')
  })
  rzp.open()
}
