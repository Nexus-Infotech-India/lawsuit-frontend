import { FC, useMemo, useState } from 'react'
import { Calendar, Clock, FileText, MessageSquare, User, RefreshCw, XCircle, Video, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import AppointmentDiscussionPanel from '@/components/organisms/AppointmentDiscussionPanel'
import AppointmentDocumentsPanel from '@/components/molecules/AppointmentDocumentsPanel'

interface AppointmentData {
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
  case?: {
    id: string;
    status: string;
  } | null;
}

type TabType = 'upcoming' | 'missed' | 'attended' | 'cancelled'

interface RenderAppointmentCardProps {
  appointment: AppointmentData;
  tabType?: TabType;
  onViewAgreement: (params: { appointmentId: string; aggrementUrl: string | null }) => void;
  onDiscuss?: (appointmentId: string) => void;
  onReschedule?: (appointment: AppointmentData) => void;
  onCancel?: (appointment: AppointmentData) => void;
  onVideoCall?: (appointment: AppointmentData) => void;
  userRole?: 'client' | 'lawyer';
  onEscalateToCase?: (appointment: AppointmentData) => void;
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

const RenderAppointmentCard: FC<RenderAppointmentCardProps> = ({
  appointment,
  tabType = 'attended',
  onViewAgreement,
  onDiscuss,
  onReschedule,
  onCancel,
  onVideoCall,
  userRole = 'client',
  onEscalateToCase,
}) => {
  const [discussionOpen, setDiscussionOpen] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(false)
  const otherParty = userRole === 'client' ? appointment.lawyer : appointment.client

  const isVideoCallActive = useMemo(() => {
    const now = new Date()
    const appointmentTime = new Date(appointment.scheduledAt)
    const appointmentEndWindow = new Date(appointmentTime.getTime() + 30 * 60 * 1000)

    return now >= appointmentTime && now < appointmentEndWindow
  }, [appointment.scheduledAt])

  return (
    <div
      className="border border-gray-200 bg-white p-4 sm:p-6 mb-4 rounded-lg sm:rounded-none hover:border-primary transition-colors"
    >
      {/* Header — lawyer info + status */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
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
          <div className="min-w-0">
            <h3 className="text-base font-medium text-primary truncate">
              {otherParty?.name || 'Unknown'}
            </h3>
            <p className="text-sm text-secondary truncate">{otherParty?.email}</p>
          </div>
        </div>

        {/* Status badge — visible inline on mobile */}
        <div className="flex items-center gap-2 text-sm sm:flex-shrink-0">
          <span className="text-secondary">Status:</span>
          <span className={`font-medium ${getStatusColor(appointment.status)}`}>
            {appointment.status}
          </span>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mt-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-secondary">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span>{formatDate(appointment.scheduledAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-secondary">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>{formatTime(appointment.scheduledAt)} ({appointment.durationMins} mins)</span>
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

      {/* Action buttons — wrap on mobile */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mt-4 pt-4 border-t border-gray-100">
        {/* Upcoming Tab Buttons */}
        {tabType === 'upcoming' && (
          <>
            <button
              onClick={() => onVideoCall?.(appointment)}
              disabled={!isVideoCallActive}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors ${isVideoCallActive
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
            >
              <Video className="w-4 h-4" />
              <span className="hidden xs:inline sm:inline">Video Call</span>
              <span className="xs:hidden sm:hidden">Call</span>
            </button>
            {onReschedule && (
              <button
                onClick={() => onReschedule(appointment)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white rounded-md transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reschedule
              </button>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(appointment)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium border border-red-600 text-red-600 hover:bg-red-600 hover:text-white rounded-md transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Cancel
              </button>
            )}
          </>
        )}

        {/* Missed Tab Buttons */}
        {tabType === 'missed' && (
          <>
            {onReschedule && (
              <button
                onClick={() => onReschedule(appointment)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white rounded-md transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reschedule
              </button>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(appointment)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium border border-red-600 text-red-600 hover:bg-red-600 hover:text-white rounded-md transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Cancel
              </button>
            )}
          </>
        )}

        {/* Attended Tab Buttons */}
        {tabType === 'attended' && (
          <>
            <button
              onClick={() => onViewAgreement({ appointmentId: appointment.id, aggrementUrl: appointment.aggrementUrl })}
              disabled={!appointment.aggrementUrl}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors ${appointment.aggrementUrl
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
            >
              <FileText className="w-4 h-4" />
              Agreement
            </button>
            <button
              onClick={() => onDiscuss?.(appointment.id)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white rounded-md transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Discuss
            </button>
          </>
        )}
      </div>
      {/* Discussion Thread — expandable */}
      {
        (appointment.status === 'CONFIRMED' || appointment.status === 'PENDING' || appointment.status === 'COMPLETED') && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setDiscussionOpen(prev => !prev)}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition"
            >
              <MessageSquare className="w-4 h-4" />
              Discussion Thread
              {discussionOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {discussionOpen && (
              <AppointmentDiscussionPanel
                appointmentId={appointment.id}
                otherPartyName={otherParty?.name || 'Unknown'}
                otherPartyRole={userRole === 'client' ? 'Lawyer' : 'Client'}
                userRole={userRole}
                onEscalateToCase={onEscalateToCase ? () => onEscalateToCase?.(appointment) : undefined}
                caseId={appointment.case?.id || null}
                meetingLink={appointment.meetingLink}
                appointmentStatus={appointment.status}
              />
            )}
          </div>
        )
      }

      {/* Documents & AI summaries — expandable */}
      {
        (appointment.status === 'CONFIRMED' || appointment.status === 'PENDING' || appointment.status === 'COMPLETED') && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setDocumentsOpen(prev => !prev)}
              className="flex items-center gap-2 text-sm font-medium text-fuchsia-700 hover:text-fuchsia-800 transition"
            >
              <Sparkles className="w-4 h-4" />
              Documents & AI summaries
              {documentsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {documentsOpen && <AppointmentDocumentsPanel appointmentId={appointment.id} />}
          </div>
        )
      }
    </div >
  )
}

export default RenderAppointmentCard
export type { AppointmentData }
