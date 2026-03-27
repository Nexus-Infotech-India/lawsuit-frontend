import { FC, useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Calendar, FileText, IndianRupee, Star,
  Clock, ChevronRight, ArrowUpRight,
  Video, AlertCircle, CheckCircle2,
  UserCheck, BookOpen, Loader2,
} from 'lucide-react'
import { appointmentsApi, casesApi, walletApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { useUserStore } from '@/stores/userStore'
import { format, isToday, parseISO } from 'date-fns'

// ── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const statusColor: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  RESCHEDULED: 'bg-purple-100 text-purple-700',
}

const caseStatusColor: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  UNDER_REVIEW: 'bg-purple-100 text-purple-700',
  CLOSED: 'bg-gray-100 text-gray-600',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-red-100 text-red-700',
  SETTLED: 'bg-teal-100 text-teal-700',
}

// ── component ────────────────────────────────────────────────────────────────
const LawyerHomePage: FC = () => {
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const { user: storeUser, getUser } = useUserStore()
  const user = storeUser || authUser

  // Data state
  const [appointments, setAppointments] = useState<any[]>([])
  const [cases, setCases] = useState<any[]>([])
  const [walletBal, setWalletBal] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch on mount
  useEffect(() => {
    getUser()
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [apptRes, caseRes, walletRes] = await Promise.allSettled([
          appointmentsApi.getAll(),
          casesApi.getAll(),
          walletApi.getBalance(),
        ])

        if (apptRes.status === 'fulfilled') {
          const data = apptRes.value?.data
          setAppointments(Array.isArray(data) ? data : data?.items ?? data?.appointments ?? [])
        }
        if (caseRes.status === 'fulfilled') {
          const data = caseRes.value?.data
          setCases(Array.isArray(data) ? data : data?.items ?? data?.cases ?? [])
        }
        if (walletRes.status === 'fulfilled') {
          const data = walletRes.value?.data
          setWalletBal(data?.balance ?? data?.wallet?.balance ?? 0)
        }
      } catch (e: any) {
        setError('Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── derived stats ─────────────────────────────────────────────────────────
  const todayAppointments = appointments.filter((a) => {
    try { return isToday(parseISO(a.scheduledAt)) } catch { return false }
  })
  const upcomingAppts = appointments
    .filter((a) => ['CONFIRMED', 'PENDING'].includes(a.status))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 4)

  const activeCases = cases.filter((c) => ['OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'HEARING_SCHEDULED', 'PENDING_DOCUMENTS'].includes(c.status))
  const recentCases = [...cases].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()).slice(0, 4)
  const completedAppts = appointments.filter((a) => a.status === 'COMPLETED').length
  const avgRating = (user as any)?.rating ?? 0

  // ── greeting ──────────────────────────────────────────────────────────────
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const displayName = user?.name ? `Adv. ${user.name.split(' ')[0]}` : 'Advocate'

  // ── quick-action cards ────────────────────────────────────────────────────
  const quickActions = [
    { label: 'My Appointments', icon: Calendar, path: '/lawyer/appointments', color: 'bg-blue-50 text-blue-600' },
    { label: 'My Cases', icon: FileText, path: '/lawyer/cases', color: 'bg-amber-50 text-amber-600' },
    { label: 'Wallet', icon: IndianRupee, path: '/lawyer/wallet', color: 'bg-purple-50 text-purple-600' },
    { label: 'My Profile', icon: UserCheck, path: '/lawyer/profile', color: 'bg-green-50 text-green-600' },
    { label: 'Templates', icon: BookOpen, path: '/lawyer/agreement-templates', color: 'bg-rose-50 text-rose-600' },
    { label: 'Legal Eagle AI', icon: Star, path: '/lawyer/legal-eagle', color: 'bg-teal-50 text-teal-600' },
  ]

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero greeting strip ── */}
      <section className="bg-gradient-to-r from-primary to-midnight text-white py-10 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <p className="text-white/70 text-sm font-medium uppercase tracking-widest mb-1">{greeting}</p>
              <h1 className="text-3xl sm:text-4xl font-extrabold">{displayName} 👋</h1>
              <p className="mt-1 text-white/80 text-sm">
                {todayAppointments.length > 0
                  ? `You have ${todayAppointments.length} consultation${todayAppointments.length > 1 ? 's' : ''} today`
                  : 'No consultations scheduled for today'}
              </p>
            </div>
            {avgRating > 0 && (
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur border border-white/20 px-4 py-2 rounded-xl">
                <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                <span className="text-xl font-bold">{avgRating.toFixed(1)}</span>
                <span className="text-white/70 text-sm">Your Rating</span>
              </div>
            )}
          </div>

          {/* Stat cards */}
          {loading ? (
            <div className="flex items-center gap-3 text-white/70">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading your stats…</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Today's Consults", value: todayAppointments.length, icon: Calendar, suffix: '' },
                { label: 'Active Cases', value: activeCases.length, icon: FileText, suffix: '' },
                { label: 'Total Consultations', value: completedAppts, icon: CheckCircle2, suffix: '' },
                { label: 'Wallet Balance', value: fmt(walletBal), icon: IndianRupee, suffix: '' },
              ].map((stat) => (
                <div key={stat.label} className="bg-white/15 backdrop-blur border border-white/20 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-white/70">{stat.label}</p>
                    <stat.icon className="w-5 h-5 opacity-60" />
                  </div>
                  <p className="text-2xl font-bold">{stat.value}{stat.suffix}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Main Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Quick Actions ── */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {quickActions.map((qa) => (
              <button
                key={qa.label}
                onClick={() => navigate(qa.path)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl ${qa.color} hover:opacity-80 transition-opacity text-center`}
              >
                <qa.icon className="w-7 h-7" />
                <span className="text-xs font-medium leading-tight">{qa.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Two-column layout ── */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Upcoming Appointments */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                Upcoming Consultations
              </h2>
              <Link to="/lawyer/appointments" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="flex flex-col gap-3 p-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-xl" />
                ))}
              </div>
            ) : upcomingAppts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                <Calendar className="w-10 h-10 opacity-30" />
                <p className="text-sm">No upcoming appointments</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {upcomingAppts.map((appt) => {
                  const clientName = appt.client?.name ?? 'Client'
                  const scheduledAt = appt.scheduledAt ? parseISO(appt.scheduledAt) : null
                  const dateStr = scheduledAt
                    ? isToday(scheduledAt)
                      ? `Today, ${format(scheduledAt, 'h:mm a')}`
                      : format(scheduledAt, 'dd MMM, h:mm a')
                    : '—'

                  return (
                    <li
                      key={appt.id}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/lawyer/appointments`)}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0 text-sm">
                        {clientName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{clientName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-500">{dateStr}</span>
                          {appt.meetingType === 'VIDEO_CALL' && (
                            <Video className="w-3 h-3 text-blue-400" />
                          )}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusColor[appt.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {appt.status.charAt(0) + appt.status.slice(1).toLowerCase()}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Recent Cases */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Recent Cases
              </h2>
              <Link to="/lawyer/cases" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="flex flex-col gap-3 p-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-xl" />
                ))}
              </div>
            ) : recentCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                <FileText className="w-10 h-10 opacity-30" />
                <p className="text-sm">No cases yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {recentCases.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/lawyer/case/${c.id}`)}
                  >
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.title ?? 'Untitled Case'}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {c.client?.name ?? 'Client'} · {c.category ?? 'General'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${caseStatusColor[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {(c.status ?? '').replace(/_/g, ' ')}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Summary stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: 'Completed Consultations',
              value: completedAppts,
              icon: CheckCircle2,
              bg: 'bg-green-50',
              iconColor: 'text-green-500',
            },
            {
              label: 'Active Cases',
              value: activeCases.length,
              icon: FileText,
              bg: 'bg-blue-50',
              iconColor: 'text-blue-500',
            },
            {
              label: 'Total Appointments',
              value: appointments.length,
              icon: Calendar,
              bg: 'bg-purple-50',
              iconColor: 'text-purple-500',
            },
            {
              label: 'Wallet Balance',
              value: fmt(walletBal),
              icon: IndianRupee,
              bg: 'bg-amber-50',
              iconColor: 'text-amber-500',
            },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-5 flex items-center gap-4`}>
              <div className={`w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-gray-900 truncate">{loading ? '—' : s.value}</p>
                <p className="text-xs text-gray-500 leading-tight">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

export default LawyerHomePage