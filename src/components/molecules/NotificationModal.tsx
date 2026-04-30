import { FC, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore } from '@/stores/notificationStore'
import { useAuthStore } from '@/stores/authStore'
import NotificationItem from '@/components/atoms/NotificationItem'
import { useOrganizationStore } from '@/stores/organizationStore'
import { startOrgRequestRazorpayCheckout } from '@/services/orgPaymentFlow'
import type { Notification } from '@/types'

const NotificationModal: FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const navigate = useNavigate()
  const {
    notifications,
    fetchNotifications,
    fetchNextPage,
    markRead,
    markAllRead,
    deleteNotification,
    isLoading,
    hasMore,
    unreadCount,
  } = useNotificationStore()

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open])

  // Infinite scroll inside the panel
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      fetchNextPage()
    }
  }, [fetchNextPage])

  // Navigate based on notification type/data
  const handleNotificationClick = async (n: Notification) => {
    const { data, type } = n

    // ── Organization (law-firm) flow ────────────────────────────────
    if (type === 'ORGANIZATION_VERIFIED') {
      navigate('/organization/dashboard')
      onClose()
      return
    }
    if (type === 'ORGANIZATION_REJECTED') {
      navigate('/organization/verification')
      onClose()
      return
    }
    if (type === 'ORG_APPOINTMENT_REQUEST_RECEIVED') {
      navigate('/organization/requests')
      onClose()
      return
    }
    if (type === 'ORG_APPOINTMENT_REQUEST_REJECTED') {
      navigate('/app/firms-requests')
      onClose()
      return
    }
    if (type === 'ORG_APPOINTMENT_REQUEST_ASSIGNED') {
      // Fetch the request, find the matching one (by id) so we can open Razorpay.
      try {
        await useOrganizationStore.getState().fetchMyRequests()
        const requestId = data.requestId
        const req = useOrganizationStore.getState().myRequests.find((r) => r.id === requestId)
        const user = useAuthStore.getState().user
        if (req) {
          await startOrgRequestRazorpayCheckout({
            request: req,
            prefill: {
              name: user?.name,
              email: (user as any)?.email,
              contact: String((user as any)?.phone ?? ''),
            },
            onSuccess: () => {
              useOrganizationStore.getState().fetchMyRequests().catch(() => { })
            },
          })
        } else {
          // Fall back to navigation if we can't find the request
          navigate('/app/firms-requests')
        }
      } catch {
        navigate('/app/firms-requests')
      }
      onClose()
      return
    }

    // ── Existing flows ──────────────────────────────────────────────
    if (type === 'NEW_MESSAGE' && data.chatId) {
      navigate(`/app/chat/${data.chatId}`)
    } else if (data.appointmentId) {
      navigate(`/app/appointments`)
    } else if (data.caseId) {
      navigate(`/app/cases/${data.caseId}`)
    }
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Side panel */}
      <aside className="w-full max-w-md bg-white shadow-xl border-l animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                className="text-sm text-primary hover:underline"
                onClick={() => markAllRead()}
              >
                Mark all read
              </button>
            )}
            <button
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
              onClick={onClose}
              aria-label="Close notifications"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-2 py-2 space-y-1"
          onScroll={handleScroll}
        >
          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-16 h-16 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm">No notifications yet</p>
            </div>
          )}

          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onMarkRead={markRead}
              onDelete={deleteNotification}
              onClick={handleNotificationClick}
            />
          ))}

          {isLoading && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!hasMore && notifications.length > 0 && (
            <p className="text-center text-xs text-gray-400 py-3">You're all caught up</p>
          )}
        </div>
      </aside>
    </div>
  )
}

export default NotificationModal
