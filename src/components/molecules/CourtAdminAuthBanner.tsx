import { FC, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import { courtAdminExtApi } from '@/services/api'

/**
 * Status pulled from `GET /court-admin/me/authorization`. The server
 * returns `{ courtAdmin, history }` and the court admin row carries TWO
 * independent status fields:
 *
 *   - `verificationStatus`: the super-admin gate
 *     (PENDING_SUPER_ADMIN_APPROVAL | APPROVED | REJECTED)
 *   - `status`: the operational state
 *     (ACTIVE | INACTIVE | SUSPENDED)
 *
 * The previous implementation treated these as a single string and used
 * a non-existent `AUTHORIZED` enum value, so unmatched statuses returned
 * `undefined` from the config lookup → `cfg.color` crashed. We now read
 * both fields, derive a single banner state, and bail safely when the
 * shape is unexpected.
 */
type VerificationStatus = 'PENDING_SUPER_ADMIN_APPROVAL' | 'APPROVED' | 'REJECTED'
type OperationalStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'

interface CourtAdminAuthRow {
  id?: string
  verificationStatus?: VerificationStatus | string
  status?: OperationalStatus | string
  isAuthorized?: boolean
  rejectionReason?: string | null
  authorizedAt?: string | null
}

type BannerKind = 'PENDING' | 'REJECTED' | 'SUSPENDED' | 'INACTIVE'

const CourtAdminAuthBanner: FC = () => {
  const [row, setRow] = useState<CourtAdminAuthRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [reapplying, setReapplying] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await courtAdminExtApi.getMyAuthorization()
      const data = (res as any).data ?? res
      // The server returns `{ courtAdmin, history }`. Be defensive — old
      // deploys may have returned the row directly; fall back to that
      // shape so a stale build doesn't blank the banner.
      const ca =
        data?.courtAdmin ??
        data?.data?.courtAdmin ??
        (data && typeof data === 'object' && ('verificationStatus' in data || 'status' in data) ? data : null)
      setRow((ca as CourtAdminAuthRow) || null)
    } catch {
      setRow(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleReapply = async () => {
    setReapplying(true)
    setMsg(null)
    try {
      await courtAdminExtApi.reapply()
      setMsg('Re-applied — your request is pending super admin review.')
      await load()
    } catch (err: any) {
      setMsg(err?.response?.data?.error || 'Failed to re-apply')
    } finally {
      setReapplying(false)
    }
  }

  // Derive a single banner kind from the two status fields. The
  // operational status (SUSPENDED / INACTIVE) takes priority because
  // it's more recent — a super-admin approval is meaningless if the
  // account is currently suspended.
  const kind: BannerKind | null = useMemo(() => {
    if (!row) return null
    const op = String(row.status || '').toUpperCase() as OperationalStatus | ''
    const verif = String(row.verificationStatus || '').toUpperCase() as VerificationStatus | ''
    if (op === 'SUSPENDED') return 'SUSPENDED'
    if (op === 'INACTIVE') return 'INACTIVE'
    if (verif === 'REJECTED') return 'REJECTED'
    if (verif === 'PENDING_SUPER_ADMIN_APPROVAL') return 'PENDING'
    // Anything else (APPROVED + ACTIVE, plus unknown values) → no banner.
    return null
  }, [row])

  if (loading || !kind) return null

  const config: Record<BannerKind, { color: string; icon: React.ReactNode; title: string; body: string }> = {
    PENDING: {
      color: 'bg-amber-50 border-amber-200 text-amber-900',
      icon: <Clock className="w-5 h-5 text-amber-600" />,
      title: 'Awaiting super admin approval',
      body: 'Your account is pending review. You can edit your profile, but verification actions unlock once approved.',
    },
    REJECTED: {
      color: 'bg-red-50 border-red-200 text-red-900',
      icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
      title: 'Application rejected',
      body: row?.rejectionReason || 'Your application was rejected. You may re-apply with updated details.',
    },
    SUSPENDED: {
      color: 'bg-red-50 border-red-200 text-red-900',
      icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
      title: 'Account suspended',
      body: row?.rejectionReason || 'Your account is suspended. Contact platform support.',
    },
    INACTIVE: {
      color: 'bg-gray-50 border-gray-200 text-gray-900',
      icon: <CheckCircle2 className="w-5 h-5 text-gray-500" />,
      title: 'Account inactive',
      body: 'Your account is inactive. Contact platform support if this is unexpected.',
    },
  }

  // Should never be undefined now that BannerKind is locked to the four
  // values in config, but keep the defensive bail so a future enum-add
  // can't crash the page.
  const cfg = config[kind]
  if (!cfg) return null

  return (
    <div className={`border rounded-xl p-4 ${cfg.color} flex items-start gap-3`}>
      <div className="flex-shrink-0">{cfg.icon}</div>
      <div className="flex-1">
        <div className="font-semibold">{cfg.title}</div>
        <div className="text-sm mt-0.5 opacity-90">{cfg.body}</div>
        {msg && <div className="text-xs mt-2">{msg}</div>}
      </div>
      {kind === 'REJECTED' && (
        <button
          onClick={handleReapply}
          disabled={reapplying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reapplying ? 'animate-spin' : ''}`} />
          Re-apply
        </button>
      )}
    </div>
  )
}

export default CourtAdminAuthBanner
