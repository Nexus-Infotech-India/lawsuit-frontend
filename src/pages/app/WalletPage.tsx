import { FC, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import useWalletStore from '../../stores/walletStore'
import { useAuthStore } from '../../stores/authStore'
import type { WalletTransaction, TransactionType } from '../../types'
import { ArrowUpRight, ArrowDownLeft, Send, Plus, ChevronLeft, ChevronRight, Wallet, TrendingUp, TrendingDown, AlertCircle, X, CheckCircle } from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const typeConfig: Record<TransactionType, { label: string; color: string; icon: typeof ArrowUpRight; sign: '+' | '-' }> = {
  CREDIT: { label: 'Credit', color: 'text-green-600 bg-green-50', icon: ArrowDownLeft, sign: '+' },
  DEBIT: { label: 'Debit', color: 'text-red-600 bg-red-50', icon: ArrowUpRight, sign: '-' },
  WITHDRAWAL: { label: 'Withdrawal', color: 'text-orange-600 bg-orange-50', icon: ArrowUpRight, sign: '-' },
  REFUND: { label: 'Refund', color: 'text-blue-600 bg-blue-50', icon: ArrowDownLeft, sign: '+' },
  PAYMENT: { label: 'Payment', color: 'text-purple-600 bg-purple-50', icon: ArrowUpRight, sign: '-' },
  TRANSFER: { label: 'Transfer', color: 'text-indigo-600 bg-indigo-50', icon: Send, sign: '-' },
}

type TabFilter = 'all' | 'credits' | 'debits'

const WalletPage: FC = () => {
  const { balance, transactions, totalTransactions, currentPage, loading, error, fetchBalance, fetchTransactions, addMoney, confirmAddMoney, transfer } = useWalletStore()
  const authUser = useAuthStore((s) => s.user)
  const location = useLocation()

  const [activeTab, setActiveTab] = useState<TabFilter>('all')
  const [showAddMoney, setShowAddMoney] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [addAmount, setAddAmount] = useState('')
  const [transferUserId, setTransferUserId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDesc, setTransferDesc] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const ITEMS_PER_PAGE = 20

  useEffect(() => {
    fetchBalance()
    fetchTransactions(1, ITEMS_PER_PAGE)
  }, [])

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Filter transactions by tab
  const creditTypes: TransactionType[] = ['CREDIT', 'REFUND']
  const debitTypes: TransactionType[] = ['DEBIT', 'WITHDRAWAL', 'PAYMENT', 'TRANSFER']
  const filteredTransactions = transactions.filter((t) => {
    if (activeTab === 'credits') return creditTypes.includes(t.type)
    if (activeTab === 'debits') return debitTypes.includes(t.type)
    return true
  })

  const totalPages = Math.ceil(totalTransactions / ITEMS_PER_PAGE)

  const handlePageChange = (page: number) => {
    fetchTransactions(page, ITEMS_PER_PAGE)
  }

  // ——— Add Money flow ———
  const handleAddMoney = async () => {
    const amount = parseInt(addAmount, 10)
    if (!amount || amount < 1) return
    setActionLoading(true)
    try {
      const order: any = await addMoney(amount)
      console.log('[Wallet] addMoney response:', JSON.stringify(order))
      // Extract orderId - backend may use different field names
      const rzpOrderId = order.orderId || order.order_id || order.razorpayOrderId || order.order?.id
      const internalPaymentId = order.paymentId || order.payment_id || order.id
      console.log('[Wallet] extracted orderId:', rzpOrderId, 'paymentId:', internalPaymentId)
      // Open Razorpay checkout
      const rzpKey = (import.meta.env.VITE_RAZORPAY_KEY as string) || ''
      if ((window as any).Razorpay) {
        const options: any = {
          key: rzpKey,
          amount: amount * 100,
          currency: order.currency || 'INR',
          name: 'LawSuit Wallet',
          description: 'Add Money to Wallet',
          order_id: rzpOrderId,
          handler: async (resp: any) => {
            console.log('[Wallet] Razorpay handler resp:', resp)
            console.log('[Wallet] confirm payload:', {
              paymentId: internalPaymentId,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            })
            try {
              await confirmAddMoney({
                paymentId: internalPaymentId,
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              })
              setShowAddMoney(false)
              setAddAmount('')
              showToast(`${fmt(amount)} added to wallet!`, 'success')
              fetchBalance()
              fetchTransactions(1, ITEMS_PER_PAGE)
            } catch {
              showToast('Payment verification failed', 'error')
            }
          },
          prefill: {
            name: authUser?.name,
            email: (authUser as any)?.email,
            contact: (authUser as any)?.phone,
          },
          theme: { color: '#0B4D64' },
        }
        const rzp = new (window as any).Razorpay(options)
        rzp.on('payment.failed', () => {
          showToast('Payment failed. Please try again.', 'error')
        })
        rzp.open()
      } else {
        showToast('Razorpay not loaded. Please refresh the page.', 'error')
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to initiate payment', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // ——— Transfer flow ———
  const handleTransfer = async () => {
    const amount = parseInt(transferAmount, 10)
    if (!transferUserId.trim() || !amount || amount < 1) return
    setActionLoading(true)
    try {
      const result = await transfer(transferUserId.trim(), amount, transferDesc.trim() || undefined)
      if (result.success) {
        setShowTransfer(false)
        setTransferUserId('')
        setTransferAmount('')
        setTransferDesc('')
        showToast(`${fmt(amount)} transferred successfully!`, 'success')
        fetchBalance()
        fetchTransactions(1, ITEMS_PER_PAGE)
      } else {
        showToast(result.message || 'Transfer failed', 'error')
      }
    } catch {
      showToast('Transfer failed', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Balance Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary to-[#0a3d50] rounded-2xl shadow-lg p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-5 h-5 opacity-80" />
            <span className="text-sm font-medium opacity-80">Wallet Balance</span>
          </div>
          <div className="text-4xl font-bold tracking-tight">{fmt(balance)}</div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => setShowAddMoney(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-primary rounded-lg font-medium hover:bg-gray-100 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Money
            </button>
            <Link
              to={location.pathname.startsWith('/lawyer') ? '/lawyer/withdraw' : '/app/withdraw'}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/15 text-white rounded-lg font-medium hover:bg-white/25 transition-colors border border-white/20"
            >
              <ArrowUpRight className="w-4 h-4" />
              Withdraw
            </Link>
            <button
              onClick={() => setShowTransfer(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/15 text-white rounded-lg font-medium hover:bg-white/25 transition-colors border border-white/20"
            >
              <Send className="w-4 h-4" />
              Transfer
            </button>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Transaction History</h2>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          {([
            { id: 'all' as TabFilter, label: 'All' },
            { id: 'credits' as TabFilter, label: 'Credits', icon: TrendingUp },
            { id: 'debits' as TabFilter, label: 'Debits', icon: TrendingDown },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Transaction List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading && transactions.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
              Loading transactions…
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-12 text-center">
              <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <div className="font-medium text-gray-500">No transactions yet</div>
              <div className="text-sm text-gray-400 mt-1">Your transaction history will appear here.</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredTransactions.map((tx) => {
                const config = typeConfig[tx.type] || typeConfig.DEBIT
                const Icon = config.icon
                const isCredit = config.sign === '+'
                return (
                  <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{tx.description || config.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}
                          {new Date(tx.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                        {config.sign}{fmt(Math.abs(tx.amount))}
                      </div>
                      <div className={`text-xs mt-0.5 ${tx.status === 'COMPLETED' ? 'text-green-500' : 'text-red-500'}`}>
                        {tx.status}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/50">
              <div className="text-sm text-gray-500">
                Page {currentPage} of {totalPages} · {totalTransactions} transactions
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =================== Add Money Modal =================== */}
      {showAddMoney && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !actionLoading && setShowAddMoney(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Add Money to Wallet</h3>
              <button onClick={() => !actionLoading && setShowAddMoney(false)} className="p-1 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-lg"
                />
              </div>
              {/* Quick amounts */}
              <div className="flex gap-2">
                {[500, 1000, 2000, 5000].map((a) => (
                  <button
                    key={a}
                    onClick={() => setAddAmount(String(a))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${addAmount === String(a) ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                  >
                    ₹{a.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-5 border-t bg-gray-50 flex items-center gap-3">
              <button onClick={() => !actionLoading && setShowAddMoney(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
              <button
                onClick={handleAddMoney}
                disabled={!addAmount || parseInt(addAmount, 10) < 1 || actionLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {actionLoading ? 'Processing…' : `Pay ${addAmount ? fmt(parseInt(addAmount, 10) || 0) : '₹0'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================== Transfer Modal =================== */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !actionLoading && setShowTransfer(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Transfer Money</h3>
              <button onClick={() => !actionLoading && setShowTransfer(false)} className="p-1 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Recipient User ID</label>
                <input
                  type="text"
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  placeholder="Enter user ID"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description <span className="text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={transferDesc}
                  onChange={(e) => setTransferDesc(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Payment for consultation"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="text-sm text-gray-500">Available balance: <span className="font-medium text-gray-900">{fmt(balance)}</span></div>
            </div>
            <div className="p-5 border-t bg-gray-50 flex items-center gap-3">
              <button onClick={() => !actionLoading && setShowTransfer(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
              <button
                onClick={handleTransfer}
                disabled={!transferUserId.trim() || !transferAmount || parseInt(transferAmount, 10) < 1 || actionLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {actionLoading ? 'Transferring…' : `Transfer ${transferAmount ? fmt(parseInt(transferAmount, 10) || 0) : '₹0'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================== Toast =================== */}
      {toast && (
        <div className="fixed right-6 bottom-6 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className={`flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletPage
