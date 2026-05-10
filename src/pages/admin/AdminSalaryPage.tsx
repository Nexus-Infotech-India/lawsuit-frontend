import { FC, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Briefcase, Building2, Loader2, X, Pause, Play, Banknote, History, Save, Gavel, Calendar, ArrowRight, Coins } from 'lucide-react'
import { adminSalaryApi, adminCourtAdminSalaryApi, adminApi } from '@/services/api'
import { unwrapList, unwrapObject } from '@/utils/unwrap'
import { friendlyError } from '@/utils/errors'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0)

type Subject = 'lawyers' | 'organizations' | 'court-admins'
type Tab = Subject | 'cycles-history'

interface PayableRow {
  id: string
  name?: string
  email?: string
  avatarUrl?: string | null
  baseSalary?: number
  isHeld?: boolean
  netPayable?: number
  // Lawyer / Org performance (inline from server)
  consultations?: number
  caseClosed?: number
  caseWon?: number
  rating?: number
  // Court-admin performance (fetched lazily after list loads)
  caProcessed?: number
  caApprovalRate?: number | null
  caScore?: number
}

/**
 * Normalize the entity-salary list response into a flat row.
 *
 * Server shapes differ by subject:
 *   - LAWYER / ORGANIZATION → { subject:{name,email,...}, config:{baseSalary,isHeld}, performance:{consultationCount,...}, breakdown:{netPayable} }
 *   - COURT_ADMIN          → { courtAdmin:{name,email,...}, baseSalary, netPayable }
 *
 * This adapter unifies them so the table can render with one set of fields.
 */
function normalizePayableRow(raw: any): PayableRow | null {
  if (!raw || typeof raw !== 'object') return null

  // Court-admin variant
  if (raw.courtAdmin) {
    const ca = raw.courtAdmin
    return {
      id: ca.id,
      name: ca.name,
      email: ca.email,
      avatarUrl: ca.avatarUrl ?? null,
      baseSalary: Number(raw.baseSalary ?? 0),
      netPayable: Number(raw.netPayable ?? raw.baseSalary ?? 0),
      isHeld: false, // service already filters out held configs
    }
  }

  // Entity-salary variant (LAWYER / ORGANIZATION)
  if (raw.subject || raw.config || raw.breakdown) {
    const s = raw.subject || {}
    const cfg = raw.config || {}
    const perf = raw.performance || {}
    const br = raw.breakdown || {}
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      avatarUrl: s.avatarUrl ?? null,
      baseSalary: Number(cfg.baseSalary ?? 0),
      netPayable: Number(br.netPayable ?? br.net ?? cfg.baseSalary ?? 0),
      isHeld: !!cfg.isHeld,
      consultations: Number(perf.consultationCount ?? 0),
      caseClosed: Number(perf.caseClosedCount ?? 0),
      caseWon: Number(perf.caseWonCount ?? 0),
      rating: typeof s.rating === 'number' ? s.rating : undefined,
    }
  }

  // Already-flat fallback (defensive)
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    avatarUrl: raw.avatarUrl ?? null,
    baseSalary: raw.baseSalary,
    netPayable: raw.netPayable,
    isHeld: !!raw.isHeld,
    consultations: raw.consultations,
    rating: raw.rating,
  }
}

interface SalaryConfig {
  baseSalary?: number
  bonusPct?: number
  isHeld?: boolean
  holdReason?: string
  notes?: string
}

interface BankAccount {
  id: string
  type: 'BANK' | 'UPI'
  bankName?: string | null
  accountNumber?: string | null
  upiId?: string | null
  isDefault?: boolean
}

interface PayoutRow {
  id: string
  cycleStart?: string
  cycleEnd?: string
  amount: number
  status: string
  paidAt?: string | null
}

interface AdjustmentRow {
  id: string
  action: string
  amount?: number
  reason?: string
  createdAt: string
  actorId?: string
}

interface CycleHistoryRow {
  id: string
  subjectType?: string
  subjectId?: string
  subjectName?: string
  cycleStart?: string
  cycleEnd?: string
  amount: number
  status: string
  paidAt?: string | null
}

const AdminSalaryPage: FC = () => {
  // Deep-link support: e.g. /admin/salary?subject=organizations&id=abc auto-opens
  // the drawer for that entity. Used by the Lawyers / Organizations master pages.
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSubject = (searchParams.get('subject') || '') as Subject | ''
  const initialId = searchParams.get('id') || null

  const [tab, setTab] = useState<Tab>(
    initialSubject === 'lawyers' || initialSubject === 'organizations' || initialSubject === 'court-admins'
      ? initialSubject
      : 'lawyers',
  )
  const subject: Subject = tab === 'cycles-history' ? 'lawyers' : tab
  const [rows, setRows] = useState<PayableRow[]>([])
  const [cycles, setCycles] = useState<CycleHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(initialId)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      if (tab === 'cycles-history') {
        const res = await adminCourtAdminSalaryApi.cyclesHistory({ limit: 100 })
        setCycles(unwrapList<CycleHistoryRow>(res.data))
      } else {
        let res
        if (tab === 'lawyers') res = await adminSalaryApi.listPayableLawyers()
        else if (tab === 'organizations') res = await adminSalaryApi.listPayableOrganizations()
        else res = await adminCourtAdminSalaryApi.listPayable()
        // Server returns { cycle, items: [...] } where each item is shaped
        // differently per subject — normalise to a flat PayableRow.
        const raw = unwrapList<any>(res.data)
        const normalized = raw.map(normalizePayableRow).filter((r): r is PayableRow => !!r && !!r.id)
        setRows(normalized)

        // Court-admin list endpoint is the "skinny variant" — it doesn't
        // include performance metrics (decisions processed, approval rate).
        // Fan out per-row performance fetches in parallel and merge in.
        // Lawyer / org performance is already inline so no extra fetch.
        if (tab === 'court-admins' && normalized.length > 0) {
          const perfResults = await Promise.allSettled(
            normalized.map((r) => adminCourtAdminSalaryApi.performance(r.id)),
          )
          setRows((prev) => prev.map((r, i) => {
            const result = perfResults[i]
            if (result.status !== 'fulfilled') return r
            const p = (result.value.data?.data ?? result.value.data) as any
            if (!p || (!p.totals && p.performanceScore == null)) return r
            return {
              ...r,
              caProcessed: Number(p.totals?.processed ?? 0),
              caApprovalRate: typeof p.ratios?.approvalRate === 'number' ? p.ratios.approvalRate : null,
              caScore: typeof p.performanceScore === 'number' ? p.performanceScore : undefined,
            }
          }))
        }
      }
    } catch (err) {
      showToast(friendlyError(err, "We couldn't load this salary cycle."), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-50">
          {tab === 'lawyers' && <Briefcase className="w-6 h-6 text-indigo-600" />}
          {tab === 'organizations' && <Building2 className="w-6 h-6 text-indigo-600" />}
          {tab === 'court-admins' && <Gavel className="w-6 h-6 text-indigo-600" />}
          {tab === 'cycles-history' && <Calendar className="w-6 h-6 text-indigo-600" />}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salary management</h1>
          <p className="text-sm text-gray-500">Performance-based payroll for lawyers, organizations, and court admins.</p>
        </div>
      </div>

      <div className="flex border-b border-gray-200 overflow-x-auto">
        {([
          { id: 'lawyers', label: 'Lawyers' },
          { id: 'organizations', label: 'Organizations' },
          { id: 'court-admins', label: 'Court Admins' },
          { id: 'cycles-history', label: 'Cycle history' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lawyers' && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
          <span className="font-semibold">Note:</span>
          <span>
            Only <strong>platform-managed lawyers</strong> appear here. Org-affiliated lawyers are paid by
            their organization and managed by the org head from <em>/organization/salary</em>.
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : tab === 'cycles-history' ? (
        cycles.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-12 text-center text-gray-500">No cycle history.</div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Cycle</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cycles.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.subjectName || c.subjectId?.slice(0, 8) || '—'}</div>
                      {c.subjectType && <div className="text-xs text-gray-500">{c.subjectType}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {c.cycleStart && new Date(c.cycleStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {c.cycleEnd && (
                        <> – {new Date(c.cycleEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">{fmt(c.amount)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{c.status}</span>
                      {c.paidAt && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          Paid {new Date(c.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
          <Coins className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <h3 className="text-base font-semibold text-gray-900">
            No payable {subject === 'lawyers' ? 'lawyers' : subject === 'organizations' ? 'organizations' : 'court admins'} this cycle
          </h3>
          <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto leading-relaxed">
            {subject === 'court-admins' ? (
              <>This list shows court admins with a base salary set, who haven't been paid yet this cycle. Configure salaries from the Court Admins management page.</>
            ) : (
              <>This list shows {subject} with a salary config and unpaid cycle. To populate it, set a base salary on a {subject === 'lawyers' ? 'lawyer' : 'organization'} via their detail page.</>
            )}
          </p>
          <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
            <Link
              to={subject === 'court-admins' ? '/admin/court-admins'
                : subject === 'organizations' ? '/admin/organizations'
                  : '/admin/lawyers'}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
            >
              Open {subject === 'court-admins' ? 'court admins' : subject} <ArrowRight className="w-3 h-3" />
            </Link>
            <Link
              to="/admin/dashboard"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">Net payable</th>
                <th className="px-4 py-3">Performance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {r.avatarUrl ? (
                        <img src={r.avatarUrl} alt={r.name || ''} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                          {(r.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{r.name || 'Unnamed'}</div>
                        {r.email && <div className="text-xs text-gray-500 truncate">{r.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{fmt(r.baseSalary ?? 0)}</td>
                  <td className="px-4 py-3 font-semibold">{fmt(r.netPayable ?? 0)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {/* Court-admin performance: decisions processed + approval rate
                        + composite score. Lazy-loaded after the list renders,
                        so we render a small spinner while in flight. */}
                    {tab === 'court-admins' ? (
                      r.caProcessed != null || r.caScore != null ? (
                        <div className="space-y-0.5">
                          <div className="font-medium text-gray-700">
                            {r.caProcessed ?? 0} decision{r.caProcessed === 1 ? '' : 's'}
                          </div>
                          {r.caApprovalRate != null && (
                            <div className="text-gray-500">
                              {Math.round(r.caApprovalRate * 100)}% approved
                            </div>
                          )}
                          {r.caScore != null && (
                            <div className="text-indigo-700 font-medium">
                              Score: {r.caScore}/100
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400">
                          <Loader2 className="w-3 h-3 animate-spin" /> loading
                        </span>
                      )
                    ) : r.consultations != null || r.caseClosed != null || r.caseWon != null ? (
                      <div className="space-y-0.5">
                        {r.consultations != null && <div>{r.consultations} consults</div>}
                        {(r.caseClosed != null || r.caseWon != null) && (
                          <div className="text-gray-500">
                            {r.caseClosed != null && <>{r.caseClosed} closed</>}
                            {r.caseWon != null && r.caseClosed != null && <> · </>}
                            {r.caseWon != null && <>{r.caseWon} won</>}
                          </div>
                        )}
                        {r.rating != null && <div className="text-gray-500">⭐ {r.rating.toFixed(1)}</div>}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.isHeld ? (
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Held</span>
                    ) : (
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setOpenId(r.id)}
                      className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && tab !== 'cycles-history' && (
        <SalaryDrawer
          subject={tab as Subject}
          id={openId}
          onClose={() => {
            setOpenId(null)
            // Strip the ?subject=&id= query params so a refresh doesn't reopen.
            if (searchParams.has('subject') || searchParams.has('id')) {
              const next = new URLSearchParams(searchParams)
              next.delete('subject')
              next.delete('id')
              setSearchParams(next, { replace: true })
            }
          }}
          onChanged={async () => {
            await load()
          }}
          notify={showToast}
        />
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50">
          <div className={`px-5 py-3 rounded-xl shadow-lg text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}

interface DrawerProps {
  subject: Subject
  id: string
  onClose: () => void
  onChanged: () => void
  notify: (msg: string, type: 'success' | 'error') => void
}

interface SubjectIdentity {
  name?: string
  email?: string
  avatarUrl?: string | null
}

const SalaryDrawer: FC<DrawerProps> = ({ subject, id, onClose, onChanged, notify }) => {
  const [tab, setTab] = useState<'config' | 'history' | 'payouts' | 'banks'>('config')
  const [config, setConfig] = useState<SalaryConfig | null>(null)
  const [edit, setEdit] = useState<SalaryConfig | null>(null)
  const [identity, setIdentity] = useState<SubjectIdentity | null>(null)
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [payouts, setPayouts] = useState<PayoutRow[]>([])
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'save' | 'hold' | 'release' | 'pay'>(null)

  const isCourtAdmin = subject === 'court-admins'

  const subjectLabel = subject === 'lawyers' ? 'Lawyer'
    : subject === 'organizations' ? 'Organization'
      : 'Court admin'

  const loadAll = async () => {
    setLoading(true)
    try {
      // Fetch subject identity in parallel — best-effort so the drawer still
      // works if the user-lookup endpoint fails (e.g. permission blip).
      const identityP = adminApi.getUserById(id)
        .then((res) => {
          const u = (res.data?.data ?? res.data?.user ?? res.data) as SubjectIdentity
          if (u && (u.name || u.email)) setIdentity(u)
        })
        .catch(() => { /* silent */ })

      if (isCourtAdmin) {
        const [cfgRes, adjustRes] = await Promise.all([
          adminCourtAdminSalaryApi.getConfig(id),
          adminCourtAdminSalaryApi.history(id).catch(() => ({ data: {} } as any)),
        ])
        // court-admin getConfig returns { config }
        const cfg = unwrapObject<SalaryConfig>(cfgRes.data, 'config') ?? {} as SalaryConfig
        setConfig(cfg)
        setEdit({ ...cfg })
        setAccounts([])
        setPayouts([])
        setAdjustments(unwrapList<AdjustmentRow>(adjustRes.data))
      } else {
        const [cfgRes, accountsRes, payoutsRes, adjustRes] = await Promise.all([
          adminSalaryApi.getConfig(subject as 'lawyers' | 'organizations', id),
          adminSalaryApi.getBankAccounts(subject as 'lawyers' | 'organizations', id).catch(() => ({ data: {} } as any)),
          adminSalaryApi.payoutHistory(subject as 'lawyers' | 'organizations', id).catch(() => ({ data: {} } as any)),
          adminSalaryApi.adjustmentHistory(subject as 'lawyers' | 'organizations', id).catch(() => ({ data: {} } as any)),
        ])
        // entity-salary getConfig returns { subjectType, subjectId, config }
        const cfg = unwrapObject<SalaryConfig>(cfgRes.data, 'config') ?? {} as SalaryConfig
        setConfig(cfg)
        setEdit({ ...cfg })
        // adminGetSubjectBankAccounts returns { subjectType, subjectId, items }
        setAccounts(unwrapList<BankAccount>(accountsRes.data))
        // payoutHistory / adjustmentHistory both return { items }
        setPayouts(unwrapList<PayoutRow>(payoutsRes.data))
        setAdjustments(unwrapList<AdjustmentRow>(adjustRes.data))
      }
      await identityP
    } catch (err) {
      notify(friendlyError(err, "We couldn't load this salary record."), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, id])

  const handleSave = async () => {
    if (!edit) return
    setBusy('save')
    try {
      if (isCourtAdmin) {
        await adminCourtAdminSalaryApi.setBaseSalary(id, { baseSalary: edit.baseSalary, notes: edit.notes })
      } else {
        await adminSalaryApi.setConfig(subject as 'lawyers' | 'organizations', id, {
          baseSalary: edit.baseSalary,
          bonusPct: edit.bonusPct,
          notes: edit.notes,
        })
      }
      notify('Config saved', 'success')
      onChanged()
      await loadAll()
    } catch (err: any) {
      notify(friendlyError(err, "We couldn't save those changes."), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleHold = async () => {
    const reason = prompt('Hold reason?')
    if (!reason) return
    setBusy('hold')
    try {
      if (isCourtAdmin) {
        await adminCourtAdminSalaryApi.hold(id, reason)
      } else {
        await adminSalaryApi.hold(subject as 'lawyers' | 'organizations', id, reason)
      }
      notify('Salary held', 'success')
      onChanged()
      await loadAll()
    } catch (err: any) {
      notify(friendlyError(err, "We couldn't put the salary on hold."), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleRelease = async () => {
    if (!confirm('Release the hold on this salary?')) return
    setBusy('release')
    try {
      if (isCourtAdmin) {
        await adminCourtAdminSalaryApi.release(id)
      } else {
        await adminSalaryApi.release(subject as 'lawyers' | 'organizations', id)
      }
      notify('Hold released', 'success')
      onChanged()
      await loadAll()
    } catch (err: any) {
      notify(friendlyError(err, "We couldn't release the hold."), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handlePay = async () => {
    if (!confirm('Pay this cycle now?')) return
    setBusy('pay')
    try {
      if (isCourtAdmin) {
        await adminCourtAdminSalaryApi.pay(id)
      } else {
        await adminSalaryApi.pay(subject as 'lawyers' | 'organizations', id)
      }
      notify('Paid', 'success')
      onChanged()
      await loadAll()
    } catch (err: any) {
      notify(friendlyError(err, "We couldn't process the payout."), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b flex items-center justify-between p-4 z-10 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {identity?.avatarUrl ? (
              <img src={identity.avatarUrl} alt={identity?.name || ''} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                {(identity?.name || subjectLabel).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate">
                {identity?.name || `Manage ${subjectLabel.toLowerCase()} salary`}
              </h2>
              <div className="text-xs text-gray-500 truncate">
                {identity?.email ? <>{identity.email} · {subjectLabel}</> : subjectLabel}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Action bar */}
            <div className="flex flex-wrap gap-2">
              {config?.isHeld ? (
                <button
                  onClick={handleRelease}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" /> Release hold
                </button>
              ) : (
                <button
                  onClick={handleHold}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                >
                  <Pause className="w-3.5 h-3.5" /> Hold
                </button>
              )}
              <button
                onClick={handlePay}
                disabled={busy !== null || !!config?.isHeld}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                <Banknote className="w-3.5 h-3.5" /> Pay this cycle
              </button>
            </div>

            {config?.isHeld && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 rounded-lg text-sm">
                <strong>On hold.</strong> {config.holdReason || ''}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {([
                { id: 'config', label: 'Config' },
                { id: 'history', label: 'Adjustments' },
                { id: 'payouts', label: 'Payouts' },
                { id: 'banks', label: 'Bank' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'config' && edit && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Base salary (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={edit.baseSalary ?? 0}
                    onChange={(e) => setEdit({ ...edit, baseSalary: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Bonus %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={edit.bonusPct ?? 0}
                    onChange={(e) => setEdit({ ...edit, bonusPct: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                  <textarea
                    rows={3}
                    value={edit.notes ?? ''}
                    onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none"
                  />
                </div>
                <button
                  onClick={handleSave}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {busy === 'save' ? 'Saving…' : 'Save config'}
                </button>
              </div>
            )}

            {tab === 'history' && (
              adjustments.length === 0 ? (
                <p className="text-sm text-gray-500">No adjustments yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {adjustments.map((a) => (
                    <div key={a.id} className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm text-gray-900">{a.action}</div>
                        {a.amount != null && <div className="text-sm font-semibold">{fmt(a.amount)}</div>}
                      </div>
                      {a.reason && <div className="text-xs text-gray-600 mt-1">{a.reason}</div>}
                      <div className="text-xs text-gray-400 mt-1">{new Date(a.createdAt).toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === 'payouts' && (
              payouts.length === 0 ? (
                <p className="text-sm text-gray-500">No payouts yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {payouts.map((p) => (
                    <div key={p.id} className="py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center text-green-700">
                        <History className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {p.cycleStart && p.cycleEnd && (
                          <div className="text-sm font-medium">
                            {new Date(p.cycleStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            {' – '}
                            {new Date(p.cycleEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">{p.status}{p.paidAt && ` · Paid ${new Date(p.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}</div>
                      </div>
                      <div className="text-sm font-semibold">{fmt(p.amount)}</div>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === 'banks' && (
              accounts.length === 0 ? (
                <p className="text-sm text-gray-500">No bank accounts on file.</p>
              ) : (
                <div className="space-y-2">
                  {accounts.map((acc) => (
                    <div key={acc.id} className="px-3 py-2 rounded-lg border border-gray-100 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                        {acc.type === 'BANK' ? 'B' : 'U'}
                      </div>
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="font-medium text-gray-900">{acc.type === 'BANK' ? acc.bankName : 'UPI'}</div>
                        <div className="text-xs text-gray-500">
                          {acc.type === 'BANK' ? `••••${(acc.accountNumber || '').slice(-4)}` : acc.upiId}
                        </div>
                      </div>
                      {acc.isDefault && <span className="text-[10px] uppercase tracking-wider text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Default</span>}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

export default AdminSalaryPage
