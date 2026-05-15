import { FC, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import NotificationModal from '../components/molecules/NotificationModal'
import NotificationToast from '../components/atoms/NotificationToast'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { useNotificationSocket } from '../hooks/useNotificationSocket'
import { useOrganizationStore } from '../stores/organizationStore'
import UserMenu from '../components/molecules/UserMenu'
import ErrorBoundary from '../components/organisms/ErrorBoundary'
import BrandLogo from '../components/atoms/BrandLogo'

/**
 * Layout for ORGANIZATION (law-firm) users.
 *
 * Behaviour:
 * - Always boots the notification socket (ORG users get appointment-request notifications).
 * - When the org is not yet verified, the nav surfaces the onboarding/verification entry
 *   point first; the dashboard tabs still work (so the org can preview them).
 */
const OrganizationLayout: FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const me = useOrganizationStore((s) => s.me)
  const fetchMe = useOrganizationStore((s) => s.fetchMe)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const [showNotifications, setShowNotifications] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useNotificationSocket()

  useEffect(() => {
    fetchMe().catch(() => { })
  }, [fetchMe])

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  const isVerified = me?.isVerified === true

  /**
   * Same lean-nav pattern as `AppLayout` / `LawyerLayout`:
   *  - 5 primary items the org head uses every day
   *  - The 2 secondary items (My Salary, Verification) under a "More" dropdown
   *
   * Note: the amber "Verification pending — complete now" pill on the right
   * side still renders independently when `isVerified === false`, so demoting
   * Verification into "More" does NOT hide the prompt for unverified orgs.
   */
  const primaryNav = [
    { name: 'Dashboard', path: '/organization/dashboard' },
    { name: 'Lawyers', path: '/organization/lawyers' },
    { name: 'Requests', path: '/organization/requests' },
    { name: 'Salary', path: '/organization/salary' },
    { name: 'Profile', path: '/organization/profile' },
  ]

  const moreGroups: { heading: string; items: { name: string; path: string }[] }[] = [
    {
      heading: 'AI Tools',
      // Same Legal Eagle / Document AI surface the client + lawyer layouts
      // get. The server endpoint `/model/chat` is open to every authenticated
      // role, it just wasn't wired into the org nav before. Document AI is
      // already routed under /organization/document-ai for chat doc deep-
      // links; this exposes it (and Legal Eagle) in the sidebar.
      items: [
        { name: 'Legal Eagle', path: '/organization/legal-eagle' },
        { name: 'Document AI', path: '/organization/document-ai' },
      ],
    },
    {
      heading: 'Earnings',
      items: [{ name: 'My Salary', path: '/organization/my-salary' }],
    },
    {
      heading: 'Compliance',
      items: [{ name: 'Verification', path: '/organization/verification' }],
    },
  ]

  const allMoreItems = moreGroups.flatMap((g) => g.items)
  // Kept for the mobile menu fallback if anything still wants a flat list.
  const navigation = [...primaryNav, ...allMoreItems]
  void navigation
  const isMoreActive = allMoreItems.some((i) => location.pathname === i.path)

  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!isMoreOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setIsMoreOpen(false)
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
  useEffect(() => {
    setIsMoreOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow relative z-50">
        {/* Full-width nav so all items + right-side controls fit on standard
            laptop screens. See AppLayout for rationale. */}
        <div className="max-w-full px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-16 gap-3">
            <div className="flex items-center min-w-0 flex-1">
              {/* Brand — NyayaX with the org subtitle so users can tell at
                  a glance which surface they're on. */}
              <div className="flex-shrink-0 flex items-center">
                <BrandLogo to="/organization/dashboard" subtitle="Org" />
              </div>
              <div className="hidden sm:flex sm:items-center sm:ml-3 lg:ml-6 sm:space-x-4 md:space-x-6 lg:space-x-7 min-w-0 flex-1">
                {primaryNav.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.path}
                    className={({ isActive }) =>
                      `${isActive
                        ? 'border-primary text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium flex-shrink-0`
                    }
                  >
                    {item.name}
                  </NavLink>
                ))}

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
                    <ChevronDown className={`w-4 h-4 transition-transform ${isMoreOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isMoreOpen && (
                    <div
                      role="menu"
                      className="absolute left-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg ring-1 ring-black/5 py-2 z-50"
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

            <div className="hidden sm:flex sm:items-center gap-4 flex-shrink-0">
              {!isVerified && (
                <Link
                  to="/organization/verification"
                  className="text-xs px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200"
                >
                  Verification pending — complete now
                </Link>
              )}

              <button
                type="button"
                onClick={() => setShowNotifications(true)}
                className="relative p-1 rounded-full text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              <UserMenu user={user} onLogout={handleLogout} />
            </div>

            <div className="flex items-center sm:hidden">
              <button
                type="button"
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                onClick={() => setIsMobileMenuOpen((s) => !s)}
              >
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          {isMobileMenuOpen && (
            <div className="sm:hidden pb-3 space-y-1">
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

              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary scope="organization page">
          <Outlet />
        </ErrorBoundary>
      </main>
      <NotificationModal open={showNotifications} onClose={() => setShowNotifications(false)} />
      <NotificationToast />
    </div>
  )
}

export default OrganizationLayout
