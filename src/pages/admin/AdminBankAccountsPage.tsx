import { FC, useEffect, useState, useMemo } from 'react'
import {
  Building2,
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  AlertCircle,
  Search,
  Star,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { bankAccountApi } from '@/services/api'
import { friendlyError } from '@/utils/errors'

// Server response shape (mirrors mobile's BankAccountsScreen).
interface BankAccount {
  id: string
  type: 'BANK' | 'UPI'
  accountHolderName?: string
  accountNumber?: string
  ifscCode?: string
  bankName?: string
  upiId?: string
  label?: string
  isDefault?: boolean
}

type FormTab = 'BANK' | 'UPI'

const normalizeUpiId = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '')
const isValidUpiId = (v: string) => /^[a-z0-9._-]{2,256}@[a-z0-9.-]{2,64}$/i.test(v)

/**
 * Bank account management for the super admin.
 *
 * Mirrors the mobile-app `BankAccountsScreen`:
 *  - List of saved BANK / UPI accounts (no role filter — super admin sees
 *    only their own, since the API is JWT-scoped)
 *  - Add / Edit modal with two sub-tabs (BANK / UPI)
 *  - IFSC autofill: at 11 chars hits `bankAccountApi.ifscLookup` to populate
 *    bank name
 *  - UPI verify: client-side regex + server `verifyUpi` round-trip; the Save
 *    button stays disabled until verification succeeds
 *  - Default toggle so platform withdrawals know which account to use
 *
 * Mounted at `/admin/bank-accounts` and surfaced from the admin sidebar
 * under Finance. Used by the Withdraw flow on `/admin/wallets`.
 */
const AdminBankAccountsPage: FC = () => {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await bankAccountApi.list()
      const list = (res.data?.data || res.data?.items || res.data || []) as BankAccount[]
      setAccounts(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(friendlyError(err, "We couldn't load your bank accounts."))
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this account? This cannot be undone.')) return
    setBusyId(id)
    try {
      await bankAccountApi.delete(id)
      showToast('Account removed', 'success')
      await load()
    } catch (err) {
      showToast(friendlyError(err, "We couldn't remove the account."), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const openAdd = () => {
    setEditing(null)
    setShowModal(true)
  }

  const openEdit = (acc: BankAccount) => {
    setEditing(acc)
    setShowModal(true)
  }

  const counts = useMemo(() => {
    const bank = accounts.filter((a) => a.type === 'BANK').length
    const upi = accounts.filter((a) => a.type === 'UPI').length
    const def = accounts.find((a) => a.isDefault)
    return { bank, upi, def }
  }, [accounts])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-indigo-50 flex-shrink-0">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Bank accounts &amp; UPI</h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Saved destinations for withdrawals from your platform wallet.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add account
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Bank accounts" value={String(counts.bank)} icon={Building2} />
        <Stat label="UPI handles" value={String(counts.upi)} icon={CreditCard} />
        <Stat
          label="Default for withdrawals"
          value={
            counts.def
              ? counts.def.type === 'BANK'
                ? `${counts.def.bankName || 'Bank'} ••••${counts.def.accountNumber?.slice(-4) || ''}`
                : counts.def.upiId || 'UPI'
              : 'None set'
          }
          accent={counts.def ? 'text-emerald-700' : 'text-amber-700'}
          icon={Star}
        />
      </section>

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
          <Building2 className="w-10 h-10 mx-auto text-gray-300" />
          <p className="mt-3 text-gray-700 font-medium">No accounts saved yet</p>
          <p className="text-xs text-gray-500 mt-1">
            Add a bank account or UPI handle so you can withdraw from your platform wallet.
          </p>
          <button
            onClick={openAdd}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add your first account
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  a.type === 'BANK' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                }`}
              >
                {a.type === 'BANK' ? <Building2 className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 truncate">
                    {a.type === 'BANK' ? a.bankName || 'Bank account' : 'UPI'}
                    {a.label ? ` · ${a.label}` : ''}
                  </span>
                  {a.isDefault && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                      <Star className="w-3 h-3" /> Default
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate mt-0.5">
                  {a.type === 'BANK'
                    ? `${a.accountHolderName || 'Holder'} · ••••${a.accountNumber?.slice(-4) || '----'} · ${a.ifscCode || ''}`
                    : a.upiId || ''}
                </div>
              </div>
              <button
                onClick={() => openEdit(a)}
                className="p-2 rounded-md text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                aria-label="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(a.id)}
                disabled={busyId === a.id}
                className="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                aria-label="Delete"
              >
                {busyId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <BankAccountModal
          editing={editing}
          onClose={() => {
            setShowModal(false)
            setEditing(null)
          }}
          onSaved={async () => {
            setShowModal(false)
            setEditing(null)
            showToast(editing ? 'Account updated' : 'Account added', 'success')
            await load()
          }}
          onError={(msg) => showToast(msg, 'error')}
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

// ─── Add / Edit Modal ────────────────────────────────────────────────────
const BankAccountModal: FC<{
  editing: BankAccount | null
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (msg: string) => void
}> = ({ editing, onClose, onSaved, onError }) => {
  const [tab, setTab] = useState<FormTab>(editing?.type ?? 'BANK')
  // BANK fields
  const [holderName, setHolderName] = useState(editing?.accountHolderName ?? '')
  const [accountNumber, setAccountNumber] = useState(editing?.accountNumber ?? '')
  const [ifsc, setIfsc] = useState(editing?.ifscCode ?? '')
  const [bankName, setBankName] = useState(editing?.bankName ?? '')
  // UPI fields
  const [upiId, setUpiId] = useState(editing?.upiId ?? '')
  // When editing an existing UPI we trust it's verified; when creating we require fresh verify.
  const [upiVerified, setUpiVerified] = useState(editing?.type === 'UPI')
  const [verifyingUpi, setVerifyingUpi] = useState(false)
  // Shared
  const [label, setLabel] = useState(editing?.label ?? '')
  const [isDefault, setIsDefault] = useState(editing?.isDefault ?? false)
  const [lookingUpIfsc, setLookingUpIfsc] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleIfscChange = async (code: string) => {
    const upper = code.toUpperCase().slice(0, 11)
    setIfsc(upper)
    if (upper.length === 11) {
      setLookingUpIfsc(true)
      try {
        const res = await bankAccountApi.ifscLookup(upper)
        const d = (res.data?.data || res.data || {}) as any
        // Server may return either `{ BANK: '…' }` (raw razorpay-style) or a
        // normalised `{ bankName, branch, … }`. Prefer the friendly one.
        const next = d.bankName || d.BANK
        if (next) setBankName(next)
      } catch {
        /* leave bankName as-is — user can type it manually */
      } finally {
        setLookingUpIfsc(false)
      }
    }
  }

  const handleVerifyUpi = async () => {
    setFormError(null)
    const u = normalizeUpiId(upiId)
    setUpiId(u)
    if (!isValidUpiId(u)) {
      setFormError('Enter a valid UPI ID (example: name@okaxis).')
      return
    }
    setVerifyingUpi(true)
    try {
      const res = await bankAccountApi.verifyUpi(u)
      const r = (res.data?.data || res.data) as any
      const verified = r?.isValid ?? r?.verified ?? r?.success ?? r?.status === 'SUCCESS'
      if (verified) {
        setUpiVerified(true)
      } else {
        setFormError(r?.message || r?.error || r?.reason || 'Could not verify UPI ID.')
      }
    } catch (err) {
      setFormError(friendlyError(err, "We couldn't verify that UPI ID."))
    } finally {
      setVerifyingUpi(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (tab === 'BANK') {
      if (!holderName.trim()) return setFormError('Enter the account holder name.')
      if (!accountNumber.trim()) return setFormError('Enter the account number.')
      if (!ifsc.trim()) return setFormError('Enter the IFSC code.')
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        return setFormError('IFSC should be 11 characters (e.g. SBIN0000123).')
      }
    } else {
      const u = normalizeUpiId(upiId)
      if (!u) return setFormError('Enter your UPI ID.')
      if (!isValidUpiId(u)) return setFormError('Enter a valid UPI ID.')
      if (!upiVerified) return setFormError('Please verify the UPI ID before saving.')
    }

    setSaving(true)
    try {
      const payload: any =
        tab === 'BANK'
          ? {
              type: 'BANK',
              accountHolderName: holderName.trim(),
              accountNumber: accountNumber.trim(),
              ifscCode: ifsc.trim(),
              bankName: bankName.trim() || undefined,
              label: label.trim() || undefined,
              isDefault,
            }
          : {
              type: 'UPI',
              upiId: normalizeUpiId(upiId),
              label: label.trim() || undefined,
              isDefault,
            }
      if (editing) {
        await bankAccountApi.update(editing.id, payload)
      } else {
        await bankAccountApi.create(payload)
      }
      await onSaved()
    } catch (err) {
      const msg = friendlyError(err, "We couldn't save the account.")
      setFormError(msg)
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50">
              {tab === 'BANK' ? (
                <Building2 className="w-4 h-4 text-indigo-600" />
              ) : (
                <CreditCard className="w-4 h-4 text-indigo-600" />
              )}
            </div>
            <h2 className="font-semibold text-gray-900">
              {editing ? 'Edit account' : 'Add account'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Tab switch — disabled in edit mode (changing type isn't supported) */}
        <nav className="flex border-b border-gray-100 px-5">
          {(['BANK', 'UPI'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => !editing && setTab(t)}
              disabled={!!editing && editing.type !== t}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === t
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${!!editing && editing.type !== t ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {t === 'BANK' ? <Building2 className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
              {t === 'BANK' ? 'Bank account' : 'UPI'}
            </button>
          ))}
        </nav>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {formError}
            </div>
          )}

          {tab === 'BANK' ? (
            <>
              <Field
                label="Account holder name"
                value={holderName}
                onChange={setHolderName}
                placeholder="Full name as per bank records"
                required
              />
              <Field
                label="Account number"
                value={accountNumber}
                onChange={(v) => setAccountNumber(v.replace(/\s+/g, ''))}
                placeholder="e.g. 123456789012"
                required
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  IFSC code <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    value={ifsc}
                    onChange={(e) => handleIfscChange(e.target.value)}
                    placeholder="SBIN0000123"
                    maxLength={11}
                    required
                    className="w-full px-3 pr-10 py-2 border border-gray-200 rounded-lg text-sm uppercase tracking-wide outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  {lookingUpIfsc && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  We'll auto-fill the bank name once you enter all 11 characters.
                </p>
              </div>
              <Field label="Bank name" value={bankName} onChange={setBankName} placeholder="Auto-filled from IFSC" />
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  UPI ID <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={upiId}
                    onChange={(e) => {
                      setUpiId(e.target.value)
                      // Any change invalidates a previous verification.
                      if (upiVerified) setUpiVerified(false)
                    }}
                    placeholder="name@okaxis"
                    required
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyUpi}
                    disabled={verifyingUpi || !upiId.trim() || upiVerified}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                      upiVerified
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                    }`}
                  >
                    {verifyingUpi ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : upiVerified ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    {upiVerified ? 'Verified' : 'Verify'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  We'll verify the UPI handle exists with the bank before saving it.
                </p>
              </div>
            </>
          )}

          <Field label="Label (optional)" value={label} onChange={setLabel} placeholder="e.g. Personal, Business" />

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-gray-700">
              Use as default destination for withdrawals
            </span>
          </label>

          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Account details are stored encrypted and used only for withdrawals you initiate from
              your platform wallet.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Saving…' : editing ? 'Update account' : 'Save account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tiny atoms ──────────────────────────────────────────────────────────
const Field: FC<{
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}> = ({ label, value, onChange, placeholder, required }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}
      {required && <span className="text-red-500"> *</span>}
    </label>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
    />
  </div>
)

const Stat: FC<{
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
  accent?: string
}> = ({ label, value, icon: Icon, accent }) => (
  <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
    <div className="text-[11px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </div>
    <div className={`text-lg font-semibold mt-0.5 truncate ${accent || 'text-gray-900'}`}>{value}</div>
  </div>
)

export default AdminBankAccountsPage
