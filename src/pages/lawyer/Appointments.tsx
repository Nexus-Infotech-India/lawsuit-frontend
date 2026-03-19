import { FC, useMemo, useState } from 'react'
import { appointmentsApi } from '@/services/api'
import { parseISO, differenceInMinutes, isValid } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import ChatTab from '@/components/atoms/ChatTab'
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

type TabType = 'attendNow' | 'upcoming' | 'missed' | 'attended' | 'cancelled'

const LawyerAppointments: FC = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('attendNow')
  const [openChatId, setOpenChatId] = useState<string | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
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
  const { attendNow, upcoming, attended, missed, cancelled } = useMemo(() => {
    const attendNow: AppointmentResponse['data'] = []
    const upcoming: AppointmentResponse['data'] = []
    const attended: AppointmentResponse['data'] = []
    const missed: AppointmentResponse['data'] = []
    const cancelled: AppointmentResponse['data'] = []

    appointments.forEach((a) => {
      const status = a.status
      // Don't render pending appointments anywhere
      if (status === 'PENDING') return

      const dt = parseISO(a.scheduledAt)
      const validDate = dt && isValid(dt)

      // Cancelled
      if (status === 'CANCELLED') {
        cancelled.push(a)
        return
      }

      // Completed appointments -> Attended tab
      if (status === 'COMPLETED') {
        attended.push(a)
        return
      }

      // Attend Now: scheduled time within a 30-minute window around now
      if (validDate && Math.abs(differenceInMinutes(now, dt)) <= 30) {
        attendNow.push(a)
        return
      }

      // Future -> upcoming
      if (!validDate || dt > now) {
        upcoming.push(a)
        return
      }

      // If more than 30 minutes past scheduled time and not completed -> missed
      if (validDate && differenceInMinutes(now, dt) > 30) {
        missed.push(a)
        return
      }

      // Fallback: treat as missed
      missed.push(a)
    })

    // Sort attendNow by closest time (ascending)
    attendNow.sort((x, y) => parseISO(x.scheduledAt).getTime() - parseISO(y.scheduledAt).getTime())
    upcoming.sort((x, y) => parseISO(x.scheduledAt).getTime() - parseISO(y.scheduledAt).getTime())
    attended.sort((x, y) => parseISO(y.scheduledAt).getTime() - parseISO(x.scheduledAt).getTime())
    missed.sort((x, y) => parseISO(y.scheduledAt).getTime() - parseISO(x.scheduledAt).getTime())

    return { attendNow, upcoming, attended, missed, cancelled }
  }, [appointments, now])

  const openChatForAppointment = async (a: AppointmentResponse['data'][0]) => {
    try {
      const chatModule = await import('@/services/api')
      const chatApi = chatModule.chatApi
      const otherUserId = a.client?.id || ''
      if (!otherUserId) {
        console.warn('No client id for appointment', a.id)
        return
      }
      const r = await chatApi.createChat({ otherUserId })
      const chat = (r as any).data?.chat ?? (r as any).chat
      if (chat && chat.id) {
        setOpenChatId(chat.id)
        setIsChatOpen(true)
      }
    } catch (err) {
      console.error('Failed to open chat', err)
    }
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

        {/* Chat modal */}
        {isChatOpen && openChatId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-4xl h-[80vh]">
              <ChatTab chatId={openChatId} onClose={() => { setIsChatOpen(false); setOpenChatId(null) }} />
            </div>
          </div>
        )}

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