import { FC, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { apiEndpoints } from '@/services/api'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock, FileText, MessageSquare, User } from 'lucide-react'
import AgreementModal from '@/components/atoms/AgreementModal'

interface AppointmentResponse {
  data: {
    scheduledAt: string;
    durationMins: number;
    notes: string | null;
    id: string;
    status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
    meetingLink: string | null;
    aggrementUrl: string | null;
    createdAt: string;
    updatedAt: string;
    client: {
        id: string;
        email: string;
        phone: string;
        name: string;
        avatarUrl: string | null;
    };
    lawyer: {
        id: string;
        email: string;
        phone: string;
        name: string;
        avatarUrl: string | null;
    };
    payment: {
        status: string;
        amount: number;
        currency: string;
    } | null;
  }[]
}

type TabType = 'upcoming' | 'missed' | 'attended' | 'cancelled'

const AppointmentsPage: FC = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('upcoming')
  const [selectedAgreementUrl, setSelectedAgreementUrl] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

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
    
    return {
      upcoming: appointments.filter(apt => {
        const scheduledDate = new Date(apt.scheduledAt)
        return (apt.status === 'PENDING' || apt.status === 'CONFIRMED') && scheduledDate >= now
      }),
      missed: appointments.filter(apt => {
        const scheduledDate = new Date(apt.scheduledAt)
        return (apt.status === 'PENDING' || apt.status === 'CONFIRMED') && scheduledDate < now
      }),
      attended: appointments.filter(apt => apt.status === 'COMPLETED'),
      cancelled: appointments.filter(apt => apt.status === 'CANCELLED')
    }
  }, [appointments])

  const handleViewAgreement = (aggrementUrl: string | null) => {
    if (aggrementUrl) {
      setSelectedAgreementUrl(aggrementUrl)
      setIsModalOpen(true)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedAgreementUrl(null)
  }

  const handleDiscuss = (appointmentId: string) => {
    navigate(`/app/chat?appointmentId=${appointmentId}`)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'text-yellow-600'
      case 'CONFIRMED':
        return 'text-blue-600'
      case 'COMPLETED':
        return 'text-green-600'
      case 'CANCELLED':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  const renderAppointmentCard = (appointment: AppointmentResponse['data'][0]) => {
    const otherParty = appointment.lawyer

    return (
      <div 
        key={appointment.id}
        className="border border-gray-200 bg-white p-6 mb-4 hover:border-primary transition-colors"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                {otherParty?.avatarUrl ? (
                  <img 
                    src={otherParty.avatarUrl} 
                    alt={otherParty.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div>
                <h3 className="text-base font-medium text-primary">
                  {otherParty?.name || 'Unknown'}
                </h3>
                <p className="text-sm text-secondary">{otherParty?.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm text-secondary">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(appointment.scheduledAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-secondary">
                <Clock className="w-4 h-4" />
                <span>{formatTime(appointment.scheduledAt)} ({appointment.durationMins} mins)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-secondary">Status:</span>
                <span className={`font-medium ${getStatusColor(appointment.status)}`}>
                  {appointment.status}
                </span>
              </div>
            </div>

            {appointment.notes && (
              <p className="text-sm text-secondary mb-4 line-clamp-2">
                {appointment.notes}
              </p>
            )}

            {appointment.payment && (
              <div className="text-sm text-secondary mb-4">
                Payment: {appointment.payment.currency} {appointment.payment.amount} - 
                <span className={`ml-1 ${appointment.payment.status === 'COMPLETED' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {appointment.payment.status}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => handleViewAgreement(appointment.aggrementUrl)}
            disabled={!appointment.aggrementUrl}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              appointment.aggrementUrl
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <FileText className="w-4 h-4" />
            View Agreement
          </button>
          <button
            onClick={() => handleDiscuss(appointment.id)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Discuss
          </button>
        </div>
      </div>
    )
  }

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: categorizedAppointments.upcoming.length },
    { key: 'missed', label: 'Missed', count: categorizedAppointments.missed.length },
    { key: 'attended', label: 'Attended', count: categorizedAppointments.attended.length },
    { key: 'cancelled', label: 'Cancelled', count: categorizedAppointments.cancelled.length }
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-primary mb-2">Appointments</h1>
          <p className="text-secondary">Manage and track all your appointments</p>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 mb-6">
          <div className="flex gap-0">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-primary'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                <span className="flex items-center gap-2">
                  {tab.label}
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    activeTab === tab.key
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
            <div>
              {categorizedAppointments[activeTab].map(appointment => 
                renderAppointmentCard(appointment)
              )}
            </div>
          )}
        </div>

        {/* Agreement Modal */}
        {selectedAgreementUrl && (
          <AgreementModal
            url={selectedAgreementUrl}
            isOpen={isModalOpen}
            onClose={handleCloseModal}
          />
        )}
      </div>
    </div>
  )
}

export default AppointmentsPage
