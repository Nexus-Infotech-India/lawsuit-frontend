import { FC } from 'react'
import { BadgeCheck } from 'lucide-react'

interface EkycVerifiedBadgeProps {
  /** Show the badge only when this is true. Lets callers pass a falsy value
   *  without an outer ternary. */
  verified?: boolean | null
  /** Compact icon-only variant (no "Verified" label). */
  compact?: boolean
  className?: string
  title?: string
}

/**
 * Tiny pill that confirms a user's Aadhaar eKYC is complete. Used on
 * lawyer-facing client cards, profile headers, and anywhere we want to
 * surface trust at a glance. Renders nothing when `verified` is falsy so
 * callers can safely drop it inline.
 */
const EkycVerifiedBadge: FC<EkycVerifiedBadgeProps> = ({ verified, compact, className, title }) => {
  if (!verified) return null

  if (compact) {
    // Wrap in a span so the title attribute survives — lucide icons don't
    // accept it directly.
    return (
      <span title={title || 'Aadhaar verified'} aria-label="Aadhaar verified" className="inline-flex">
        <BadgeCheck className={`w-3.5 h-3.5 text-blue-500 ${className || ''}`} />
      </span>
    )
  }

  return (
    <span
      title={title || 'Aadhaar identity verified via UIDAI'}
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 ${className || ''}`}
    >
      <BadgeCheck className="w-3 h-3" />
      Verified
    </span>
  )
}

export default EkycVerifiedBadge
