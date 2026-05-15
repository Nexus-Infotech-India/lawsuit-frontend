import { FC, useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import NotificationModal from '../components/molecules/NotificationModal'
import NotificationToast from '../components/atoms/NotificationToast'
import VideoCallProvider from '../components/organisms/VideoCallProvider'
import ErrorBoundary from '../components/organisms/ErrorBoundary'
import { useNotificationStore } from '../stores/notificationStore'
import { useNotificationSocket } from '../hooks/useNotificationSocket'
import useFcmRegistration from '../hooks/useFcmRegistration'
import useWalletStore from '../stores/walletStore'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import UserMenu from '../components/molecules/UserMenu'
import BrandLogo from '../components/atoms/BrandLogo'

const AppLayout: FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const balance = useWalletStore((s) => s.balance)
  const fetchBalance = useWalletStore((s) => s.fetchBalance)

  // Boot socket connection + notification listeners
  useNotificationSocket()
  useFcmRegistration()

  useEffect(() => {
    fetchBalance().catch(() => { })
  }, [])

  // const balance = Array.isArray(appointments)
  //   ? appointments.reduce((sum, a: any) => {
  //       if (a?.paymentId && a?.lawyer?.fee) return sum + ((30/100)*a.lawyer.fee || 0)
  //       return sum
  //     }, 0)
  //   : 0

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  /**
   * Nav is split into two tiers:
   *  - `primaryNav` — 5 always-visible top-level items the user lands on most
   *  - `moreGroups` — the rest, organised into themed sections inside a
   *    single "More" dropdown
   *
   * Rationale:
   *  - "Home / Find Lawyers / Appointments / Cases / Chats" cover the day-to-day
   *    high-frequency surfaces. Wallet + Tele Law + Lex Rates etc. are reachable
   *    from Home's Quick Actions anyway, so they don't need permanent top-bar
   *    real estate.
   *  - Grouping the rest by *intent* (Browse / Resolution / AI Tools / Resources)
   *    makes the dropdown scannable instead of a 10-item dump.
   *  - Same `navigation` flat array is still derived for the mobile menu so we
   *    don't have to maintain two source lists.
   */
  const primaryNav = [
    { name: 'Home', path: '/app/home' },
    { name: 'Find Lawyers', path: '/app/search' },
    // Law Firms promoted out of the "More → Browse" group into the top
    // nav — it's a first-class discovery surface, not a sub-page.
    { name: 'Law Firms', path: '/app/firms' },
    { name: 'Appointments', path: '/app/appointments' },
    { name: 'Cases', path: '/app/cases' },
    { name: 'Chats', path: '/app/chats' },
  ]

  const moreGroups: { heading: string; items: { name: string; path: string }[] }[] = [
    {
      heading: 'Browse',
      items: [
        // "Law Firms" moved into primaryNav above. The legacy "Firm Requests"
        // page is now merged into Appointments as a tab — link removed from
        // here so users find both surfaces under /app/appointments.
        { name: 'Lex Rates', path: '/app/lex-rates' },
      ],
    },
    {
      heading: 'Resolution',
      items: [
        { name: 'Mediations', path: '/app/mediations' },
        { name: 'Call History', path: '/app/call-history' },
      ],
    },
    {
      heading: 'AI Tools',
      items: [
        { name: 'Legal Eagle', path: '/app/legal-eagle' },
        { name: 'Document AI', path: '/app/document-ai' },
      ],
    },
    {
      heading: 'Resources',
      items: [
        { name: 'Tele Law', path: '/app/tele-law' },
        { name: 'Legal Updates', path: '/app/legal-updates' },
        { name: 'Help', path: '/app/help' },
      ],
    },
  ]

  // Flat list used by the mobile menu so we don't fork the data source.
  const allMoreItems = moreGroups.flatMap((g) => g.items)
  const navigation = [...primaryNav, ...allMoreItems]

  // Does the current route belong to a "More" item? — used to highlight the
  // dropdown button so users get the same active-tab feedback they'd get on a
  // primary link.
  const isMoreActive = allMoreItems.some((i) => location.pathname === i.path)

  // Dropdown open/close + click-outside handling
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!isMoreOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [isMoreOpen])

  // Close the dropdown whenever the route changes (e.g. user clicks a link
  // inside the dropdown — we want it to dismiss).
  useEffect(() => {
    setIsMoreOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow relative z-50">
        {/*
          Use the full viewport width (not max-w-7xl) so 15+ nav items don't
          push the right-side wallet/notification/profile controls off-screen.
          The middle nav block is scroll-on-overflow with hidden scrollbars
          as a safety net; right-side controls are pinned with flex-shrink-0
          so they're always visible regardless of nav-item count.
        */}
        <div className="max-w-full px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-16 gap-3">
            <div className="flex items-center min-w-0 flex-1">
              {/* Brand — animated NyayaX wordmark links to home. */}
              <div className="flex-shrink-0 flex items-center">
                <BrandLogo to="/app/home" />
              </div>

              {/* Desktop Navigation — 5 primary items + a grouped "More"
                  dropdown that holds the secondary surfaces. Spacing is
                  generous now (only 6 things to fit) so the bar reads as
                  clean rather than cramped. */}
              <div className="hidden sm:flex sm:items-center sm:ml-3 lg:ml-6 sm:space-x-4 md:space-x-6 lg:space-x-7 min-w-0 flex-1">
                {primaryNav.map((item) => (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`${location.pathname === item.path
                      ? 'border-primary text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium flex-shrink-0`}
                  >
                    {item.name}
                  </Link>
                ))}

                {/* More dropdown — grouped secondary items */}
                <div ref={moreRef} className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMoreOpen((s) => !s)}
                    aria-haspopup="true"
                    aria-expanded={isMoreOpen}
                    className={`${isMoreActive
                      ? 'border-primary text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      } inline-flex items-center gap-1 px-1 pt-1 border-b-2 text-sm font-medium`}
                  >
                    More
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${isMoreOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isMoreOpen && (
                    <div
                      role="menu"
                      className="absolute left-0 top-full mt-1 w-72 sm:w-80 bg-white rounded-xl shadow-lg ring-1 ring-black/5 py-2 z-50"
                    >
                      {moreGroups.map((group, idx) => (
                        <div key={group.heading}>
                          {idx > 0 && <div className="my-1 border-t border-gray-100" />}
                          <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            {group.heading}
                          </div>
                          {group.items.map((item) => {
                            const active = location.pathname === item.path
                            return (
                              <Link
                                key={item.path}
                                to={item.path}
                                role="menuitem"
                                onClick={() => setIsMoreOpen(false)}
                                className={`block px-4 py-2 text-sm transition-colors ${active
                                  ? 'bg-primary-50 text-primary font-medium'
                                  : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                              >
                                {item.name}
                              </Link>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* User Menu — pinned, never shrinks below its natural size so
                wallet/notification/profile are always visible. */}
            <div className="hidden sm:flex sm:items-center flex-shrink-0">
              {/* Wallet - routes to /app/wallet */}
              <Link to="/app/wallet" className="ml-3 relative p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                <span className="sr-only">Open wallet</span>
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 7a2 2 0 012-2h14a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="2" y="10" width="20" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="18" cy="15" r="1.5" fill="currentColor" />
                </svg>
                {balance > 0 && (
                  <span className="absolute -top-1 right-4 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-600 text-white">
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(balance)}
                  </span>
                )}
              </Link>

              {/* Notifications */}
              <button
                type="button"
                onClick={() => setShowNotifications(true)}
                className="relative p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                <span className="sr-only">View notifications</span>
                <svg
                  className="h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>



              {/* Profile Menu */}
              <UserMenu user={user} onLogout={handleLogout} />
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center sm:hidden">
              <button
                type="button"
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <span className="sr-only">Open main menu</span>
                {isMobileMenuOpen ? (
                  <svg
                    className="h-6 w-6"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-6 w-6"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu — same primary + grouped structure as desktop,
              just rendered linearly with section headings instead of a
              dropdown (more usable on phones). */}
          {isMobileMenuOpen && (
            <div className="sm:hidden">
              <div className="pt-2 pb-3 space-y-1">
                {primaryNav.map((item) => (
                  <Link
                    key={item.name}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`${location.pathname === item.path
                      ? 'bg-primary-50 border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
                      } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
                  >
                    {item.name}
                  </Link>
                ))}

                {moreGroups.map((group) => (
                  <div key={group.heading} className="pt-2">
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {group.heading}
                    </div>
                    {group.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`${location.pathname === item.path
                          ? 'bg-primary-50 border-primary text-primary'
                          : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
                          } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
              <div className="pt-4 pb-3 border-t border-gray-200">
                <div className="flex items-center px-4">
                  {user?.avatar ? (
                    <img
                      className="h-10 w-10 rounded-full"
                      src={user?.avatar}
                      alt={user?.name}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary text-white flex items-center justify-center">
                      {user?.name?.charAt(0)}
                    </div>
                  )}
                  <div className="ml-3">
                    <div className="text-base font-medium text-gray-800">
                      {user?.name}
                    </div>
                    <div className="text-sm font-medium text-gray-500">
                      {user?.email}
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Link
                    to="/app/profile"
                    className="block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  >
                    Your Profile
                  </Link>
                  <Link
                    to="/app/wallet"
                    className="block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  >
                    Wallet
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary scope="client page">
          <Outlet />
        </ErrorBoundary>
      </main>
      <NotificationModal open={showNotifications} onClose={() => setShowNotifications(false)} />
      <NotificationToast />
      <VideoCallProvider>
        {/* VideoCallProvider renders its children but also provides video call modals */}
        <></>
      </VideoCallProvider>
    </div>
  )
}

export default AppLayout