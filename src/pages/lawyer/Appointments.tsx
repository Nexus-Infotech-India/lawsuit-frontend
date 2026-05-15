import { FC, useMemo, useState } from 'react'
import { appointmentsApi } from '@/services/api'
import { parseISO, isValid } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import CreateCaseDetail from '@/components/molecules/CreateCaseDetail'
import { useMutation, useQuery } from '@tanstack/react-query'
import api, { apiEndpoints } from '@/services/api'
import { Upload, X } from 'lucide-react'
import AgreementModal from '@/components/atoms/AgreementModal'
import UploadInput from '@/components/atoms/UploadButton'
import { UpdateAgreementUrlInput } from '@/schema/appointment.schema'
import RescheduleModal from '@/components/molecules/RescheduleModal'
import RenderAppointmentCard, { AppointmentData } from './RenderAppointmentCard'

interface AppointmentResponse {
  data: AppointmentData[]
}

type TabType = 'pending' | 'attendNow' | 'upcoming' | 'missed' | 'attended' | 'cancelled'

const LawyerAppointments: FC = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [selectedAppointmentForCase, setSelectedAppointmentForCase] = useState<AppointmentResponse['data'][0] | null>(null)
  const [selectedAgreementUrl, setSelectedAgreementUrl] = useState<{ appointmentId: string, aggrementUrl: string | null } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedAppointmentForUpload, setSelectedAppointmentForUpload] = useState<AppointmentResponse['data'][0] | null>(null)
  const [uploadImageUrl, setUploadImageUrl] = useState<string | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentData | null>(null)

  const getAppointmentsQuery = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const res = await api.get<AppointmentResponse>(apiEndpoints.appointment.getAll)
      return res.data
    }
  })

  // Create case mutation
  const createCaseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post(apiEndpoints.case.createCaseByLawyer, data.body)
      return res.data
    },
    onSuccess: () => {
      alert('Case created successfully!')
      setSelectedAppointmentForCase(null)
    },
    onError: (error: any) => {
      console.error('Failed to create case:', error)
      alert('Failed to create case. Please try again.')
    }
  })

  // Update agreement mutation
  const updateAgreementMutation = useMutation({
    mutationFn: async (data: UpdateAgreementUrlInput) => {
      const res = await api.post(apiEndpoints.agreement.updateAgreement, data.body)
      return res.data
    },
    onSuccess: () => {
      alert('Agreement uploaded successfully!')
      setUploadModalOpen(false)
      setSelectedAppointmentForUpload(null)
      setUploadImageUrl(null)
      getAppointmentsQuery.refetch()
    },
    onError: (error: any) => {
      console.error('Failed to upload agreement:', error)
      alert('Failed to upload agreement. Please try again.')
    }
  })

  const appointments = getAppointmentsQuery.data?.data || []

  const now = new Date()

  // Classify appointments
  //
  // Categorisation rules (must stay in sync with the client AppointmentsPage):
  //   - "Pending":   PENDING status AND the slot end (scheduledAt + durationMins)
  //                  is still in the future. A pending booking whose time has
  //                  already passed falls into Missed — the lawyer never got
  //                  around to accepting it and the slot is gone.
  //   - "Attend now": CONFIRMED AND we're inside the meeting window (scheduled
  //                  time has started but not ended). Surfaced separately so the
  //                  lawyer can jump straight to the call.
  //   - "Upcoming":  PENDING/CONFIRMED AND scheduledAt is still in the future.
  //   - "Missed":    PENDING/CONFIRMED AND the slot end has fully passed.
  //   - "Attended":  status COMPLETED.
  //   - "Cancelled": status CANCELLED.
  //
  // Sort order: all lists are sorted descending by scheduledAt so the most
  // recent appointment activity shows first, except `attendNow` which sorts
  // ascending (the slot starting soonest is most urgent for the lawyer).
  const { pending, attendNow, upcoming, attended, missed, cancelled } = useMemo(() => {
    const pending: AppointmentResponse['data'] = []
    const attendNow: AppointmentResponse['data'] = []
    const upcoming: AppointmentResponse['data'] = []
    const attended: AppointmentResponse['data'] = []
    const missed: AppointmentResponse['data'] = []
    const cancelled: AppointmentResponse['data'] = []

    const endOf = (apt: AppointmentData): number => {
      const start = parseISO(apt.scheduledAt).getTime()
      return start + ((apt.durationMins || 30) * 60 * 1000)
    }
    const nowMs = now.getTime()

    appointments.forEach((a) => {
      const status = a.status
      const dt = parseISO(a.scheduledAt)
      const validDate = dt && isValid(dt)
      const slotEnd = validDate ? endOf(a) : Infinity
      const slotPast = validDate && slotEnd <= nowMs

      // Cancelled — status check is sufficient.
      if (status === 'CANCELLED') {
        cancelled.push(a)
        return
      }

      // Completed → Attended.
      if (status === 'COMPLETED') {
        attended.push(a)
        return
      }

      // Past-time guard applies BEFORE the PENDING short-circuit. A pending
      // booking with a scheduledAt in the past must move to Missed — the
      // lawyer can no longer accept and run a slot that's already over.
      if (slotPast && (status === 'PENDING' || status === 'CONFIRMED')) {
        missed.push(a)
        return
      }

      // Still-pending request (lawyer hasn't accepted yet) for a future slot.
      if (status === 'PENDING') {
        pending.push(a)
        return
      }

      // Inside the meeting window (started, not ended) → Attend now.
      if (validDate && nowMs >= dt.getTime() && nowMs < slotEnd) {
        attendNow.push(a)
        return
      }

      // Future and confirmed → upcoming.
      upcoming.push(a)
    })

    // Sort: most recently created first everywhere except attendNow.
    // We sort by `createdAt` (when the booking was placed) rather than
    // `scheduledAt` (the future date of the slot) so the lawyer sees
    // brand-new booking requests at the top of every list — that's what
    // "latest appointments first" means in user terms. `scheduledAt` would
    // surface the appointment furthest in the future first, which is the
    // opposite of what's useful.
    // AttendNow stays ASC by scheduledAt so the slot starting soonest is
    // most actionable (most urgent → top).
    const recentFirst = (x: AppointmentData, y: AppointmentData) =>
      new Date(y.createdAt || y.scheduledAt).getTime() -
      new Date(x.createdAt || x.scheduledAt).getTime()
    const soonestFirst = (x: AppointmentData, y: AppointmentData) =>
      parseISO(x.scheduledAt).getTime() - parseISO(y.scheduledAt).getTime()
    pending.sort(recentFirst)
    attendNow.sort(soonestFirst)
    upcoming.sort(recentFirst)
    attended.sort(recentFirst)
    missed.sort(recentFirst)
    cancelled.sort(recentFirst)

    return { pending, attendNow, upcoming, attended, missed, cancelled }
  }, [appointments, now])

  // "Discuss" on an appointment row now deep-links into the unified
  // /lawyer/chats page using the appointmentId — the page hits the
  // dedicated /chat/appointment/:id endpoint that idempotently creates
  // the conversation, so we don't need to call chatApi.createChat here.
  const openChatForAppointment = (a: AppointmentResponse['data'][0]) => {
    if (!a.client?.id) {
      console.warn('No client id for appointment', a.id)
      return
    }
    navigate(`/lawyer/chats?appointmentId=${a.id}`)
  }

  const openCaseCreationForAppointment = (a: AppointmentResponse['data'][0]) => {
    if (!a.client?.id) {
      alert('No client information available for this appointment')
      return
    }
    setSelectedAppointmentForCase(a)
  }

  const handleViewAgreement = ({ appointmentId, aggrementUrl }: { appointmentId: string, aggrementUrl: string | null }) => {
    if (aggrementUrl) {
      setSelectedAgreementUrl({ appointmentId, aggrementUrl })
      setIsModalOpen(true)
    }
  }

  const handleUploadAgreement = (appointment: AppointmentResponse['data'][0]) => {
    setSelectedAppointmentForUpload(appointment)
    setUploadModalOpen(true)
  }

  const handleSubmitUpload = () => {
    if (!uploadImageUrl || !selectedAppointmentForUpload) {
      alert('Please upload an agreement file before submitting.')
      return
    }
    updateAgreementMutation.mutate({
      body: {
        appointmentId: selectedAppointmentForUpload.id,
        agreementUrl: uploadImageUrl
      }
    })
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedAgreementUrl(null)
  }

  const handleAccept = async (appointment: AppointmentResponse['data'][0]) => {
    try {
      await api.post(`/appointments/${appointment.id}/accept`)
      getAppointmentsQuery.refetch()
      alert('Appointment accepted successfully!')
    } catch (err: any) {
      console.error('Failed to accept appointment', err)
      alert(err.response?.data?.error || 'Failed to accept appointment. Please try again.')
    }
  }

  const handleReject = async (appointment: AppointmentResponse['data'][0]) => {
    if (!confirm(`Are you sure you want to reject the appointment with ${appointment.client?.name}?`)) return
    try {
      await api.post(`/appointments/${appointment.id}/reject`)
      getAppointmentsQuery.refetch()
      alert('Appointment rejected.')
    } catch (err: any) {
      console.error('Failed to reject appointment', err)
      alert(err.response?.data?.error || 'Failed to reject appointment. Please try again.')
    }
  }

  const handleAttend = async (appointment: AppointmentResponse['data'][0]) => {
    try {
      await appointmentsApi.attend(appointment.id)
      getAppointmentsQuery.refetch()
      navigate(`/lawyer/consultation/${appointment.id}`)
    } catch (err) {
      console.error('Failed to mark attended', err)
      alert('Failed to start video call. Please try again.')
    }
  }

  const handleReschedule = (appointment: AppointmentResponse['data'][0]) => {
    setRescheduleTarget(appointment)
  }

  const handleConfirmReschedule = async (scheduledAt: string, durationMins?: number) => {
    if (!rescheduleTarget) return
    await appointmentsApi.reschedule(rescheduleTarget.id, scheduledAt, durationMins)
    getAppointmentsQuery.refetch()
  }

  const handleCancel = async (appointment: AppointmentResponse['data'][0]) => {
    if (confirm(`Are you sure you want to cancel the appointment with ${appointment.client?.name}?`)) {
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

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pending.length },
    { key: 'attendNow', label: 'Attend Now', count: attendNow.length },
    { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
    { key: 'missed', label: 'Missed', count: missed.length },
    { key: 'attended', label: 'Attended', count: attended.length },
    { key: 'cancelled', label: 'Cancelled', count: cancelled.length }
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-primary mb-2">My Appointments</h1>
          <p className="text-secondary">Manage and track all your appointments</p>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 mb-6">
          <div className="flex gap-0">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-4 text-sm font-medium transition-colors relative ${activeTab === tab.key
                  ? 'text-primary'
                  : 'text-secondary hover:text-primary'
                  }`}
              >
                <span className="flex items-center gap-2">
                  {tab.label}
                  <span className={`px-2 py-0.5 text-xs rounded-full ${activeTab === tab.key
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
          ) : (
            <div>
              {activeTab === 'pending' && (
                <>
                  {pending.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-secondary">No pending appointment requests</p>
                    </div>
                  ) : (
                    <div>
                      {/* Pending appointments now reuse the full
                          RenderAppointmentCard so the lawyer sees the
                          client's issue description AND any uploaded
                          documents (with OCR/extract via
                          AppointmentDocumentsPanel) BEFORE choosing
                          accept/reject. The card's PENDING-status branch
                          renders Accept/Reject inline; reject hits the
                          server's auto-refund path so the client's wallet
                          is credited the moment the lawyer declines.
                          See consultation.service.ts::rejectAppointment. */}
                      {pending.map(appointment =>
                        <RenderAppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          tabType="pending"
                          onAttend={handleAttend}
                          onViewAgreement={handleViewAgreement}
                          onUploadAgreement={handleUploadAgreement}
                          onOpenChat={openChatForAppointment}
                          onOpenCaseCreation={openCaseCreationForAppointment}
                          onChanged={() => getAppointmentsQuery.refetch()}
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'attendNow' && (
                <>
                  {attendNow.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-secondary">No appointments to attend now</p>
                    </div>
                  ) : (
                    <div>
                      {attendNow.map(appointment =>
                        <RenderAppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          showAttendButton={true}
                          tabType="attendNow"
                          onAttend={handleAttend}
                          onViewAgreement={handleViewAgreement}
                          onUploadAgreement={handleUploadAgreement}
                          onOpenChat={openChatForAppointment}
                          onOpenCaseCreation={openCaseCreationForAppointment}
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'upcoming' && (
                <>
                  {upcoming.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-secondary">No upcoming appointments</p>
                    </div>
                  ) : (
                    <div>
                      {upcoming.map(appointment =>
                        <RenderAppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          tabType="upcoming"
                          onAttend={handleAttend}
                          onViewAgreement={handleViewAgreement}
                          onUploadAgreement={handleUploadAgreement}
                          onOpenChat={openChatForAppointment}
                          onOpenCaseCreation={openCaseCreationForAppointment}
                          onReschedule={handleReschedule}
                          onCancel={handleCancel}
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'missed' && (
                <>
                  {missed.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-secondary">No missed appointments</p>
                    </div>
                  ) : (
                    <div>
                      {missed.map(appointment =>
                        <RenderAppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          tabType="missed"
                          onAttend={handleAttend}
                          onViewAgreement={handleViewAgreement}
                          onUploadAgreement={handleUploadAgreement}
                          onOpenChat={openChatForAppointment}
                          onOpenCaseCreation={openCaseCreationForAppointment}
                          onReschedule={handleReschedule}
                          onCancel={handleCancel}
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'attended' && (
                <>
                  {attended.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-secondary">No attended appointments</p>
                    </div>
                  ) : (
                    <div>
                      {attended.map(appointment =>
                        <RenderAppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          tabType="attended"
                          onAttend={handleAttend}
                          onViewAgreement={handleViewAgreement}
                          onUploadAgreement={handleUploadAgreement}
                          onOpenChat={openChatForAppointment}
                          onOpenCaseCreation={openCaseCreationForAppointment}
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'cancelled' && (
                <>
                  {cancelled.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-secondary">No cancelled appointments</p>
                    </div>
                  ) : (
                    <div>
                      {cancelled.map(appointment =>
                        <RenderAppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          tabType="cancelled"
                          onAttend={handleAttend}
                          onViewAgreement={handleViewAgreement}
                          onUploadAgreement={handleUploadAgreement}
                          onOpenChat={openChatForAppointment}
                          onOpenCaseCreation={openCaseCreationForAppointment}
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Agreement Modal */}
        {selectedAgreementUrl ? selectedAgreementUrl.aggrementUrl ? (
          <AgreementModal
            appointment={selectedAgreementUrl as { appointmentId: string, aggrementUrl: string }}
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            canApply={false}
          />
        ) : null : (
          <></>
        )}

        {/* Discuss now navigates to /lawyer/chats — see openChatForAppointment. */}

        {/* Create Case Modal */}
        {selectedAppointmentForCase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <CreateCaseDetail
              clientId={selectedAppointmentForCase.client?.id || ''}
              appointmentId={selectedAppointmentForCase.id}
              mutation={createCaseMutation}
              onClose={() => setSelectedAppointmentForCase(null)}
            />
          </div>
        )}

        {/* Upload Agreement Modal */}
        {uploadModalOpen && selectedAppointmentForUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl p-6 min-w-[500px] w-full max-w-lg mx-auto border border-gray-200">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Upload Agreement</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Appointment with {selectedAppointmentForUpload.client?.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setUploadModalOpen(false)
                    setSelectedAppointmentForUpload(null)
                    setUploadImageUrl(null)
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6">
                <UploadInput imageUrl={uploadImageUrl} setImageUrl={setUploadImageUrl} />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setUploadModalOpen(false)
                    setSelectedAppointmentForUpload(null)
                    setUploadImageUrl(null)
                  }}
                  className="flex-1 px-4 py-2.5 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-gray-300 transition-colors duration-200 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitUpload}
                  disabled={!uploadImageUrl || updateAgreementMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-primary text-white hover:bg-primary/90 disabled:bg-primary/30 disabled:cursor-not-allowed rounded-lg transition-colors duration-200 text-sm font-medium flex items-center justify-center gap-2"
                >
                  {updateAgreementMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload Agreement
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reschedule Modal */}
        {rescheduleTarget && (
          <RescheduleModal
            isOpen={!!rescheduleTarget}
            onClose={() => setRescheduleTarget(null)}
            onConfirm={handleConfirmReschedule}
            otherPartyName={rescheduleTarget.client?.name || 'Client'}
            currentScheduledAt={rescheduleTarget.scheduledAt}
            currentDurationMins={rescheduleTarget.durationMins || 30}
          />
        )}
      </div>
    </div>
  )
}

export default LawyerAppointments