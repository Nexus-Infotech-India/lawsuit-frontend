import { FC, useEffect, useState } from 'react'
import { Wallet, Loader2, RefreshCw, Check, AlertTriangle, Building2, Scale } from 'lucide-react'
import { adminApi } from '@/services/api'
import { unwrapList, unwrapObject } from '@/utils/unwrap'
import { friendlyError } from '@/utils/errors'

type PayoutStatus = 'HELD_BY_PLATFORM' | 'PAYABLE' | 'PAID_OUT' | 'REFUNDED'
type BeneficiaryType = 'LAWYER' | 'ORGANIZATION'

interface Beneficiary {
  id?: string
  name?: string
  email?: string
  avatarUrl?: string | null
}

interface Payout {
  id: string
  amount: number
  netPayable?: number
  platformFee?: number
  payoutStatus?: PayoutStatus | string
  status?: string // generic payment status
  isDisputed?: boolean
  createdAt: string
  beneficiaryType?: BeneficiaryType | string
  beneficiaryUserId?: string
  beneficiary?: Beneficiary | null
  appointmentId?: string
  appointment?: {
    id?: string
    scheduledAt?: string
    status?: string
    client?: { id?: string; name?: string; email?: string }
    lawyer?: { id?: string; name?: string; email?: string }
  } | null
}

interface SummaryBucket {
  amount?: number
  netPayable?: number
  count?: number
}

interface Summary {
  heldByPlatform?: SummaryBucket
  payable?: SummaryBucket
  paidOut?: SummaryBucket
  refunded?: SummaryBucket
  disputed?: SummaryBucket
}

const fmt = (n?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number.isFinite(Number(n)) ? Number(n) : 0,
  )

const STATUS_LABEL: Record<string, string> = {
  HELD_BY_PLATFORM: 'Held in escrow',
  PAYABLE: 'Payable',
  PAID_OUT: 'Paid out',
  REFUNDED: 'Refunded',
}

const statusBadge = (s?: string) => {
  const c = (s || '').toUpperCase()
  if (c === 'HELD_BY_PLATFORM' || c === 'HELD') return 'bg-amber-50 text-amber-700 border border-amber-100'
  if (c === 'PAYABLE') return 'bg-indigo-50 text-indigo-700 border border-indigo-100'
  if (c === 'PAID_OUT' || c === 'RELEASED') return 'bg-green-50 text-green-700 border border-green-100'
  if (c === 'REFUNDED') return 'bg-blue-50 text-blue-700 border border-blue-100'
  if (c === 'DISPUTED') return 'bg-red-50 text-red-700 border border-red-100'
  return 'bg-gray-100 text-gray-700 border border-gray-200'
}

const FILTERS: Array<{ value: '' | PayoutStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'HELD_BY_PLATFORM', label: 'Held' },
  { value: 'PAYABLE', label: 'Payable' },
  { value: 'PAID_OUT', label: 'Paid out' },
  { value: 'REFUNDED', label: 'Refunded' },
]

const AdminPayoutsPage: FC = () => {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'' | PayoutStatus>('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = async () => {
    setLoading(true)
    try {
      const [list, sum] = await Promise.all([
        adminApi.listPayouts({ payoutStatus: statusFilter || undefined, limit: 50 }),
        adminApi.getPayoutSummary(),
      ])
      setPayouts(unwrapList<Payout>(list.data))
      setSummary(unwrapObject<Summary>(sum.data, 'summary') ?? {})
    } catch (err: any) {
      showToast(friendlyError(err, 'Failed to load payouts'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const handleAction = async (id: string, action: 'disburse' | 'refund' | 'dispute') => {
    let reason: string | undefined
    if (action === 'refund' || action === 'dispute') {
      reason = prompt(`Reason for ${action}?`) || undefined
      if (!reason) return
    } else {
      if (!confirm('Disburse this payout to the beneficiary?')) return
    }
    setBusyId(id)
    try {
      if (action === 'disburse') await adminApi.disbursePayout(id)
      else if (action === 'refund') await adminApi.refundPayout(id, reason)
      else await adminApi.openDispute(id, reason)
      showToast(
        action === 'disburse' ? 'Payout disbursed' : action === 'refund' ? 'Refund processed' : 'Dispute opened',
        'success',
      )
      await load()
    } catch (err: any) {
      showToast(friendlyError(err, `Could not ${action} payout`), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const recipientCell = (p: Payout) => {
    // The server only sets `beneficiary` once `payoutStatus` advances past
    // HELD_BY_PLATFORM (i.e. once the system knows who gets paid). For older
    // / pending rows that field is null, so we fall back through the chain:
    // beneficiary → appointment.lawyer → appointment.client → raw IDs. This
    // matches mobile's `AdminPayoutsScreen` rendering exactly.
    const fallback =
      p.appointment?.lawyer?.name ||
      p.appointment?.lawyer?.email ||
      p.appointment?.client?.name ||
      p.appointment?.client?.email
    const name =
      p.beneficiary?.name?.trim() ||
      p.beneficiary?.email ||
      fallback ||
      p.beneficiaryUserId?.slice(0, 8) ||
      'Awaiting recipient'
    const subtitle =
      p.beneficiary?.email ||
      (fallback && fallback !== name ? fallback : null) ||
      (p.beneficiaryType
        ? p.beneficiaryType.replace(/_/g, ' ').toLowerCase()
        : p.appointment?.lawyer
          ? 'lawyer (pending)'
          : p.appointment?.client
            ? 'client (pending)'
            : 'recipient not yet assigned')
    const isOrg = p.beneficiaryType === 'ORGANIZATION'
    const Icon = isOrg ? Building2 : Scale
    return (
      <div className="flex items-center gap-3 min-w-0">
        {p.beneficiary?.avatarUrl ? (
          <img
            src={p.beneficiary.avatarUrl}
            alt=""
            className="w-9 h-9 rounded-full object-cover bg-gray-100 flex-shrink-0"
          />
        ) : (
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isOrg ? 'bg-purple-50 text-purple-600' : 'bg-indigo-50 text-indigo-600'}`}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="min-w-0">
          <div className="font-medium text-gray-900 truncate">{name}</div>
          <div className="text-xs text-gray-500 truncate">{subtitle}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payouts &amp; Escrow</h1>
          <p className="text-sm text-gray-500">
            Disburse held funds to lawyers &amp; organizations, process refunds, and manage disputes.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SumCard
            label="Held in escrow"
            value={fmt(summary.heldByPlatform?.amount)}
            sub={`${summary.heldByPlatform?.count ?? 0} payment${(summary.heldByPlatform?.count ?? 0) === 1 ? '' : 's'}`}
            tone="amber"
          />
          <SumCard
            label="Paid out"
            value={fmt(summary.paidOut?.amount)}
            sub={`${summary.paidOut?.count ?? 0} payment${(summary.paidOut?.count ?? 0) === 1 ? '' : 's'}`}
            tone="green"
          />
          <SumCard
            label="Refunded"
            value={fmt(summary.refunded?.amount)}
            sub={`${summary.refunded?.count ?? 0} payment${(summary.refunded?.count ?? 0) === 1 ? '' : 's'}`}
            tone="blue"
          />
          <SumCard
            label="Disputed"
            value={`${summary.disputed?.count ?? 0}`}
            sub={summary.disputed?.amount ? fmt(summary.disputed.amount) : 'Open cases'}
            tone="red"
          />
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value || 'ALL'}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              statusFilter === f.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : payouts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
          <Wallet className="w-12 h-12 mx-auto text-gray-300" />
          <p className="mt-3 text-gray-500">No payouts in this view.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Gross</th>
                  <th className="px-4 py-3">Net payable</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payouts.map((p) => {
                  const status = (p.payoutStatus || p.status || '').toString()
                  const label = STATUS_LABEL[status] || status.replace(/_/g, ' ').toLowerCase() || '—'
                  const canDisburse = status === 'PAYABLE' || status === 'HELD_BY_PLATFORM'
                  const canRefund = status === 'HELD_BY_PLATFORM' || status === 'PAYABLE'
                  const canDispute = !p.isDisputed && status !== 'PAID_OUT' && status !== 'REFUNDED'
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 max-w-[280px]">{recipientCell(p)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{fmt(p.amount)}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmt(p.netPayable ?? p.amount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusBadge(status)}`}
                        >
                          {label}
                        </span>
                        {p.isDisputed && (
                          <span className="ml-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                            DISPUTE
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(p.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {canDisburse && (
                            <button
                              onClick={() => handleAction(p.id, 'disburse')}
                              disabled={busyId === p.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" /> Disburse
                            </button>
                          )}
                          {canRefund && (
                            <button
                              onClick={() => handleAction(p.id, 'refund')}
                              disabled={busyId === p.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                            >
                              Refund
                            </button>
                          )}
                          {canDispute && (
                            <button
                              onClick={() => handleAction(p.id, 'dispute')}
                              disabled={busyId === p.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <AlertTriangle className="w-3 h-3" /> Dispute
                            </button>
                          )}
                          {!canDisburse && !canRefund && !canDispute && (
                            <span className="text-xs text-gray-400">No action</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50">
          <div
            className={`px-5 py-3 rounded-xl shadow-lg text-white ${
              toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}

const TONE_BG: Record<string, string> = {
  amber: 'border-amber-100 bg-amber-50/40',
  green: 'border-green-100 bg-green-50/40',
  blue: 'border-blue-100 bg-blue-50/40',
  red: 'border-red-100 bg-red-50/40',
}
const TONE_LABEL: Record<string, string> = {
  amber: 'text-amber-700',
  green: 'text-green-700',
  blue: 'text-blue-700',
  red: 'text-red-700',
}

const SumCard: FC<{ label: string; value: string; sub?: string; tone?: string }> = ({ label, value, sub, tone = 'gray' }) => (
  <div className={`bg-white border rounded-xl p-4 shadow-sm ${TONE_BG[tone] || 'border-gray-100'}`}>
    <div className={`text-xs uppercase tracking-wider font-medium ${TONE_LABEL[tone] || 'text-gray-500'}`}>{label}</div>
    <div className="text-xl font-semibold text-gray-900 mt-1">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
  </div>
)

export default AdminPayoutsPage
