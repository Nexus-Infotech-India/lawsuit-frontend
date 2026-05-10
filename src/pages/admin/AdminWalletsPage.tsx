import { FC, useEffect, useMemo, useState } from 'react'
import {
  Wallet,
  Loader2,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpToLine,
  Send,
  Plus,
  X,
  Building2,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
} from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'
import { useAuthStore } from '@/stores/authStore'
import { bankAccountApi } from '@/services/api'
import { unwrapList } from '@/utils/unwrap'
import { friendlyError } from '@/utils/errors'
import type { WalletTransaction } from '@/types'

interface BankAccount {
  id: string
  accountHolderName?: string
  accountNumberMasked?: string
  ifsc?: string
  bankName?: string
  label?: string
  isDefault?: boolean
}

const fmt = (n?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number.isFinite(Number(n)) ? Number(n) : 0,
  )

const fmtDate = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

type TxType = 'CREDIT' | 'DEBIT' | 'WITHDRAWAL' | 'REFUND' | 'PAYMENT' | 'TRANSFER'
type FilterTab = 'all' | 'credits' | 'debits' | 'withdrawals'

const FILTERS: { id: FilterTab; label: string; matches: (t: TxType) => boolean }[] = [
  { id: 'all', label: 'All', matches: () => true },
  { id: 'credits', label: 'Credits', matches: (t) => t === 'CREDIT' || t === 'REFUND' },
  { id: 'debits', label: 'Debits', matches: (t) => t === 'DEBIT' || t === 'PAYMENT' || t === 'TRANSFER' },
  { id: 'withdrawals', label: 'Withdrawals', matches: (t) => t === 'WITHDRAWAL' },
]

const txIcon = (type: TxType) => {
  switch (type) {
    case 'CREDIT':
    case 'REFUND':
      return TrendingUp
    case 'WITHDRAWAL':
      return ArrowUpToLine
    case 'TRANSFER':
      return Send
    case 'PAYMENT':
    case 'DEBIT':
    default:
      return TrendingDown
  }
}

const txTone = (type: TxType) => {
  if (type === 'CREDIT' || type === 'REFUND') return 'text-green-700 bg-green-50 border-green-100'
  if (type === 'WITHDRAWAL') return 'text-blue-700 bg-blue-50 border-blue-100'
  if (type === 'TRANSFER') return 'text-purple-700 bg-purple-50 border-purple-100'
  return 'text-amber-700 bg-amber-50 border-amber-100'
}

const txSign = (type: TxType) => {
  if (type === 'CREDIT' || type === 'REFUND') return '+'
  return '−'
}

/**
 * Super admin's own platform wallet.
 *
 * Mirrors the mobile-app pattern: the super admin's user-level wallet IS the
 * platform wallet (every booking payment lands here, every disbursement /
 * salary payout flows out from here). We hit the same `/wallet/*` endpoints
 * a client/lawyer hits — the JWT scopes the result to the caller automatically.
 *
 * UI:
 *  - Hero balance card with three actions (Add money / Withdraw / Transfer)
 *  - Stats summary (lifetime credits, debits, withdrawals)
 *  - Filtered transaction list (All / Credits / Debits / Withdrawals)
 *
 * The previous multi-user wallet table (a moderation view) was retired —
 * mobile dropped that screen and the user clarified this surface should be
 * the admin's own wallet. The legacy `/admin/wallets` listing endpoint is
 * still served by the backend if a future moderation page needs it.
 */
const AdminWalletsPage: FC = () => {
  const balance = useWalletStore((s) => s.balance)
  const transactions = useWalletStore((s) => s.transactions)
  const loading = useWalletStore((s) => s.loading)
  const fetchBalance = useWalletStore((s) => s.fetchBalance)
  const fetchTransactions = useWalletStore((s) => s.fetchTransactions)
  const addMoney = useWalletStore((s) => s.addMoney)
  const confirmAddMoney = useWalletStore((s) => s.confirmAddMoney)
  const withdraw = useWalletStore((s) => s.withdraw)
  const transfer = useWalletStore((s) => s.transfer)
  const authUser = useAuthStore((s) => s.user)

  const [tab, setTab] = useState<FilterTab>('all')
  const [showAddMoney, setShowAddMoney] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    fetchBalance().catch(() => undefined)
    fetchTransactions(1, 50).catch(() => undefined)
  }, [fetchBalance, fetchTransactions])

  const refresh = () => {
    fetchBalance().catch(() => undefined)
    fetchTransactions(1, 50).catch(() => undefined)
  }

  // Lifetime aggregates from the loaded transaction page (server caps at 50
  // here — for the full ledger we'd page; the displayed counters are always
  // labelled "in view" so it's clear they're not lifetime totals).
  const stats = useMemo(() => {
    let credits = 0
    let debits = 0
    let withdrawals = 0
    for (const t of transactions) {
      const type = (t as any).type as TxType
      const amount = Number((t as any).amount) || 0
      if (type === 'CREDIT' || type === 'REFUND') credits += amount
      else if (type === 'WITHDRAWAL') withdrawals += amount
      else debits += amount
    }
    return { credits, debits, withdrawals }
  }, [transactions])

  const filtered = useMemo(() => {
    const matcher = FILTERS.find((f) => f.id === tab) ?? FILTERS[0]
    return transactions.filter((t) => matcher.matches((t as any).type as TxType))
  }, [transactions, tab])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-indigo-50 flex-shrink-0">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Platform wallet</h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Your super-admin wallet — every booking payment lands here, every disbursement flows out from here.
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      {/* Hero balance card with actions */}
      <section className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white p-5 sm:p-7 shadow-md">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/70 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Available balance
            </div>
            <div className="text-3xl sm:text-4xl font-bold mt-1">{fmt(balance)}</div>
            <div className="text-xs text-white/70 mt-1">
              {authUser?.name ? `Wallet of ${authUser.name}` : 'Super-admin wallet'}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ActionButton onClick={() => setShowAddMoney(true)} icon={Plus} label="Add money" />
            <ActionButton onClick={() => setShowWithdraw(true)} icon={ArrowDownToLine} label="Withdraw" />
            <ActionButton onClick={() => setShowTransfer(true)} icon={Send} label="Transfer" />
          </div>
        </div>
      </section>

      {/* Quick stats from the loaded page */}
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Credits in view" value={fmt(stats.credits)} hint="loaded page" accent="text-emerald-700" />
        <Stat label="Debits in view" value={fmt(stats.debits)} hint="loaded page" accent="text-amber-700" />
        <Stat label="Withdrawn in view" value={fmt(stats.withdrawals)} hint="loaded page" accent="text-blue-700" />
      </section>

      {/* Filter tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setTab(f.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === f.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      {loading && transactions.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
          <Wallet className="w-10 h-10 mx-auto text-gray-300" />
          <p className="mt-3 text-gray-500">No {tab === 'all' ? '' : tab} transactions yet.</p>
        </div>
      ) : (
        <ul className="bg-white border border-gray-100 rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {filtered.map((t) => (
            <TransactionRow key={(t as any).id} tx={t} />
          ))}
        </ul>
      )}

      {/* Modals */}
      {showAddMoney && (
        <AddMoneyModal
          onClose={() => setShowAddMoney(false)}
          onAdd={async (amount) => {
            const order = (await addMoney(amount)) as any
            return order
          }}
          onConfirm={async (payload) => {
            await confirmAddMoney(payload)
            showToast(`${fmt(payload.amount)} added to wallet`, 'success')
            refresh()
          }}
          onError={(msg) => showToast(msg, 'error')}
          authUser={authUser}
        />
      )}
      {showWithdraw && (
        <WithdrawModal
          onClose={() => setShowWithdraw(false)}
          onSubmit={async (amount, bankAccountId) => {
            try {
              await withdraw(amount, bankAccountId)
              showToast(`${fmt(amount)} withdrawal initiated`, 'success')
              refresh()
              setShowWithdraw(false)
            } catch (err) {
              showToast(friendlyError(err, "We couldn't initiate the withdrawal."), 'error')
            }
          }}
        />
      )}
      {showTransfer && (
        <TransferModal
          onClose={() => setShowTransfer(false)}
          onSubmit={async (toUserId, amount, description) => {
            try {
              await transfer(toUserId, amount, description)
              showToast(`${fmt(amount)} transferred`, 'success')
              refresh()
              setShowTransfer(false)
            } catch (err) {
              showToast(friendlyError(err, "We couldn't complete the transfer."), 'error')
            }
          }}
        />
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

// ─── Action button on the hero card ──────────────────────────────────────
const ActionButton: FC<{
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}> = ({ icon: Icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium backdrop-blur-sm border border-white/20"
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
)

// ─── Stat card ───────────────────────────────────────────────────────────
const Stat: FC<{ label: string; value: string; hint?: string; accent?: string }> = ({
  label,
  value,
  hint,
  accent,
}) => (
  <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
    <div className="text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
    <div className={`text-xl font-semibold mt-0.5 ${accent || 'text-gray-900'}`}>{value}</div>
    {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
  </div>
)

// ─── Transaction row ─────────────────────────────────────────────────────
const TransactionRow: FC<{ tx: WalletTransaction }> = ({ tx }) => {
  const t = tx as any
  const type = t.type as TxType
  const Icon = txIcon(type)
  const tone = txTone(type)
  const sign = txSign(type)

  return (
    <li className="px-4 py-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border ${tone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 capitalize">{type.toLowerCase()}</span>
          {t.status && t.status !== 'COMPLETED' && (
            <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {t.status}
            </span>
          )}
        </div>
        {t.description && (
          <div className="text-xs text-gray-500 truncate">{t.description}</div>
        )}
        <div className="text-[11px] text-gray-400 mt-0.5">{fmtDate(t.createdAt)}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div
          className={`font-semibold ${
            sign === '+' ? 'text-green-700' : type === 'WITHDRAWAL' ? 'text-blue-700' : 'text-gray-900'
          }`}
        >
          {sign}
          {fmt(t.amount)}
        </div>
        {t.referenceId && (
          <div className="text-[10px] text-gray-400 font-mono truncate max-w-[140px]">
            {t.referenceId.slice(0, 16)}…
          </div>
        )}
      </div>
    </li>
  )
}

// ─── Add Money Modal (Razorpay) ───────────────────────────────────────────
const AddMoneyModal: FC<{
  onClose: () => void
  onAdd: (amount: number) => Promise<{
    paymentId?: string
    orderId?: string
    amount?: number
    currency?: string
    razorpayOrderId?: string
    payment_id?: string
  }>
  onConfirm: (payload: {
    paymentId: string
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
    amount: number
  }) => Promise<void>
  onError: (msg: string) => void
  authUser: any
}> = ({ onClose, onAdd, onConfirm, onError, authUser }) => {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseInt(amount, 10)
    if (!n || n < 1) return onError('Enter a valid amount.')
    setBusy(true)
    try {
      const order = await onAdd(n)
      const rzpOrderId =
        (order as any).orderId ||
        (order as any).razorpayOrderId ||
        (order as any).order_id ||
        (order as any).order?.id
      const internalPaymentId =
        (order as any).paymentId || (order as any).payment_id || (order as any).id

      const rzpKey = (import.meta.env.VITE_RAZORPAY_KEY as string) || ''
      if (!(window as any).Razorpay) {
        onError('Razorpay not loaded. Please refresh the page.')
        setBusy(false)
        return
      }

      const options: any = {
        key: rzpKey,
        amount: n * 100,
        currency: order.currency || 'INR',
        name: 'LawSuit Platform Wallet',
        description: 'Add Money to Platform Wallet',
        order_id: rzpOrderId,
        handler: async (resp: any) => {
          try {
            await onConfirm({
              paymentId: internalPaymentId,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              amount: n,
            })
            onClose()
          } catch {
            onError('Payment verification failed')
          }
        },
        prefill: {
          name: authUser?.name,
          email: authUser?.email,
          contact: authUser?.phone,
        },
        theme: { color: '#4F46E5' },
        modal: {
          ondismiss: () => setBusy(false),
        },
      }
      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', () => {
        onError('Payment failed. Please try again.')
        setBusy(false)
      })
      rzp.open()
    } catch (err) {
      onError(friendlyError(err, "We couldn't initiate the payment."))
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Add money" icon={Plus} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <AmountField value={amount} onChange={setAmount} placeholder="₹1000" />
        <div className="grid grid-cols-4 gap-2">
          {[500, 1000, 5000, 10000].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(String(q))}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
            >
              ₹{q.toLocaleString('en-IN')}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500">
          Funds are added via Razorpay. The platform wallet receives the amount once payment is verified.
        </p>
        <button
          type="submit"
          disabled={busy || !amount}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {busy ? 'Opening Razorpay…' : 'Continue to payment'}
        </button>
      </form>
    </ModalShell>
  )
}

// ─── Withdraw Modal ──────────────────────────────────────────────────────
const WithdrawModal: FC<{
  onClose: () => void
  onSubmit: (amount: number, bankAccountId?: string) => Promise<void>
}> = ({ onClose, onSubmit }) => {
  const [amount, setAmount] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    bankAccountApi
      .list()
      .then((res) => {
        const list = unwrapList<BankAccount>(res.data)
        setAccounts(list)
        const def = list.find((a) => a.isDefault) ?? list[0]
        if (def) setBankAccountId(def.id)
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseInt(amount, 10)
    if (!n || n < 1) return
    setBusy(true)
    try {
      await onSubmit(n, bankAccountId || undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Withdraw to bank" icon={ArrowDownToLine} onClose={onClose}>
      {loading ? (
        <div className="py-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 flex items-start gap-2 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">No bank accounts on file</div>
            <div className="text-xs mt-0.5">
              Add a bank account from the Bank Accounts page first, then come back to withdraw.
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AmountField value={amount} onChange={setAmount} placeholder="Amount to withdraw" />

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bank account</label>
            <div className="space-y-2">
              {accounts.map((b) => {
                const active = bankAccountId === b.id
                return (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => setBankAccountId(b.id)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                      active ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {b.bankName || b.label || 'Bank'} · {b.accountNumberMasked || '••••'}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {b.accountHolderName} · {b.ifsc}
                      </div>
                    </div>
                    {b.isDefault && (
                      <span className="ml-2 inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        Default
                      </span>
                    )}
                    {active && <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !amount || !bankAccountId}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
            {busy ? 'Submitting…' : 'Withdraw'}
          </button>
        </form>
      )}
    </ModalShell>
  )
}

// ─── Transfer Modal ──────────────────────────────────────────────────────
const TransferModal: FC<{
  onClose: () => void
  onSubmit: (toUserId: string, amount: number, description?: string) => Promise<void>
}> = ({ onClose, onSubmit }) => {
  const [toUserId, setToUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseInt(amount, 10)
    if (!n || n < 1 || !toUserId.trim()) return
    setBusy(true)
    try {
      await onSubmit(toUserId.trim(), n, description.trim() || undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Transfer to user" icon={Send} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Recipient user ID</label>
          <input
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            placeholder="Paste the user ID"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            You can copy a user's ID from the Lawyers / Organizations / KYC pages.
          </p>
        </div>
        <AmountField value={amount} onChange={setAmount} placeholder="Amount to transfer" />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Quarterly bonus"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !amount || !toUserId.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {busy ? 'Transferring…' : 'Transfer'}
        </button>
      </form>
    </ModalShell>
  )
}

// ─── Reusable atoms ───────────────────────────────────────────────────────
const ModalShell: FC<{
  title: string
  icon: React.ComponentType<{ className?: string }>
  onClose: () => void
  children: React.ReactNode
}> = ({ title, icon: Icon, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/40" onClick={onClose} />
    <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <header className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50">
            <Icon className="w-4 h-4 text-indigo-600" />
          </div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>
      </header>
      <div className="p-5">{children}</div>
    </div>
  </div>
)

const AmountField: FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({
  value,
  onChange,
  placeholder,
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
      <input
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-base outline-none focus:ring-2 focus:ring-indigo-200"
      />
    </div>
  </div>
)

export default AdminWalletsPage
