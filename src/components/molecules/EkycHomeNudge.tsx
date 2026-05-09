import { FC, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, ArrowRight, X } from 'lucide-react'
import useEkycStatus from '@/hooks/useEkycStatus'

const DISMISS_KEY = 'ekyc-home-nudge-dismissed'

/**
 * Minimal banner shown at the top of the client HomePage when their Aadhaar
 * is not verified. Renders nothing for non-CLIENT roles, verified clients,
 * during the status fetch, or after the user dismisses it (per-session, via
 * sessionStorage — re-appears on next sign-in so they don't forget).
 */
const EkycHomeNudge: FC = () => {
  const { isClient, isVerified, isLoading, pending } = useEkycStatus()
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (!isClient || isLoading || isVerified || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-amber-50/30 p-4 sm:p-5 flex items-start gap-3 sm:gap-4">
      <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
        <ShieldCheck className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm sm:text-base font-semibold text-indigo-900">
          {pending ? 'Finish your Aadhaar verification' : 'Verify your Aadhaar to unlock everything'}
        </h3>
        <p className="text-xs sm:text-sm text-indigo-800/90 mt-0.5">
          {pending
            ? "We sent you an OTP — enter it to complete verification."
            : 'Required for booking consultations, withdrawing money, and filing cases. Takes about 60 seconds.'}
        </p>
      </div>
      <Link
        to="/app/ekyc"
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs sm:text-sm font-medium hover:bg-indigo-700 flex-shrink-0"
      >
        {pending ? 'Continue' : 'Verify'} <ArrowRight className="w-3 h-3" />
      </Link>
      <button
        onClick={handleDismiss}
        className="text-indigo-400 hover:text-indigo-700 p-1 -mr-1 flex-shrink-0"
        aria-label="Dismiss"
        title="Dismiss for this session"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default EkycHomeNudge
