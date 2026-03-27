import { FC, FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, MapPin, Gavel, Shield, Star, ChevronRight,
  Calendar, FileText, Wallet, ArrowUpRight, Clock,
  Scale, Users, Sparkles, Phone, BookOpen, Video,
  Loader2, AlertCircle, TrendingUp, CheckCircle2,
} from 'lucide-react'
import { lawyersApi, appointmentsApi, casesApi, walletApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { useUserStore } from '@/stores/userStore'
import { format, isToday, isTomorrow, parseISO } from 'date-fns'

// ── helpers ──────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const sortAlphabetically = (items: string[]) => [...items].sort((a, b) => a.localeCompare(b))

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

const DEFAULT_CASE_TYPE_OPTIONS = [
  'Family Law', 'Criminal Law', 'Corporate Law', 'Property Law',
  'Civil Litigation', 'Tax Law', 'Consumer Rights', 'Women Rights',
]

// ── component ────────────────────────────────────────────────────────────
const HomePage: FC = () => {
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const { user: storeUser, getUser } = useUserStore()
  const user = storeUser || authUser

  // Search state
  const [location, setLocation] = useState('')
  const [caseType, setCaseType] = useState('')
  const [caseTypeOptions, setCaseTypeOptions] = useState<string[]>(sortAlphabetically(DEFAULT_CASE_TYPE_OPTIONS))

  // Dynamic data state
  const [appointments, setAppointments] = useState<any[]>([])
  const [cases, setCases] = useState<any[]>([])
  const [walletBal, setWalletBal] = useState<number>(0)
  const [topLawyers, setTopLawyers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch user + all dynamic data on mount
  useEffect(() => {
    getUser()
    const load = async () => {
      setLoading(true)
      try {
        const [apptRes, caseRes, walletRes, lawyerRes] = await Promise.allSettled([
          appointmentsApi.getAll(),
          casesApi.getAll(),
          walletApi.getBalance(),
          lawyersApi.getAll({ page: 1, limit: 6, sortBy: 'rating', order: 'desc' }),
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
          setWalletBal(data?.balance ?? data?.data?.balance ?? 0)
        }
        if (lawyerRes.status === 'fulfilled') {
          const payload = lawyerRes.value?.data || {}
          const items = payload.items || payload.data || []
          setTopLawyers(items.slice(0, 6))

          // Extract specializations for the search dropdown
          const specSet = new Set<string>()
          items.forEach((l: any) => {
            ; (l.specializations || l.specialization || []).forEach((s: string) => {
              if (s?.trim()) specSet.add(s.trim())
            })
          })
          if (specSet.size > 0) {
            setCaseTypeOptions(sortAlphabetically(Array.from(specSet)))
          }
        }
      } catch {
        // silently handle
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── derived stats ──────────────────────────────────────────────────────
  const upcomingAppts = appointments
    .filter((a) => ['CONFIRMED', 'PENDING'].includes(a.status))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 4)

  const activeCases = cases.filter((c) =>
    ['OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'HEARING_SCHEDULED', 'PENDING_DOCUMENTS'].includes(c.status),
  )

  const completedAppts = appointments.filter((a) => a.status === 'COMPLETED').length

  // Greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const displayName = user?.name ? user.name.split(' ')[0] : 'there'

  // Search handler
  const handleFindLawyer = (e: FormEvent) => {
    e.preventDefault()
    const trimmedLocation = location.trim()
    if (!trimmedLocation) return
    const params = new URLSearchParams({ location: trimmedLocation })
    if (caseType) params.set('specialization', caseType)
    navigate(`/app/search?${params.toString()}`)
  }

  // Quick actions
  const quickActions = [
    { label: 'Find Lawyer', icon: Search, path: '/app/search', color: 'bg-blue-50 text-blue-600', hoverBg: 'hover:bg-blue-100' },
    { label: 'My Appointments', icon: Calendar, path: '/app/appointments', color: 'bg-emerald-50 text-emerald-600', hoverBg: 'hover:bg-emerald-100' },
    { label: 'My Cases', icon: FileText, path: '/app/cases', color: 'bg-amber-50 text-amber-600', hoverBg: 'hover:bg-amber-100' },
    { label: 'Wallet', icon: Wallet, path: '/app/wallet', color: 'bg-purple-50 text-purple-600', hoverBg: 'hover:bg-purple-100' },
    { label: 'Legal Eagle AI', icon: Sparkles, path: '/app/legal-eagle', color: 'bg-rose-50 text-rose-600', hoverBg: 'hover:bg-rose-100' },
    { label: 'Tele Law', icon: Phone, path: '/app/tele-law', color: 'bg-teal-50 text-teal-600', hoverBg: 'hover:bg-teal-100' },
    { label: 'Lex Rates', icon: Scale, path: '/app/lex-rates', color: 'bg-indigo-50 text-indigo-600', hoverBg: 'hover:bg-indigo-100' },
    { label: 'Call History', icon: Video, path: '/app/call-history', color: 'bg-cyan-50 text-cyan-600', hoverBg: 'hover:bg-cyan-100' },
  ]

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50/50">

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-[#0a4d64] to-[#072a38] text-white">
        {/* Background decorations */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/3" />
        <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-white/[0.02] rounded-full -translate-x-1/2 -translate-y-1/2" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-16">
          {/* Greeting + Stats */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
            <div>
              <p className="text-white/60 text-sm font-medium uppercase tracking-widest mb-1">{greeting}</p>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                {displayName} 👋
              </h1>
              <p className="mt-2 text-white/70 text-sm sm:text-base max-w-lg">
                {upcomingAppts.length > 0
                  ? `You have ${upcomingAppts.length} upcoming consultation${upcomingAppts.length > 1 ? 's' : ''}`
                  : 'Manage your legal matters with confidence'}
              </p>
            </div>
          </div>

          {/* Stat cards */}
          {loading ? (
            <div className="flex items-center gap-3 text-white/60">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading your dashboard…</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Upcoming Appointments', value: upcomingAppts.length, icon: Calendar },
                { label: 'Active Cases', value: activeCases.length, icon: FileText },
                { label: 'Completed Consultations', value: completedAppts, icon: CheckCircle2 },
                { label: 'Wallet Balance', value: fmt(walletBal), icon: Wallet },
              ].map((stat) => (
                <div key={stat.label} className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs sm:text-sm text-white/60">{stat.label}</p>
                    <stat.icon className="w-4 h-4 sm:w-5 sm:h-5 opacity-50" />
                  </div>
                  <p className="text-xl sm:text-2xl font-bold">{stat.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Search Bar ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <form
          onSubmit={handleFindLawyer}
          className="bg-white rounded-2xl shadow-xl border border-gray-100 p-3 flex flex-col md:flex-row items-center gap-3"
        >
          <div className="flex items-center flex-1 w-full">
            <MapPin className="w-5 h-5 text-primary ml-3 flex-shrink-0" />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City or Area (e.g., Mumbai, Delhi)"
              className="px-3 py-3.5 w-full outline-none text-gray-800 text-sm sm:text-base"
              required
            />
          </div>
          <div className="hidden md:block w-px bg-gray-200 h-10" />
          <div className="flex items-center flex-1 w-full">
            <Gavel className="w-5 h-5 text-primary ml-3 flex-shrink-0" />
            <select
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
              className="px-3 py-3.5 w-full outline-none text-gray-800 bg-transparent text-sm sm:text-base"
            >
              <option value="">All Specializations</option>
              {caseTypeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="w-full md:w-auto bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md text-sm sm:text-base flex items-center justify-center gap-2"
            disabled={!location.trim()}
          >
            <Search className="w-4 h-4" />
            Find Lawyer
          </button>
        </form>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Quick Actions ── */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {quickActions.map((qa) => (
              <button
                key={qa.label}
                onClick={() => navigate(qa.path)}
                className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl ${qa.color} ${qa.hoverBg} transition-all duration-200 text-center group`}
              >
                <qa.icon className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] sm:text-xs font-medium leading-tight">{qa.label}</span>
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
                Upcoming Appointments
              </h2>
              <Link to="/app/appointments" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
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
              <div className="flex flex-col items-center justify-center py-14 text-gray-400 gap-3">
                <Calendar className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">No upcoming appointments</p>
                <Link to="/app/search" className="text-xs text-primary hover:underline font-medium">
                  Find a lawyer →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {upcomingAppts.map((appt) => {
                  const lawyerName = appt.lawyer?.name ?? 'Lawyer'
                  const scheduledAt = appt.scheduledAt ? parseISO(appt.scheduledAt) : null
                  const dateStr = scheduledAt
                    ? isToday(scheduledAt)
                      ? `Today, ${format(scheduledAt, 'h:mm a')}`
                      : isTomorrow(scheduledAt)
                        ? `Tomorrow, ${format(scheduledAt, 'h:mm a')}`
                        : format(scheduledAt, 'dd MMM, h:mm a')
                    : '—'

                  return (
                    <li
                      key={appt.id}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/80 transition-colors cursor-pointer"
                      onClick={() => navigate('/app/appointments')}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0 text-sm">
                        {lawyerName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">Adv. {lawyerName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-500">{dateStr}</span>
                          {appt.meetingType === 'VIDEO_CALL' && (
                            <Video className="w-3 h-3 text-blue-400" />
                          )}
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${statusColor[appt.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {appt.status?.charAt(0) + appt.status?.slice(1).toLowerCase()}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Active Cases */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Active Cases
              </h2>
              <Link to="/app/cases" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="flex flex-col gap-3 p-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-xl" />
                ))}
              </div>
            ) : activeCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400 gap-3">
                <FileText className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">No active cases</p>
                <p className="text-xs text-gray-400">Your cases will appear here</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {activeCases.slice(0, 4).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/80 transition-colors cursor-pointer"
                    onClick={() => navigate(`/app/case/${c.id}`)}
                  >
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.title ?? 'Untitled Case'}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {c.lawyer?.name ? `Adv. ${c.lawyer.name}` : 'Lawyer assigned'} · {c.category ?? 'General'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${caseStatusColor[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
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

        {/* ── Top Rated Lawyers ── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Top Rated Lawyers
            </h2>
            <Link to="/app/search" className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
              View All <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-48 bg-white rounded-2xl border border-gray-100" />
              ))}
            </div>
          ) : topLawyers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
              <Users className="w-12 h-12 mx-auto opacity-20 mb-3" />
              <p className="text-sm">No lawyers available yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topLawyers.map((lawyer) => {
                const feeInRupees = (lawyer.feePerConsultation || lawyer.fee || 0) / 100
                const specs = (lawyer.specializations || lawyer.specialization || []).slice(0, 2)
                return (
                  <div
                    key={lawyer.id}
                    onClick={() => navigate(`/app/lawyers/${lawyer.id}`)}
                    className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-primary/20 hover:shadow-lg transition-all duration-300 cursor-pointer group"
                  >
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                        {lawyer.avatarUrl ? (
                          <img src={lawyer.avatarUrl} alt={lawyer.name} className="w-12 h-12 rounded-full object-cover" />
                        ) : (
                          (lawyer.name || '??').slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">Adv. {lawyer.name}</p>
                          {lawyer.isVerified && (
                            <Shield className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {lawyer.experienceYears ? `${lawyer.experienceYears} yrs exp` : ''}
                          {lawyer.city && lawyer.experienceYears ? ' · ' : ''}
                          {lawyer.city || lawyer.location || ''}
                        </p>
                      </div>
                    </div>

                    {/* Specializations */}
                    {specs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {specs.map((s: string) => (
                          <span key={s} className="text-[10px] bg-primary/5 text-primary px-2 py-0.5 rounded-full font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Rating & Fee */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
                      <div className="flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span className="text-sm font-semibold text-gray-800">{(lawyer.rating ?? 0).toFixed(1)}</span>
                        {lawyer.totalReviews > 0 && (
                          <span className="text-xs text-gray-400">({lawyer.totalReviews})</span>
                        )}
                      </div>
                      {feeInRupees > 0 && (
                        <span className="text-sm font-semibold text-primary">{fmt(feeInRupees)}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Platform Features ── */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Explore Platform</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                title: 'Legal Eagle AI',
                desc: 'Get instant answers to legal questions from our AI assistant',
                icon: Sparkles,
                path: '/app/legal-eagle',
                gradient: 'from-rose-500 to-pink-600',
              },
              {
                title: 'Tele Law',
                desc: 'Free government-backed legal advice in 22 Indian languages',
                icon: Phone,
                path: '/app/tele-law',
                gradient: 'from-teal-500 to-emerald-600',
              },
              {
                title: 'Lex Rates',
                desc: 'Compare fair legal service pricing across India',
                icon: Scale,
                path: '/app/lex-rates',
                gradient: 'from-indigo-500 to-purple-600',
              },
            ].map((feature) => (
              <Link
                key={feature.title}
                to={feature.path}
                className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white hover:shadow-lg transition-all duration-300"
              >
                <div className={`bg-gradient-to-br ${feature.gradient} p-6 text-white`}>
                  <feature.icon className="w-8 h-8 mb-3 opacity-90" />
                  <h3 className="text-lg font-bold">{feature.title}</h3>
                  <p className="text-sm opacity-80 mt-1 leading-relaxed">{feature.desc}</p>
                </div>
                <div className="px-6 py-3.5 flex items-center justify-between">
                  <span className="text-xs text-primary font-semibold">Explore</span>
                  <ChevronRight className="w-4 h-4 text-primary group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Trust Bar ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: Shield, label: 'Bar Council Verified', desc: 'All lawyers are verified' },
              { icon: Scale, label: 'Fair Pricing', desc: 'Transparent fee structure' },
              { icon: TrendingUp, label: 'Case Tracking', desc: 'Real-time case updates' },
              { icon: BookOpen, label: 'Know Your Rights', desc: 'Free legal awareness' },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center text-center gap-2">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA Banner ── */}
        <section className="bg-gradient-to-r from-primary to-[#072a38] rounded-2xl overflow-hidden shadow-lg relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative p-8 sm:p-12 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <h3 className="text-2xl sm:text-3xl font-bold mb-2">Need Legal Help?</h3>
              <p className="text-white/70 text-sm sm:text-base">
                Connect with a verified lawyer in minutes. Available 24×7.
              </p>
            </div>
            <Link
              to="/app/search"
              className="flex-shrink-0 bg-white text-primary font-semibold px-8 py-3.5 rounded-xl hover:bg-gray-100 transition-colors shadow-sm text-center"
            >
              Find a Lawyer
            </Link>
          </div>
        </section>

      </div>
    </div>
  )
}

export default HomePage