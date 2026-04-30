import { FC, useEffect, useState } from 'react'
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import NotificationModal from '../components/molecules/NotificationModal'
import NotificationToast from '../components/atoms/NotificationToast'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { useNotificationSocket } from '../hooks/useNotificationSocket'
import { useOrganizationStore } from '../stores/organizationStore'
import UserMenu from '../components/molecules/UserMenu'

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

  const navigation = [
    { name: 'Dashboard', path: '/organization/dashboard' },
    { name: 'Lawyers', path: '/organization/lawyers' },
    { name: 'Requests', path: '/organization/requests' },
    { name: 'Profile', path: '/organization/profile' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow relative z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link to="/organization/dashboard">
                  <h1 className="text-2xl font-bold text-primary">Lawsuit · Org</h1>
                </Link>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.path}
                    className={({ isActive }) =>
                      `${isActive
                        ? 'border-primary text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`
                    }
                  >
                    {item.name}
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="hidden sm:ml-6 sm:flex sm:items-center gap-4">
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
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`${location.pathname === item.path
                    ? 'bg-primary-50 border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
                    } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
                >
                  {item.name}
                </Link>
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
        <Outlet />
      </main>
      <NotificationModal open={showNotifications} onClose={() => setShowNotifications(false)} />
      <NotificationToast />
    </div>
  )
}

export default OrganizationLayout
