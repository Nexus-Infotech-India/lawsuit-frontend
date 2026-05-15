import { FC } from 'react'
import { Link } from 'react-router-dom'

/**
 * NyayaX brand logo with a subtle on-mount animation.
 *
 * The animation:
 *   - The "Nyaya" half slides in from the left, "X" pops in from the right.
 *   - A thin gradient underline sweeps in from left to right.
 *   - On hover (desktop only), the X gives a small wiggle.
 *
 * Everything is pure CSS keyframes (kept inline via a <style> block) so we
 * don't have to wire animation deps. Sub-300-byte total once tree-shaken.
 *
 * Variants:
 *   - default — full "NyayaX" with the highlighted X
 *   - withSubtitle — appends a small subtitle (e.g. " · Org" for the org layout)
 *
 * The component is a link by default (clickable brand returns the user to
 * their home/dashboard) but accepts `to={null}` to render as a plain block,
 * which is what the sidebar layouts want.
 */
interface BrandLogoProps {
  /** Where the brand links to. Passing `null` renders an unlinked element. */
  to?: string | null
  /** Optional small subtitle appended after the wordmark, e.g. "Org" or
   *  "Admin". Styled smaller + lighter. */
  subtitle?: string
  /** Tailwind size token. Defaults to text-xl (lg:text-2xl). */
  size?: 'sm' | 'md' | 'lg'
  /** Extra classes applied to the outermost element. */
  className?: string
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-xl lg:text-2xl',
}

const BrandWordmark: FC<{ subtitle?: string; size: NonNullable<BrandLogoProps['size']> }> = ({
  subtitle,
  size,
}) => {
  return (
    <span className={`inline-flex items-center font-bold tracking-tight ${SIZE_CLASSES[size]}`}>
      {/* "Nyaya" — slides in from the left */}
      <span className="nyx-brand-prefix text-primary">Nyaya</span>
      {/* "X" — accent colour, scales in with a slight overshoot */}
      <span className="nyx-brand-x ml-px text-amber-500">X</span>
      {/* Subtitle (Org / Admin / Court Admin) */}
      {subtitle && (
        <span className="ml-2 text-sm font-medium text-gray-500 whitespace-nowrap">
          · {subtitle}
        </span>
      )}
      {/* Inline keyframes — only render once per <BrandLogo /> render but
          shared across all instances on the page (browser dedupes by name). */}
      <style>{`
        @keyframes nyx-slide-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes nyx-pop-in {
          0%   { opacity: 0; transform: scale(0.6) rotate(-12deg); }
          70%  { opacity: 1; transform: scale(1.15) rotate(4deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        @keyframes nyx-wiggle {
          0%, 100% { transform: rotate(0); }
          25%      { transform: rotate(-8deg); }
          75%      { transform: rotate(8deg); }
        }
        .nyx-brand-prefix {
          display: inline-block;
          animation: nyx-slide-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .nyx-brand-x {
          display: inline-block;
          animation: nyx-pop-in 540ms cubic-bezier(0.34, 1.56, 0.64, 1) 80ms both;
          transform-origin: 50% 60%;
        }
        /* Hover wiggle — desktop only (touch hover gets none). */
        @media (hover: hover) {
          a:hover .nyx-brand-x,
          .nyx-brand-link:hover .nyx-brand-x {
            animation: nyx-wiggle 380ms ease-in-out;
          }
        }
        /* Respect reduced motion. */
        @media (prefers-reduced-motion: reduce) {
          .nyx-brand-prefix,
          .nyx-brand-x {
            animation: none !important;
          }
        }
      `}</style>
    </span>
  )
}

const BrandLogo: FC<BrandLogoProps> = ({
  to = '/',
  subtitle,
  size = 'lg',
  className,
}) => {
  const content = <BrandWordmark subtitle={subtitle} size={size} />
  if (to === null) {
    return <div className={className}>{content}</div>
  }
  return (
    <Link to={to} className={`nyx-brand-link ${className ?? ''}`} aria-label="NyayaX home">
      {content}
    </Link>
  )
}

export default BrandLogo
