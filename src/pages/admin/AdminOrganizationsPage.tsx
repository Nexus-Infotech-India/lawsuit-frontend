import { FC, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, Search, Loader2, X, BadgeCheck, ShieldOff, Trash2, Filter,
  Mail, Phone, MapPin, Users, Coins, ExternalLink, AlertCircle, Check,
} from 'lucide-react'
import { adminApi } from '@/services/api'
import { unwrapList } from '@/utils/unwrap'
import { friendlyError } from '@/utils/errors'

interface OrgRow {
  id: string
  name?: string
  email?: string
  phone?: string
  isVerified?: boolean
  bannedAt?: string | null
  deletedAt?: string | null
  banReason?: string | null
  avatarUrl?: string | null
  createdAt?: string
  registrationNumber?: string | null
  gstNumber?: string | null
  panNumber?: string | null
  pincode?: string | null
  city?: string | null
  state?: string | null
  about?: string | null
  website?: string | null
  practiceAreas?: string[]
  consultationFee?: number | null
  _count?: { lawyers?: number }
  /**
   * Active lawyer roster (server returns up to 50, banned/deleted excluded).
   * Only present on the detail response, not on the list response.
   */
  lawyers?: Array<{
    id: string
    name?: string | null
    email?: string | null
    phone?: string | null
    avatarUrl?: string | null
    isVerified?: boolean
    specializations?: string[] | null
    experienceYears?: number | null
    feePerConsultation?: number | null
  }>
}

type FilterMode = 'all' | 'verified' | 'unverified' | 'banned' | 'deleted'

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtCurrency = (n?: number | null) =>
  n != null ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n / 100) : '—'

const AdminOrganizationsPage: FC = () => {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getAllUsers({
        role: 'ORGANIZATION',
        q: q.trim() || undefined,
        limit: 100,
      })
      setOrgs(unwrapList<OrgRow>(res.data))
    } catch (err) {
      showToast(friendlyError(err, "Couldn't load organizations."), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply filter client-side so flipping tabs feels instant.
  const filtered = orgs.filter((o) => {
    if (filter === 'verified') return o.isVerified && !o.bannedAt && !o.deletedAt
    if (filter === 'unverified') return !o.isVerified && !o.bannedAt && !o.deletedAt
    if (filter === 'banned') return !!o.bannedAt && !o.deletedAt
    if (filter === 'deleted') return !!o.deletedAt
    return true
  })

  const counts = {
    all: orgs.length,
    verified: orgs.filter((o) => o.isVerified && !o.bannedAt && !o.deletedAt).length,
    unverified: orgs.filter((o) => !o.isVerified && !o.bannedAt && !o.deletedAt).length,
    banned: orgs.filter((o) => !!o.bannedAt && !o.deletedAt).length,
    deleted: orgs.filter((o) => !!o.deletedAt).length,
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-50">
          <Building2 className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-sm text-gray-500">Master directory of all law firms / organizations on NyayaX.</p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search by name / email / phone…"
            className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          Search
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'all', label: 'All' },
          { id: 'verified', label: 'Verified' },
          { id: 'unverified', label: 'Unverified' },
          { id: 'banned', label: 'Banned' },
          { id: 'deleted', label: 'Deleted' },
        ] as const).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === f.id
              ? 'bg-indigo-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
          >
            {f.id === 'all' && <Filter className="w-3 h-3" />}
            {f.label}
            <span className={`text-[10px] ${filter === f.id ? 'opacity-75' : 'opacity-60'}`}>({counts[f.id]})</span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center text-gray-500">
          <Building2 className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          {orgs.length === 0 ? 'No organizations on the platform yet.' : 'No matches for this filter.'}
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Lawyers</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className={`hover:bg-gray-50 cursor-pointer ${o.deletedAt ? 'opacity-60' : ''}`}
                  onClick={() => setOpenId(o.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {o.avatarUrl ? (
                        <img src={o.avatarUrl} alt={o.name || ''} className="w-9 h-9 rounded-lg object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold">
                          {(o.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{o.name || 'Unnamed'}</div>
                        <div className="text-xs text-gray-500 truncate">{o.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {[o.city, o.state].filter(Boolean).join(', ') || '—'}
                    {o.pincode && <div className="text-gray-400">{o.pincode}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {o._count?.lawyers ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {o.isVerified && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                          <BadgeCheck className="w-3 h-3" /> Verified
                        </span>
                      )}
                      {o.bannedAt && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                          <ShieldOff className="w-3 h-3" /> Banned
                        </span>
                      )}
                      {o.deletedAt && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                          <Trash2 className="w-3 h-3" /> Deleted
                        </span>
                      )}
                      {!o.isVerified && !o.bannedAt && !o.deletedAt && (
                        <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Unverified</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenId(o.id) }}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      View detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <OrgDetailDrawer id={openId} onClose={() => setOpenId(null)} />}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50">
          <div className={`flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Detail drawer ──────────────────────────────────────────────────────

const OrgDetailDrawer: FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const [org, setOrg] = useState<OrgRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await adminApi.getUserById(id)
        const data = (res.data?.data ?? res.data?.user ?? res.data) as OrgRow
        if (!cancelled) setOrg(data)
      } catch (err) {
        if (!cancelled) setError(friendlyError(err, "Couldn't load this organization."))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b flex items-center justify-between p-4 z-10">
          <h2 className="text-lg font-semibold">Organization detail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        ) : error || !org ? (
          <div className="p-6 text-sm text-red-700">{error || "We couldn't find this organization."}</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Header */}
            <div className="flex items-start gap-3">
              {org.avatarUrl ? (
                <img src={org.avatarUrl} alt={org.name || ''} className="w-14 h-14 rounded-lg object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-semibold">
                  {(org.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold text-gray-900">{org.name || 'Unnamed'}</h3>
                  {org.isVerified && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                      <BadgeCheck className="w-3 h-3" /> Verified
                    </span>
                  )}
                  {org.bannedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                      <ShieldOff className="w-3 h-3" /> Banned
                    </span>
                  )}
                </div>
                {org.about && <p className="text-xs text-gray-600 mt-1">{org.about}</p>}
              </div>
            </div>

            {/* Contact */}
            <Section title="Contact">
              <Row icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={org.email} />
              <Row icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={org.phone} />
              {org.website && <Row icon={<ExternalLink className="w-3.5 h-3.5" />} label="Website" value={org.website} link />}
              <Row icon={<MapPin className="w-3.5 h-3.5" />} label="Location" value={[org.city, org.state, org.pincode].filter(Boolean).join(', ') || '—'} />
            </Section>

            {/* Compliance */}
            <Section title="Compliance">
              <Row label="Registration #" value={org.registrationNumber || '—'} mono />
              <Row label="GST" value={org.gstNumber || '—'} mono />
              <Row label="PAN" value={org.panNumber || '—'} mono />
            </Section>

            {/* Practice */}
            {(org.practiceAreas?.length || org.consultationFee != null) && (
              <Section title="Practice">
                {org.practiceAreas && org.practiceAreas.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {org.practiceAreas.map((p) => (
                      <span key={p} className="inline-block text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{p}</span>
                    ))}
                  </div>
                )}
                {org.consultationFee != null && (
                  <Row icon={<Coins className="w-3.5 h-3.5" />} label="Consultation fee" value={fmtCurrency(org.consultationFee)} />
                )}
              </Section>
            )}

            {/* Lawyers under this firm */}
            <Section title={`Lawyers (${org._count?.lawyers ?? org.lawyers?.length ?? 0})`}>
              {!org.lawyers || org.lawyers.length === 0 ? (
                <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3">
                  No lawyers on the roster yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {org.lawyers.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2 bg-white"
                    >
                      {l.avatarUrl ? (
                        <img
                          src={l.avatarUrl}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover bg-gray-100 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                          {(l.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {l.name || 'Unnamed'}
                          </span>
                          {l.isVerified && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                              <BadgeCheck className="w-2.5 h-2.5" /> Verified
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">
                          {l.email || l.phone || '—'}
                        </div>
                        {(l.specializations?.length || l.experienceYears != null || l.feePerConsultation != null) && (
                          <div className="text-[11px] text-gray-400 truncate">
                            {l.specializations?.slice(0, 2).join(', ')}
                            {l.experienceYears != null
                              ? `${l.specializations?.length ? ' · ' : ''}${l.experienceYears} yrs`
                              : ''}
                            {l.feePerConsultation != null
                              ? ` · ${fmtCurrency((l.feePerConsultation as number) * 100)}/consult`
                              : ''}
                          </div>
                        )}
                      </div>
                      <Link
                        to={`/admin/lawyers?id=${l.id}`}
                        onClick={onClose}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex-shrink-0"
                      >
                        Open ↗
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {(org._count?.lawyers ?? 0) > (org.lawyers?.length ?? 0) && (
                <p className="text-[11px] text-gray-400 mt-2">
                  Showing {org.lawyers?.length ?? 0} of {org._count?.lawyers ?? 0} — open Lawyers
                  page for the full roster.
                </p>
              )}
            </Section>

            {/* Stats */}
            <Section title="Activity">
              <Row icon={<Users className="w-3.5 h-3.5" />} label="Lawyers under firm" value={String(org._count?.lawyers ?? 0)} />
              <Row label="Joined" value={fmtDate(org.createdAt)} />
              {org.bannedAt && (
                <Row label="Banned on" value={`${fmtDate(org.bannedAt)}${org.banReason ? ` — ${org.banReason}` : ''}`} />
              )}
              {org.deletedAt && <Row label="Deleted on" value={fmtDate(org.deletedAt)} />}
            </Section>

            {/* Quick actions */}
            <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2">
              <Link
                to={`/admin/salary?subject=organizations&id=${org.id}`}
                onClick={onClose}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Coins className="w-4 h-4" /> Salary controls
              </Link>
              <Link
                to="/admin/moderation"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ShieldOff className="w-4 h-4" /> Moderate
              </Link>
            </div>
          </div>
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

const Row: FC<{ icon?: React.ReactNode; label: string; value?: string | null; mono?: boolean; link?: boolean }> = ({ icon, label, value, mono, link }) => (
  <div className="flex items-start justify-between text-sm gap-3">
    <span className="inline-flex items-center gap-1.5 text-gray-500 flex-shrink-0">{icon}{label}</span>
    {link && value ? (
      <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noreferrer" className={`text-indigo-600 hover:underline truncate text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </a>
    ) : (
      <span className={`text-gray-900 font-medium truncate text-right ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    )}
  </div>
)

export default AdminOrganizationsPage
