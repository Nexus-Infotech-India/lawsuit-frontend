import { FC, useEffect, useMemo, useState } from 'react'
import {
  Wallet,
  Loader2,
  RefreshCw,
  Banknote,
  TrendingUp,
  Building2,
  ScrollText,
  AlertCircle,
  CheckCircle2,
  PauseCircle,
} from 'lucide-react'
import { organizationsApi } from '@/services/api'
import { unwrapList } from '@/utils/unwrap'
import { friendlyError } from '@/utils/errors'

// ─── Server response shape (entity-salary.service.ts → getMyOrganizationSalary)
//     mirrors the lawyer-self version: { ...preview, payouts, bankAccounts }
interface SalaryConfig {
  baseSalary?: number
  bonusPerConsultation?: number
  bonusPerCaseClosed?: number
  bonusPerWonCase?: number
  isOnHold?: boolean
  holdReason?: string | null
}

interface PerformanceCounts {
  consultationCount?: number
  caseClosedCount?: number
  caseWonCount?: number
}

interface Breakdown {
  baseSalary?: number
  consultationBonus?: number
  caseClosedBonus?: number
  caseWonBonus?: number
  bonusAmount?: number
  deductionAmount?: number
  netPayable?: number
}

interface PayoutRow {
  id: string
  cycleMonth?: number
  cycleYear?: number
  baseSalary?: number
  bonusAmount?: number
  deductionAmount?: number
  netPayable?: number
  notes?: string | null
  paidAt?: string
  createdAt?: string
}

interface BankAccount {
  id: string
  accountHolderName?: string
  accountNumberMasked?: string
  ifsc?: string
  bankName?: string
  label?: string
  isDefault?: boolean
}

interface MySalary {
  cycle?: { cycleMonth: number; cycleYear: number }
  config?: SalaryConfig | null
  performance?: PerformanceCounts
  breakdown?: Breakdown
  alreadyPaid?: boolean
  existingPayout?: { id?: string; netPayable?: number; paidAt?: string } | null
  payouts?: PayoutRow[]
  bankAccounts?: BankAccount[]
}

const fmt = (n?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number.isFinite(Number(n)) ? Number(n) : 0,
  )

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Org head's own performance-based salary view.
 *
 * The platform pays the *organization* a perf salary (base + per-consultation
 * + per-case-closed + per-case-won bonuses) similar to how the org pays its
 * own lawyers. This page is the read-only counterpart of
 * `OrganizationSalaryPage` — the org head can see the cycle preview,
 * payout history, and bank accounts on file, but cannot trigger the payout
 * (only super-admin can disburse the org-side cycle).
 */
const OrganizationMySalaryPage: FC = () => {
  const [data, setData] = useState<MySalary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await organizationsApi.getMyOrganizationSalary()
      // Server returns the preview at the root, plus `payouts` and
      // `bankAccounts`. Normalise both list slots in case they're nested.
      const raw = (res.data ?? {}) as MySalary & { payouts?: any; bankAccounts?: any }
      setData({
        ...raw,
        payouts: unwrapList<PayoutRow>(raw.payouts ?? res.data),
        bankAccounts: unwrapList<BankAccount>(raw.bankAccounts ?? res.data),
      })
    } catch (err) {
      setError(friendlyError(err, "We couldn't load your salary details."))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const cycleLabel = useMemo(() => {
    if (!data?.cycle) return ''
    const m = data.cycle.cycleMonth
    const y = data.cycle.cycleYear
    if (!m || !y) return ''
    return `${MONTHS[m - 1]} ${y}`
  }, [data])

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-emerald-50 flex-shrink-0">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">My salary</h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Performance-based earnings paid by the platform to your organization.
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        </div>
      ) : !data ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center text-sm text-gray-500">
          No salary information available yet.
        </div>
      ) : (
        <>
          {/* Status banners */}
          {data.config?.isOnHold && (
            <Banner tone="amber" icon={PauseCircle}>
              <div>
                <div className="font-semibold">Your salary is on hold</div>
                {data.config.holdReason && <div className="mt-0.5">Reason: {data.config.holdReason}</div>}
                <div className="text-amber-700/80 mt-1">
                  Payouts are paused until a super admin releases the hold.
                </div>
              </div>
            </Banner>
          )}
          {data.alreadyPaid && (
            <Banner tone="green" icon={CheckCircle2}>
              <div>
                Already paid out for {cycleLabel || 'this cycle'}
                {data.existingPayout?.paidAt ? ` on ${fmtDate(data.existingPayout.paidAt)}` : ''}.
              </div>
            </Banner>
          )}
          {!data.config && (
            <Banner tone="amber" icon={AlertCircle}>
              No salary configuration set yet. The platform admin sets your base + bonuses; once
              configured, this page will show the live cycle preview.
            </Banner>
          )}

          {/* This cycle summary */}
          <section>
            <SectionHeader icon={TrendingUp} text={`Current cycle${cycleLabel ? ` · ${cycleLabel}` : ''}`} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
              <Stat label="Net payable" value={fmt(data.breakdown?.netPayable)} accent="text-emerald-700" hint="for this cycle" />
              <Stat label="Base salary" value={fmt(data.breakdown?.baseSalary ?? data.config?.baseSalary)} hint="monthly base" />
              <Stat
                label="Performance bonus"
                value={fmt(
                  (data.breakdown?.consultationBonus ?? 0) +
                    (data.breakdown?.caseClosedBonus ?? 0) +
                    (data.breakdown?.caseWonBonus ?? 0) +
                    (data.breakdown?.bonusAmount ?? 0),
                )}
                hint="all bonuses"
              />
              <Stat
                label="Deductions"
                value={fmt(data.breakdown?.deductionAmount)}
                hint={data.breakdown?.deductionAmount ? 'this cycle' : 'no deductions'}
                accent={data.breakdown?.deductionAmount ? 'text-red-700' : undefined}
              />
            </div>
          </section>

          {/* Performance counts */}
          <section>
            <SectionHeader icon={Building2} text="Performance this cycle" />
            <div className="grid grid-cols-3 gap-3 mt-2">
              <Mini label="Consultations" value={String(data.performance?.consultationCount ?? 0)} />
              <Mini label="Cases closed" value={String(data.performance?.caseClosedCount ?? 0)} />
              <Mini label="Cases won" value={String(data.performance?.caseWonCount ?? 0)} />
            </div>
          </section>

          {/* Detailed breakdown */}
          <section>
            <SectionHeader icon={ScrollText} text="Breakdown" />
            <div className="border border-gray-100 rounded-xl bg-white shadow-sm divide-y divide-gray-100 text-sm mt-2">
              <Line label="Base salary" value={fmt(data.breakdown?.baseSalary)} />
              <Line label="Consultation bonus" value={fmt(data.breakdown?.consultationBonus)} />
              <Line label="Case-closed bonus" value={fmt(data.breakdown?.caseClosedBonus)} />
              <Line label="Case-won bonus" value={fmt(data.breakdown?.caseWonBonus)} />
              {(data.breakdown?.bonusAmount ?? 0) > 0 && (
                <Line label="One-time bonus" value={fmt(data.breakdown?.bonusAmount)} />
              )}
              {(data.breakdown?.deductionAmount ?? 0) > 0 && (
                <Line label="Deductions" value={`− ${fmt(data.breakdown?.deductionAmount)}`} tone="red" />
              )}
              <Line label="Net payable" value={fmt(data.breakdown?.netPayable)} bold tone="emerald" />
            </div>
          </section>

          {/* Bank accounts */}
          <section>
            <SectionHeader icon={Banknote} text="Bank accounts on file" />
            {(data.bankAccounts?.length ?? 0) === 0 ? (
              <div className="mt-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3">
                No bank accounts added yet. Add one from <strong>Settings → Bank accounts</strong> so the
                platform can deposit your salary.
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.bankAccounts!.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {b.bankName || b.label || 'Bank'} · {b.accountNumberMasked || '••••'}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {b.accountHolderName} · {b.ifsc}
                      </div>
                    </div>
                    {b.isDefault && (
                      <span className="ml-3 inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex-shrink-0">
                        Default
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Payout history */}
          <section>
            <SectionHeader icon={Wallet} text="Payout history" />
            {(data.payouts?.length ?? 0) === 0 ? (
              <div className="mt-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3">
                No salary payouts yet.
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.payouts!.map((p) => (
                  <li key={p.id} className="border border-gray-100 rounded-lg px-3 py-2 text-sm bg-white">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-medium text-gray-900">
                          {p.cycleMonth ? MONTHS[p.cycleMonth - 1] : '—'} {p.cycleYear ?? ''}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          Paid {fmtDate(p.paidAt || p.createdAt)}
                          {p.notes ? ` · ${p.notes}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-emerald-700">{fmt(p.netPayable)}</div>
                        <div className="text-[11px] text-gray-500">
                          Base {fmt(p.baseSalary)}
                          {(p.bonusAmount ?? 0) > 0 ? ` + ${fmt(p.bonusAmount)}` : ''}
                          {(p.deductionAmount ?? 0) > 0 ? ` − ${fmt(p.deductionAmount)}` : ''}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// ─── Tiny shared atoms ───────────────────────────────────────────────────
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

const Mini: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-center">
    <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
    <div className="text-base font-semibold text-gray-900">{value}</div>
  </div>
)

const Line: FC<{ label: string; value: string; bold?: boolean; tone?: 'red' | 'emerald' }> = ({
  label,
  value,
  bold,
  tone,
}) => (
  <div className="flex items-center justify-between px-3 py-2">
    <div className="text-gray-700 text-sm">{label}</div>
    <div
      className={`text-sm ${bold ? 'font-semibold' : ''} ${
        tone === 'red' ? 'text-red-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-gray-900'
      }`}
    >
      {value}
    </div>
  </div>
)

const SectionHeader: FC<{ icon: React.ComponentType<{ className?: string }>; text: string }> = ({
  icon: Icon,
  text,
}) => (
  <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5">
    <Icon className="w-3.5 h-3.5" /> {text}
  </div>
)

const Banner: FC<{
  tone: 'amber' | 'green' | 'red'
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}> = ({ tone, icon: Icon, children }) => {
  const cls =
    tone === 'amber'
      ? 'bg-amber-50 border-amber-100 text-amber-800'
      : tone === 'green'
        ? 'bg-green-50 border-green-100 text-green-800'
        : 'bg-red-50 border-red-100 text-red-800'
  return (
    <div className={`rounded-lg border p-3 flex items-start gap-2 text-sm ${cls}`}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export default OrganizationMySalaryPage
