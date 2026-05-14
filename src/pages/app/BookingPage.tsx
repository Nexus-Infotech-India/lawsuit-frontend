import { FC } from 'react'
import { Navigate, useParams } from 'react-router-dom'

/**
 * Deep-link entry point for `/app/book/:lawyerId`.
 *
 * The actual booking UI (slot picker, notes textarea, document uploader,
 * payment-method toggle, Razorpay handoff) lives inside the lawyer-detail
 * page's expandable booking card — see `LawyerDetailPage.tsx` and the
 * `LawyerCard` it renders. This page used to be a 14-line stub that just
 * read the lawyer id from the URL and rendered an empty heading, which
 * meant external links like booking notifications or shared search URLs
 * silently 404'd.
 *
 * Redirecting to `/app/lawyers/:lawyerId?book=1` lands the user on the
 * lawyer-detail page with the booking flow primed. If no lawyer id is
 * present in the URL we send them to the search page so they can pick one.
 */
const BookingPage: FC = () => {
  const { lawyerId } = useParams<{ lawyerId: string }>()
  if (!lawyerId) return <Navigate to="/app/search" replace />
  return <Navigate to={`/app/lawyers/${lawyerId}?book=1`} replace />
}

export default BookingPage
