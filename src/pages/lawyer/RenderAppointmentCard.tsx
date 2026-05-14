import { FC, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, Clock, FileText, MessageSquare, User, Video, Upload, RefreshCw, XCircle, ChevronDown, ChevronUp, Check, X, CheckCircle2, Sparkles, Briefcase } from 'lucide-react'
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

// `pending` keeps a tab-specific value so the parent can pass it cleanly,
// but no `tabType === 'pending'` per-tab buttons exist here — the Accept /
// Reject buttons come from the PENDING-status lifecycle branch above so a
// pending appointment surfaced on this card always shows the right actions.
type TabType = 'pending' | 'attendNow' | 'upcoming' | 'missed' | 'attended' | 'cancelled'

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
  const navigate = useNavigate()
  // Pending consultations are pre-decision: the lawyer should only see the
  // client's described issue and the supporting documents (with the AI
  // summary). Hiding chat, payment, status pill, and the collapsed-docs
  // wrapper keeps the screen focused on what's needed to accept or reject.
  const isPending = appointment.status === 'PENDING'
  const [documentsOpen, setDocumentsOpen] = useState(isPending)
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
    // The server's reject path auto-refunds any completed payment back to
    // the client's wallet (see `consultation.service.ts::rejectAppointment`
    // → `payoutService.refundToClient`). Flag that in the prompt so the
    // lawyer knows what they're signing off on.
    const reason = prompt(
      'Reject this consultation?\n\nIf the client has already paid, the full amount is refunded to their wallet automatically.\n\nOptional reason (shown to the client):',
    )
    // `prompt` returns null when the user cancels, '' when they submit
    // blank. Cancel aborts; blank-submit proceeds without a reason.
    if (reason === null) return
    setBusyAction('reject')
    setActionError(null)
    try {
      await appointmentsExtApi.reject(appointment.id, reason || undefined)
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
            {/* Status pill is redundant for pending — the tab itself already
                conveys "this is a pending request" and we want the screen
                stripped down to the decision context. */}
            {!isPending && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-secondary">Status:</span>
                <span className={`font-medium ${getStatusColor(appointment.status)}`}>
                  {appointment.status}
                </span>
              </div>
            )}
          </div>

          {/* Client's description of the issue. Surfaced in a labelled box
              so it doesn't read like an admin note — the lawyer needs to see
              the FULL message to triage / prepare. We keep `whitespace-pre-wrap`
              to honour line breaks the client typed and drop the truncation
              the old layout had. */}
          {appointment.notes && (
            <div className="mb-4 rounded-md border border-indigo-100 bg-indigo-50/50 p-3">
              <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">
                Issue described by client
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                {appointment.notes}
              </p>
            </div>
          )}

          {/* Payment status is hidden on the pending card — it's an
              implementation detail (escrow is already held server-side)
              and not something the lawyer needs to reason about before
              accept/reject. Rejecting auto-refunds in either case. */}
          {!isPending && appointment.payment && (
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
            {/* Escalate-to-Case — explicitly named so it matches the
                lawyer's mental model. Clicking opens the create-case sheet
                seeded with this client + appointment metadata so the lawyer
                can convert the consultation into a tracked case. */}
            <button
              onClick={() => onOpenCaseCreation(appointment)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <Briefcase className="w-4 h-4" />
              Escalate to Case
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
            {/* Even when the slot was missed (lawyer never marked the
                appointment COMPLETED so it didn't move to the attended
                tab), the consultation may have actually happened — surface
                Escalate-to-Case here too so the lawyer can hand off the
                client without first juggling the status state. */}
            <button
              onClick={() => onOpenCaseCreation(appointment)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
            >
              <Briefcase className="w-4 h-4" />
              Escalate to Case
            </button>
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
            {/* Escalate-to-Case on the attended tab — the post-consultation
                hand-off the lawyer expects to find here. Filled primary so
                it reads as the headline action on a completed appointment. */}
            <button
              onClick={() => onOpenCaseCreation(appointment)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              <Briefcase className="w-4 h-4" />
              Escalate to Case
            </button>
          </>
        )}

        {/* Cancelled Tab - No buttons */}
      </div>

      {/* Open Chat — navigates to the unified /lawyer/chats page with this
          appointment's conversation pre-opened. Replaces the previous inline
          AppointmentDiscussionPanel expandable; all chat now lives in one
          place so messages, read receipts, and audio/video calls are
          consistent regardless of where the user entered from.
          Hidden on PENDING: a chat with an unconfirmed client is premature
          — the lawyer reads the issue + docs and decides accept/reject
          first; chat unlocks once the appointment is accepted. */}
      {!isPending && (appointment.status === 'CONFIRMED' || appointment.status === 'COMPLETED') && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => navigate(`/lawyer/chats?appointmentId=${appointment.id}`)}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition"
          >
            <MessageSquare className="w-4 h-4" />
            Open Chat
          </button>
        </div>
      )}

      {/* Documents & AI summaries.
          - PENDING: render the panel inline (already has its own header so
            we drop the collapsible wrapper — the duplicate "Documents & AI
            summaries" rows in the previous build were the wrapper + panel
            headers stacked on top of each other).
          - Other states: keep the collapsible wrapper so confirmed/attended
            cards stay compact by default. */}
      {appointment.status === 'CONFIRMED' || appointment.status === 'PENDING' || appointment.status === 'COMPLETED' ? (
        isPending ? (
          /* readOnly: lawyer can't upload reference docs to a request they
             haven't accepted yet — that capability returns the moment the
             appointment moves to CONFIRMED. */
          <AppointmentDocumentsPanel appointmentId={appointment.id} readOnly />
        ) : (
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
      ) : null}
    </div>
  )
}

export default RenderAppointmentCard
export type { AppointmentData }
