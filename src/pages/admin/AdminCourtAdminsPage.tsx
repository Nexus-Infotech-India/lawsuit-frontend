import { FC, useEffect, useMemo, useState } from 'react'
import {
  Loader2, Check, X, Users, Building2, ChevronRight, Mail, Phone, Hash,
  Landmark, BadgeCheck, Pause, Play, Banknote, Save,
  TrendingUp, History, ShieldOff, Clock, CheckCircle2, XCircle,
} from 'lucide-react'
import { adminApi, adminCourtApi, adminCourtAdminSalaryApi } from '@/services/api'
import { unwrapList, unwrapObject } from '@/utils/unwrap'
import { friendlyError } from '@/utils/errors'

interface CourtAdmin {
  id: string
  name?: string
  email?: string
  phone?: string
  status?: string
  registrationNumber?: string
  authorizationStatus?: string
  isAuthorized?: boolean
  avatarUrl?: string | null
  court?: { name?: string; pincode?: string; type?: string; district?: string; state?: string }
  createdAt?: string
}

interface PerformanceMetrics {
  totals: { processed: number; approved: number; rejected: number; pending: number }
  ratios: { approvalRate: number; rejectionRate: number }
  speed: { avgTurnaroundHours: number | null; medianTurnaroundHours: number | null }
  quality: { overrides: number }
  activity: { activeDays30: number }
  performanceScore: number
}

interface SalaryConfig {
  baseSalary?: number
  isOnHold?: boolean
  holdReason?: string | null
  notes?: string | null
}

interface AdjustmentRow {
  id: string
  action: string
  amount?: number
  reason?: string
  createdAt: string
  actorId?: string
}

const fmt = (n?: number | null) =>
  n != null ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n) : '—'

const fmtPct = (r: number | null | undefined) =>
  r == null ? '—' : `${Math.round(r * 100)}%`

type Tab = 'pending' | 'approved' | 'rejected' | 'team'

const AdminCourtAdminsPage: FC = () => {
  const [tab, setTab] = useState<Tab>('pending')
  const [team, setTeam] = useState<CourtAdmin[]>([])
  const [pending, setPending] = useState<CourtAdmin[]>([])
  const [approved, setApproved] = useState<CourtAdmin[]>([])
  const [rejected, setRejected] = useState<CourtAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      if (tab === 'team') {
        const res = await adminCourtApi.listCourtAdmins({ limit: 100 })
        setTeam(unwrapList<CourtAdmin>(res.data))
      } else {
        // The first three tabs are all served by /admin/court-admins/pending
        // — the server filters by `verificationStatus` query param. This
        // matches the mobile SuperAdminCourtAdminApprovalsScreen flow exactly
        // (Pending → live queue, Approved/Rejected → audit history).
        const verificationStatus =
          tab === 'pending'
            ? 'PENDING_SUPER_ADMIN_APPROVAL'
            : tab === 'approved'
              ? 'APPROVED'
              : 'REJECTED'
        const res = await adminApi.listPendingCourtAdmins({ verificationStatus, limit: 100 })
        const list = unwrapList<CourtAdmin>(res.data)
        if (tab === 'pending') setPending(list)
        else if (tab === 'approved') setApproved(list)
        else setRejected(list)
      }
    } catch (err) {
      showToast(friendlyError(err, "We couldn't load the court admin list."), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this court admin?')) return
    setBusyId(id)
    try {
      await adminApi.approveCourtAdmin(id)
      showToast('Approved', 'success')
      await load()
    } catch (err) {
      showToast(friendlyError(err, "We couldn't approve this admin."), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejecting?')
    if (!reason) return
    setBusyId(id)
    try {
      await adminApi.rejectCourtAdmin(id, reason)
      showToast('Rejected', 'success')
      await load()
    } catch (err) {
      showToast(friendlyError(err, "We couldn't reject this admin."), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleStatusChange = async (id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') => {
    setBusyId(id)
    try {
      await adminCourtApi.toggleCourtAdminStatus(id, status)
      showToast(`Status set to ${status}`, 'success')
      await load()
    } catch (err) {
      showToast(friendlyError(err, "We couldn't update the status."), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const list =
    tab === 'pending' ? pending : tab === 'approved' ? approved : tab === 'rejected' ? rejected : team

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-50">
          <Building2 className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Court admin team</h1>
          <p className="text-sm text-gray-500">Approve self-registered court admins, manage status, performance, and salary.</p>
        </div>
      </div>

      <div className="flex border-b border-gray-200 overflow-x-auto">
        {[
          { id: 'pending', label: 'Pending approval' },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' },
          { id: 'team', label: 'Active team' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center text-gray-500">
          <Users className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          {tab === 'pending'
            ? 'No pending applications.'
            : tab === 'approved'
              ? 'No approved applications yet.'
              : tab === 'rejected'
                ? 'No rejected applications.'
                : 'No active court admins.'}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((c) => {
            const isClickable = tab === 'team'
            return (
              <div
                key={c.id}
                onClick={() => isClickable && setOpenId(c.id)}
                className={`bg-white border border-gray-100 rounded-xl p-5 shadow-sm transition-colors ${isClickable ? 'cursor-pointer hover:border-gray-300 hover:bg-gray-50/50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt={c.name || ''} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold flex-shrink-0">
                        {(c.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{c.name || 'Unnamed'}</span>
                        {(c.isAuthorized || c.authorizationStatus === 'AUTHORIZED' || c.status === 'ACTIVE') && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                            <BadgeCheck className="w-3 h-3" /> Authorized
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                      {c.registrationNumber && <div className="text-xs text-gray-400 mt-0.5">Reg #{c.registrationNumber}</div>}
                      {c.court?.name && <div className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1"><Landmark className="w-3 h-3" /> {c.court.name}{c.court.pincode ? ` · ${c.court.pincode}` : ''}</div>}
                    </div>
                  </div>
                  {tab === 'pending' ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApprove(c.id) }}
                        disabled={busyId === c.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" /> Approve
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReject(c.id) }}
                        disabled={busyId === c.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  ) : tab === 'team' ? (
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={c.status || 'ACTIVE'}
                        disabled={busyId === c.id}
                        onChange={(e) => handleStatusChange(c.id, e.target.value as any)}
                        className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-white"
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="SUSPENDED">Suspended</option>
                      </select>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  ) : (
                    // Approved / Rejected — read-only audit history. Match
                    // mobile by surfacing a status pill instead of actions.
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${
                          tab === 'approved'
                            ? 'bg-green-50 text-green-700 border-green-100'
                            : 'bg-red-50 text-red-700 border-red-100'
                        }`}
                      >
                        {tab === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {openId && (
        <CourtAdminDetailDrawer
          id={openId}
          onClose={() => setOpenId(null)}
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

// ─── Detail drawer ──────────────────────────────────────────────────────

const CourtAdminDetailDrawer: FC<{
  id: string
  onClose: () => void
  notify: (msg: string, type: 'success' | 'error') => void
}> = ({ id, onClose, notify }) => {
  const [tab, setTab] = useState<'overview' | 'performance' | 'salary'>('overview')
  const [detail, setDetail] = useState<CourtAdmin | null>(null)
  const [perf, setPerf] = useState<PerformanceMetrics | null>(null)
  const [config, setConfig] = useState<SalaryConfig | null>(null)
  const [edit, setEdit] = useState<SalaryConfig | null>(null)
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'save' | 'hold' | 'release' | 'pay'>(null)

  const loadAll = async () => {
    setLoading(true)
    try {
      // Fan out the four reads in parallel — failures on perf/salary shouldn't
      // block the overview render, so they're swallowed individually.
      const [detailRes, perfRes, cfgRes, histRes] = await Promise.all([
        adminApi.getCourtAdminDetail(id).catch(() => null),
        adminCourtAdminSalaryApi.performance(id).catch(() => null),
        adminCourtAdminSalaryApi.getConfig(id).catch(() => null),
        adminCourtAdminSalaryApi.history(id).catch(() => ({ data: {} } as any)),
      ])

      if (detailRes) {
        const d = (detailRes.data?.data ?? detailRes.data?.courtAdmin ?? detailRes.data) as CourtAdmin
        setDetail(d)
      }
      if (perfRes) {
        const p = (perfRes.data?.data ?? perfRes.data) as PerformanceMetrics
        if (p && (p.totals || p.performanceScore != null)) setPerf(p)
      }
      if (cfgRes) {
        const cfg = unwrapObject<SalaryConfig>(cfgRes.data, 'config') ?? {}
        setConfig(cfg)
        setEdit({ ...cfg })
      }
      setAdjustments(unwrapList<AdjustmentRow>(histRes.data))
    } catch (err) {
      notify(friendlyError(err, "We couldn't load this court admin."), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Salary actions ------------------------------------------------------
  const handleSave = async () => {
    if (!edit) return
    setBusy('save')
    try {
      await adminCourtAdminSalaryApi.setBaseSalary(id, {
        baseSalary: Number(edit.baseSalary || 0),
        notes: edit.notes || undefined,
      })
      notify('Salary saved', 'success')
      await loadAll()
    } catch (err) {
      notify(friendlyError(err, "We couldn't save the salary config."), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleHold = async () => {
    const reason = prompt('Hold reason?')
    if (!reason) return
    setBusy('hold')
    try {
      await adminCourtAdminSalaryApi.hold(id, reason)
      notify('Salary held', 'success')
      await loadAll()
    } catch (err) {
      notify(friendlyError(err, "We couldn't put the salary on hold."), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleRelease = async () => {
    if (!confirm('Release the hold?')) return
    setBusy('release')
    try {
      await adminCourtAdminSalaryApi.release(id)
      notify('Hold released', 'success')
      await loadAll()
    } catch (err) {
      notify(friendlyError(err, "We couldn't release the hold."), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handlePay = async () => {
    if (!confirm('Pay this cycle now?')) return
    setBusy('pay')
    try {
      await adminCourtAdminSalaryApi.pay(id)
      notify('Paid', 'success')
      await loadAll()
    } catch (err) {
      notify(friendlyError(err, "We couldn't process the payout."), 'error')
    } finally {
      setBusy(null)
    }
  }

  const isAuthorized = useMemo(
    () => !!(detail?.isAuthorized || detail?.authorizationStatus === 'AUTHORIZED' || detail?.status === 'ACTIVE'),
    [detail],
  )

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b flex items-center justify-between p-4 z-10 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {detail?.avatarUrl ? (
              <img src={detail.avatarUrl} alt={detail?.name || ''} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold flex-shrink-0">
                {(detail?.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate flex items-center gap-2">
                {detail?.name || 'Court admin'}
                {isAuthorized && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                    <BadgeCheck className="w-3 h-3" /> Authorized
                  </span>
                )}
              </h2>
              <div className="text-xs text-gray-500 truncate">{detail?.email}</div>
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
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-4">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'performance', label: 'Performance' },
                { id: 'salary', label: 'Salary' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as any)}
                  className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-5">
              {tab === 'overview' && (
                <>
                  <Section title="Contact">
                    <Row icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={detail?.email} />
                    <Row icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={detail?.phone} />
                    <Row icon={<Hash className="w-3.5 h-3.5" />} label="Registration #" value={detail?.registrationNumber} mono />
                  </Section>

                  <Section title="Court assignment">
                    <Row icon={<Landmark className="w-3.5 h-3.5" />} label="Court" value={detail?.court?.name} />
                    <Row label="Type" value={detail?.court?.type} />
                    <Row label="Location" value={[detail?.court?.district, detail?.court?.state, detail?.court?.pincode].filter(Boolean).join(' · ') || undefined} />
                  </Section>

                  <Section title="Status">
                    <Row label="Authorization" value={detail?.authorizationStatus || (isAuthorized ? 'AUTHORIZED' : 'PENDING')} />
                    <Row label="Account status" value={detail?.status || 'ACTIVE'} />
                    <Row label="Joined" value={detail?.createdAt ? new Date(detail.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined} />
                  </Section>
                </>
              )}

              {tab === 'performance' && (
                perf ? (
                  <>
                    {/* Composite score */}
                    <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-4">
                      <div className="text-[11px] uppercase tracking-wider text-indigo-600 font-semibold">Performance score</div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-bold text-indigo-900">{perf.performanceScore ?? 0}</span>
                        <span className="text-sm text-indigo-700">/ 100</span>
                      </div>
                      <div className="text-xs text-indigo-700/80 mt-1">
                        Composite of volume (40%), speed (30%), and quality (30%).
                      </div>
                    </div>

                    {/* Totals */}
                    <Section title="Decisions">
                      <div className="grid grid-cols-2 gap-2">
                        <MiniStat icon={<TrendingUp className="w-3 h-3" />} label="Processed" value={perf.totals?.processed ?? 0} />
                        <MiniStat icon={<Clock className="w-3 h-3" />} label="Pending" value={perf.totals?.pending ?? 0} accent="text-amber-700" />
                        <MiniStat icon={<CheckCircle2 className="w-3 h-3" />} label="Approved" value={perf.totals?.approved ?? 0} accent="text-green-700" />
                        <MiniStat icon={<XCircle className="w-3 h-3" />} label="Rejected" value={perf.totals?.rejected ?? 0} accent="text-red-700" />
                      </div>
                    </Section>

                    <Section title="Ratios">
                      <Row label="Approval rate" value={fmtPct(perf.ratios?.approvalRate)} />
                      <Row label="Rejection rate" value={fmtPct(perf.ratios?.rejectionRate)} />
                    </Section>

                    <Section title="Speed">
                      <Row
                        label="Avg turnaround"
                        value={perf.speed?.avgTurnaroundHours != null ? `${perf.speed.avgTurnaroundHours.toFixed(1)} hours` : 'No decisions yet'}
                      />
                      <Row
                        label="Median turnaround"
                        value={perf.speed?.medianTurnaroundHours != null ? `${perf.speed.medianTurnaroundHours.toFixed(1)} hours` : 'No decisions yet'}
                      />
                    </Section>

                    <Section title="Quality & activity">
                      <Row label="Active days (last 30)" value={String(perf.activity?.activeDays30 ?? 0)} />
                      <Row label="Super-admin overrides" value={String(perf.quality?.overrides ?? 0)} />
                    </Section>
                  </>
                ) : (
                  <div className="text-sm text-gray-500 py-8 text-center">
                    Performance metrics aren't available yet.
                  </div>
                )
              )}

              {tab === 'salary' && (
                <>
                  {/* Action bar */}
                  <div className="flex flex-wrap gap-2">
                    {config?.isOnHold ? (
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
                      disabled={busy !== null || !!config?.isOnHold || !config?.baseSalary}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <Banknote className="w-3.5 h-3.5" /> Pay this cycle
                    </button>
                  </div>

                  {config?.isOnHold && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                      <ShieldOff className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong>Salary on hold.</strong>
                        {config.holdReason && <span className="ml-1">{config.holdReason}</span>}
                      </div>
                    </div>
                  )}

                  {/* Salary editor */}
                  <Section title="Configuration">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Base salary (₹/cycle)</label>
                        <input
                          type="number"
                          min={0}
                          value={edit?.baseSalary ?? 0}
                          onChange={(e) => setEdit({ ...(edit || {}), baseSalary: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <div className="text-xs text-gray-400 mt-1">{fmt(edit?.baseSalary ?? 0)} per cycle</div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                        <textarea
                          rows={2}
                          value={edit?.notes ?? ''}
                          onChange={(e) => setEdit({ ...(edit || {}), notes: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                          placeholder="Internal note for this change…"
                        />
                      </div>
                      <button
                        onClick={handleSave}
                        disabled={busy !== null || edit?.baseSalary == null}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {busy === 'save' ? 'Saving…' : 'Save salary'}
                      </button>
                    </div>
                  </Section>

                  {/* Adjustment history */}
                  <Section title="Adjustment history">
                    {adjustments.length === 0 ? (
                      <p className="text-sm text-gray-500">No salary adjustments yet.</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {adjustments.map((a) => (
                          <div key={a.id} className="py-2.5">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-gray-900 inline-flex items-center gap-1">
                                <History className="w-3.5 h-3.5 text-gray-400" /> {a.action}
                              </span>
                              {a.amount != null && <span className="font-semibold">{fmt(a.amount)}</span>}
                            </div>
                            {a.reason && <div className="text-xs text-gray-600 mt-0.5">{a.reason}</div>}
                            <div className="text-[10px] text-gray-400 mt-0.5">{new Date(a.createdAt).toLocaleString('en-IN')}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h4 className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-2">{title}</h4>
    <div className="space-y-1.5 bg-gray-50 rounded-lg p-3">{children}</div>
  </div>
)

const Row: FC<{ icon?: React.ReactNode; label: string; value?: string | null; mono?: boolean }> = ({ icon, label, value, mono }) => (
  <div className="flex items-start justify-between text-sm gap-3">
    <span className="inline-flex items-center gap-1.5 text-gray-500 flex-shrink-0">{icon}{label}</span>
    <span className={`text-gray-900 font-medium truncate text-right ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
  </div>
)

const MiniStat: FC<{ icon?: React.ReactNode; label: string; value: number | string; accent?: string }> = ({ icon, label, value, accent }) => (
  <div className="bg-white border border-gray-100 rounded-lg p-2.5">
    <div className="text-[10px] uppercase tracking-wider text-gray-500 inline-flex items-center gap-1">
      {icon}{label}
    </div>
    <div className={`text-base font-bold mt-0.5 ${accent || 'text-gray-900'}`}>{value}</div>
  </div>
)

export default AdminCourtAdminsPage
