import { FC, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Clock, FileText, MessageSquare, User, Video, Upload, RefreshCw, XCircle, ChevronDown, ChevronUp, Check, X, CheckCircle2, Sparkles } from 'lucide-react'
import AppointmentDiscussionPanel from '@/components/organisms/AppointmentDiscussionPanel'
import AppointmentDocumentsPanel from '@/components/molecules/AppointmentDocumentsPanel'
import EkycVerifiedBadge from '@/components/atoms/EkycVerifiedBadge'
import { appointmentsExtApi } from '@/services/api'

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
    /** Optional — surfaced as a verified badge next to the client's name. */
    ekycVerified?: boolean;
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

type TabType = 'attendNow' | 'upcoming' | 'missed' | 'attended' | 'cancelled'

interface RenderAppointmentCardProps {
  appointment: AppointmentData;
  showAttendButton?: boolean;
  tabType?: TabType;
  onAttend: (appointment: AppointmentData) => void;
  onViewAgreement: (params: { appointmentId: string; aggrementUrl: string | null }) => void;
  onUploadAgreement: (appointment: AppointmentData) => void;
  onOpenChat?: (appointment: AppointmentData) => void;
  onOpenCaseCreation: (appointment: AppointmentData) => void;
  onReschedule?: (appointment: AppointmentData) => void;
  onCancel?: (appointment: AppointmentData) => void;
  /** Called after a lifecycle change so parent can refresh. */
  onChanged?: () => void;
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
  showAttendButton = false,
  tabType = 'attended',
  onAttend,
  onViewAgreement,
  onUploadAgreement,
  onOpenChat,
  onOpenCaseCreation,
  onReschedule,
  onCancel,
  onChanged,
}) => {
  const [discussionOpen, setDiscussionOpen] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(false)
  const [busyAction, setBusyAction] = useState<null | 'accept' | 'reject' | 'complete'>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const otherParty = appointment.client

  const handleAccept = async () => {
    if (!confirm('Accept this consultation?')) return
    setBusyAction('accept')
    setActionError(null)
    try {
      await appointmentsExtApi.accept(appointment.id)
      onChanged?.()
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to accept')
    } finally {
      setBusyAction(null)
    }
  }

  const handleReject = async () => {
    const reason = prompt('Reason for rejecting? (optional)') || undefined
    if (reason === undefined && !confirm('Reject this consultation?')) return
    setBusyAction('reject')
    setActionError(null)
    try {
      await appointmentsExtApi.reject(appointment.id, reason)
      onChanged?.()
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to reject')
    } finally {
      setBusyAction(null)
    }
  }

  const handleComplete = async () => {
    if (!confirm('Mark this consultation as completed? Escrow will be released to your wallet.')) return
    setBusyAction('complete')
    setActionError(null)
    try {
      await appointmentsExtApi.complete(appointment.id)
      onChanged?.()
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to complete')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div
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
              <div className="flex items-center gap-1.5 flex-wrap">
                {otherParty?.id ? (
                  <Link
                    to={`/lawyer/client/${otherParty.id}`}
                    className="text-base font-medium text-primary hover:underline"
                    title="View client history"
                  >
                    {otherParty.name || 'Unknown'}
                  </Link>
                ) : (
                  <h3 className="text-base font-medium text-primary">
                    {otherParty?.name || 'Unknown'}
                  </h3>
                )}
                <EkycVerifiedBadge verified={otherParty?.ekycVerified} />
              </div>
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

      {/* Lifecycle actions — independent of tab grouping. */}
      {(appointment.status === 'PENDING' || appointment.status === 'CONFIRMED') && (
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
          {appointment.status === 'PENDING' && (
            <>
              <button
                onClick={handleAccept}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors rounded"
              >
                <Check className="w-4 h-4" />
                {busyAction === 'accept' ? 'Accepting…' : 'Accept'}
              </button>
              <button
                onClick={handleReject}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-red-600 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors rounded"
              >
                <X className="w-4 h-4" />
                {busyAction === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
            </>
          )}
          {appointment.status === 'CONFIRMED' && (
            <button
              onClick={handleComplete}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors rounded"
            >
              <CheckCircle2 className="w-4 h-4" />
              {busyAction === 'complete' ? 'Completing…' : 'Mark complete'}
            </button>
          )}
          {actionError && <span className="text-xs text-red-600 self-center">{actionError}</span>}
        </div>
      )}

      <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
        {/* Attend Now Tab Buttons */}
        {tabType === 'attendNow' && (
          <>
            {showAttendButton && (
              <button
                onClick={() => onAttend(appointment)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <Video className="w-4 h-4" />
                Attend Now
              </button>
            )}
            {appointment.aggrementUrl && (
              <button
                onClick={() => onViewAgreement({ appointmentId: appointment.id, aggrementUrl: appointment.aggrementUrl })}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <FileText className="w-4 h-4" />
                View Agreement
              </button>
            )}
            <button
              onClick={() => onUploadAgreement(appointment)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Agreement
            </button>
            <button
              onClick={() => onOpenChat?.(appointment)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Discuss
            </button>
            <button
              onClick={() => onOpenCaseCreation(appointment)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <FileText className="w-4 h-4" />
              Case Details
            </button>
          </>
        )}

        {/* Upcoming Tab Buttons */}
        {tabType === 'upcoming' && (
          <>
            {onReschedule && (
              <button
                onClick={() => onReschedule(appointment)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reschedule
              </button>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(appointment)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-red-600 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reschedule
              </button>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(appointment)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-red-600 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
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
            {appointment.aggrementUrl ? (
              <button
                onClick={() => onViewAgreement({ appointmentId: appointment.id, aggrementUrl: appointment.aggrementUrl })}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <FileText className="w-4 h-4" />
                View Agreement
              </button>
            ) : null}
            <button
              onClick={() => onUploadAgreement(appointment)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Agreement
            </button>
            <button
              onClick={() => onOpenChat?.(appointment)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Discuss
            </button>
            <button
              onClick={() => onOpenCaseCreation(appointment)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <FileText className="w-4 h-4" />
              Case Details
            </button>
          </>
        )}

        {/* Cancelled Tab - No buttons */}
      </div>

      {/* Discussion Thread — expandable, for confirmed/attended/attendNow */}
      {(appointment.status === 'CONFIRMED' || appointment.status === 'PENDING' || appointment.status === 'COMPLETED') && (
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
              otherPartyRole="Client"
              userRole="lawyer"
              onEscalateToCase={() => onOpenCaseCreation(appointment)}
              caseId={appointment.case?.id || null}
              meetingLink={appointment.meetingLink}
              appointmentStatus={appointment.status}
            />
          )}
        </div>
      )}

      {/* Documents & AI summaries — expandable */}
      {(appointment.status === 'CONFIRMED' || appointment.status === 'PENDING' || appointment.status === 'COMPLETED') && (
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
      )}
    </div>
  )
}

export default RenderAppointmentCard
export type { AppointmentData }
