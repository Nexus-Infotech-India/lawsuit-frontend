import { FC, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { apiEndpoints, appointmentsApi } from '@/services/api'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, User } from 'lucide-react'
import AgreementModal from '@/components/atoms/AgreementModal'
import RescheduleModal from '@/components/molecules/RescheduleModal'
import RenderAppointmentCard, { AppointmentData } from './RenderAppointmentCard'
// Firm-appointments view is rendered INLINE from the legacy
// `MyFirmRequestsPage` component. We keep that component intact so the
// org-side request flow it implements (Razorpay re-checkout, cancel, etc.)
// doesn't have to be duplicated here.
import MyFirmRequestsPage from './firms/MyFirmRequestsPage'

interface AppointmentResponse {
  data: AppointmentData[]
}

type TabType = 'upcoming' | 'missed' | 'attended' | 'cancelled'

/**
 * Two top-level views on this page:
 *   - 'lawyer' (default) — direct lawyer bookings, status sub-tabs
 *   - 'firm'   — your firm-routed requests (renders MyFirmRequestsPage)
 * State is persisted in the URL (`?view=firm`) so a deep-link or refresh
 * lands on the same tab, AND so the existing `/app/firms-requests`
 * redirect can preserve intent by sending users to `?view=firm`.
 */
type ViewMode = 'lawyer' | 'firm'

const AppointmentsPage: FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const view: ViewMode = searchParams.get('view') === 'firm' ? 'firm' : 'lawyer'
  const switchView = (next: ViewMode) => {
    const sp = new URLSearchParams(searchParams)
    if (next === 'firm') sp.set('view', 'firm')
    else sp.delete('view')
    setSearchParams(sp, { replace: true })
  }
  const [activeTab, setActiveTab] = useState<TabType>('upcoming')
  const [selectedAgreementUrl, setSelectedAgreementUrl] = useState<{ appointmentId: string, aggrementUrl: string | null } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentData | null>(null)

  const getAppointmentsQuery = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const res = await api.get<AppointmentResponse>(apiEndpoints.appointment.getAll)
      return res.data
    }
  })

  const appointments = getAppointmentsQuery.data?.data || []

  const categorizedAppointments = useMemo(() => {
    const now = new Date()
    /*
     * Categorisation rules (matching user-facing expectations):
     *  - "Upcoming" = strictly future appointments (scheduledAt > now) that
     *    are PENDING/CONFIRMED. Previously this used the END time which made
     *    in-progress meetings look "upcoming" even though their scheduled time
     *    had already passed.
     *  - "In progress" rolls up into Upcoming (so the user can still find the
     *    Join button), with a separate Live badge surfaced from the card.
     *  - "Missed" = scheduled time has fully passed AND the meeting was never
     *    marked completed (status still PENDING/CONFIRMED).
     *  - "Attended" requires BOTH status=COMPLETED AND scheduledAt < now, so a
     *    future-dated row erroneously marked COMPLETED in the DB no longer
     *    pollutes this tab.
     *  - "Cancelled" — status check is sufficient.
     */
    const endOf = (apt: AppointmentData) => {
      const start = new Date(apt.scheduledAt).getTime()
      return new Date(start + (apt.durationMins || 30) * 60 * 1000)
    }
    // Most recently BOOKED first — `createdAt` so a brand-new request
    // jumps to the top regardless of how far in the future its slot is.
    // Falls back to scheduledAt for older rows that might not have
    // createdAt populated (shouldn't happen on modern data, but defensive).
    const recentFirst = (a: AppointmentData, b: AppointmentData) =>
      new Date(b.createdAt || b.scheduledAt).getTime() -
      new Date(a.createdAt || a.scheduledAt).getTime()
    return {
      upcoming: appointments
        .filter(apt => {
          const scheduled = new Date(apt.scheduledAt)
          return (
            (apt.status === 'PENDING' || apt.status === 'CONFIRMED') &&
            // Still "upcoming" while either the start is in the future OR the
            // meeting window hasn't closed yet. This keeps a live meeting
            // reachable without dragging long-past meetings into the tab.
            now < endOf(apt) && (scheduled > now || now < endOf(apt))
          )
        })
        .sort(recentFirst),
      missed: appointments
        .filter(apt => {
          return (
            (apt.status === 'PENDING' || apt.status === 'CONFIRMED') &&
            now >= endOf(apt)
          )
        })
        .sort(recentFirst),
      attended: appointments
        .filter(apt => {
          return (
            apt.status === 'COMPLETED' &&
            // Sanity gate: a COMPLETED row with a future scheduledAt is a
            // server-side data anomaly — don't show it as "attended" until the
            // scheduled time has actually elapsed.
            new Date(apt.scheduledAt) <= now
          )
        })
        .sort(recentFirst),
      cancelled: appointments
        .filter(apt => apt.status === 'CANCELLED')
        .sort(recentFirst),
    }
  }, [appointments])

  const handleViewAgreement = ({ appointmentId, aggrementUrl }: { appointmentId: string, aggrementUrl: string | null }) => {
    if (aggrementUrl) {
      setSelectedAgreementUrl({ appointmentId, aggrementUrl })
      setIsModalOpen(true)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedAgreementUrl(null)
  }

  // Route into the unified WhatsApp-style chat page. The list page hits
  // /chat/appointment/:id to idempotently materialize the conversation row.
  const handleDiscuss = (appointmentId: string) => {
    navigate(`/app/chats?appointmentId=${appointmentId}`)
  }

  const handleReschedule = (appointment: AppointmentData) => {
    setRescheduleTarget(appointment)
  }

  const handleConfirmReschedule = async (scheduledAt: string, durationMins?: number) => {
    if (!rescheduleTarget) return
    await appointmentsApi.reschedule(rescheduleTarget.id, scheduledAt, durationMins)
    getAppointmentsQuery.refetch()
  }

  const handleCancel = async (appointment: AppointmentData) => {
    if (confirm(`Are you sure you want to cancel the appointment with ${appointment.lawyer?.name}?`)) {
      try {
        await appointmentsApi.cancel(appointment.id)
        getAppointmentsQuery.refetch()
        alert('Appointment cancelled successfully')
      } catch (err) {
        console.error('Failed to cancel appointment', err)
        alert('Failed to cancel appointment. Please try again.')
      }
    }
  }

  const handleVideoCall = async (appointment: AppointmentData) => {
    try {
      await appointmentsApi.attend(appointment.id)
      getAppointmentsQuery.refetch()
      navigate(`/app/consultation/${appointment.id}`)
    } catch (error) {
      console.error('Failed to mark attendance', error)
      alert('Failed to start video call. Please try again.')
    }
  }

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: categorizedAppointments.upcoming.length },
    { key: 'missed', label: 'Missed', count: categorizedAppointments.missed.length },
    { key: 'attended', label: 'Attended', count: categorizedAppointments.attended.length },
    { key: 'cancelled', label: 'Cancelled', count: categorizedAppointments.cancelled.length }
  ]

  return (
    <div className="min-h-screen bg-gray-50 px-3 py-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-primary mb-1 sm:mb-2">Appointments</h1>
          <p className="text-sm sm:text-base text-secondary">
            {view === 'firm'
              ? 'Consultations routed through law firms.'
              : 'Manage and track all your direct lawyer appointments.'}
          </p>
        </div>

        {/* Top-level view switch — Lawyer appointments vs Firm appointments.
            Two distinct surfaces sharing the same page so users have a single
            "Appointments" entry in the nav for both flows. */}
        <div className="mb-4 sm:mb-6 inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => switchView('lawyer')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition ${
              view === 'lawyer'
                ? 'bg-primary text-white shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-pressed={view === 'lawyer'}
          >
            <User className="w-4 h-4" />
            Lawyer appointments
          </button>
          <button
            type="button"
            onClick={() => switchView('firm')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition ${
              view === 'firm'
                ? 'bg-primary text-white shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-pressed={view === 'firm'}
          >
            <Briefcase className="w-4 h-4" />
            Firm appointments
          </button>
        </div>

        {/* Firm view delegates to the legacy MyFirmRequestsPage —
            don't render the status-tabs below in this mode. */}
        {view === 'firm' && (
          <div className="bg-white rounded-xl border border-gray-100 p-2 sm:p-4">
            <MyFirmRequestsPage />
          </div>
        )}

        {/* Tabs + content — horizontal scroll on mobile */}
        {view === 'lawyer' && (<>
        <div className="bg-white border-b border-gray-200 mb-4 sm:mb-6 -mx-3 sm:mx-0 overflow-x-auto">
          <div className="flex min-w-max sm:min-w-0">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === tab.key
                  ? 'text-primary'
                  : 'text-secondary hover:text-primary'
                  }`}
              >
                <span className="flex items-center gap-1.5 sm:gap-2">
                  {tab.label}
                  <span className={`px-1.5 sm:px-2 py-0.5 text-xs rounded-full ${activeTab === tab.key
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600'
                    }`}>
                    {tab.count}
                  </span>
                </span>
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="bg-gray-50">
          {getAppointmentsQuery.isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-secondary">Loading appointments...</p>
            </div>
          ) : getAppointmentsQuery.isError ? (
            <div className="text-center py-12">
              <p className="text-red-600">Failed to load appointments</p>
            </div>
          ) : categorizedAppointments[activeTab].length === 0 ? (
            <div className="text-center py-12">
              <p className="text-secondary">No {activeTab} appointments</p>
            </div>
          ) : (
            <div className="space-y-4">
              {categorizedAppointments[activeTab].map(appointment =>
                <RenderAppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  tabType={activeTab}
                  onViewAgreement={handleViewAgreement}
                  onReschedule={handleReschedule}
                  onCancel={handleCancel}
                  onVideoCall={handleVideoCall}
                  userRole="client"
                />
              )}
            </div>
          )}
        </div>
        </>)}

        {/* Agreement Modal */}
        {selectedAgreementUrl ? selectedAgreementUrl.aggrementUrl ? (
          <AgreementModal
            appointment={selectedAgreementUrl as { appointmentId: string, aggrementUrl: string }}
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            canApply={true}
          />
        ) : null : (
          <></>
        )
        }

        {/* Reschedule Modal */}
        {rescheduleTarget && (
          <RescheduleModal
            isOpen={!!rescheduleTarget}
            onClose={() => setRescheduleTarget(null)}
            onConfirm={handleConfirmReschedule}
            otherPartyName={rescheduleTarget.lawyer?.name || 'Lawyer'}
            currentScheduledAt={rescheduleTarget.scheduledAt}
            currentDurationMins={rescheduleTarget.durationMins || 30}
          />
        )}
      </div>
    </div>
  )
}

export default AppointmentsPage
