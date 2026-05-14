// Video Call Types and Interfaces
//
// Contract (mirrors backend `src/sockets/index.ts`):
//
//   frontend -> backend: call:initiate { to, callType, referenceId }
//                        call:accept   { callId }
//                        call:decline  { callId }
//                        call:cancel   { callId }
//                        call:end      { callId }
//
//   backend  -> caller:  call:initiated { callId, callType, referenceId, callee, roomUrl, token }
//                        call:accepted  { callId, callee }
//                        call:declined  { callId, reason }
//                        call:ended     { callId, duration }
//                        call:error     { callId?, code, message }
//
//   backend  -> callee:  call:incoming  { callId, callType, referenceId, caller, roomUrl, token }
//                        call:cancelled { callId }
//                        call:ended     { callId, duration }
//                        call:error     { callId?, code, message }

export type CallStatus =
  | 'idle'
  | 'initiating' // caller: waiting for callee to accept
  | 'ringing'    // callee: incoming call modal open
  | 'connecting' // both: joining Daily room
  | 'connected'  // both: in the call
  | 'ended'

export type CallType = 'chat' | 'appointment'

export type CallEndReason =
  | 'completed'
  | 'declined'
  | 'missed'
  | 'failed'
  | 'busy'
  | 'cancelled'
  | 'network_error'

export interface CallParticipant {
  id: string
  name: string
  avatar?: string
  role: 'CLIENT' | 'LAWYER' | 'ADMIN'
}

export interface VideoCallState {
  status: CallStatus
  callId: string | null
  callType: CallType | null
  referenceId: string | null // chatId or appointmentId
  caller: CallParticipant | null
  callee: CallParticipant | null
  roomUrl: string | null
  token: string | null
  startedAt: Date | null
  endedAt: Date | null
  endReason: CallEndReason | null
  isMinimized: boolean
  isMuted: boolean
  isCameraOff: boolean
}

// ───────────────────────────────────────────────────────────
// Socket event payloads
// ───────────────────────────────────────────────────────────

// Frontend → backend
export interface CallInitiatePayload {
  to: string
  callType: CallType
  referenceId: string
}

export interface CallIdPayload {
  callId: string
}

// Backend → caller (ack)
export interface CallInitiatedEvent {
  callId: string
  callType: CallType
  referenceId: string
  callee: CallParticipant
  roomUrl: string
  token: string
}

// Backend → callee
export interface CallIncomingEvent {
  callId: string
  callType: CallType
  referenceId: string
  caller: CallParticipant
  roomUrl: string
  token: string
}

// Backend → caller
export interface CallAcceptedEvent {
  callId: string
  callee: CallParticipant
}

export interface CallDeclinedEvent {
  callId: string
  reason: 'declined' | 'busy'
}

// Backend → callee
export interface CallCancelledEvent {
  callId: string
}

// Backend → either
export interface CallEndedEvent {
  callId: string
  duration?: number
}

export interface CallErrorEvent {
  callId?: string
  code: string
  message: string
}

// ───────────────────────────────────────────────────────────
// Shared-room flow (preferred — used by web)
// ───────────────────────────────────────────────────────────
//
// Replaces the ring-style call:initiate / accept / decline / cancel /
// end events with a "Daily-room-per-chat" model:
//
//   • Frontend → backend: call:room:ensure { chatId, callType?, mediaType? }
//                          call:room:joined { callId }
//                          call:room:left   { callId }
//                          call:room:status { chatId } — read-only poll
//   • Backend  → caller:   call:room:ready  { callId, roomUrl, token, mediaType, isNewRoom }
//   • Backend  → chat room: call:room:state { chatId, isActive, callId?, mediaType?, startedBy?, participantCount? }
//
// When someone clicks "Start video call", the FE emits ensure → server
// provisions (or fetches) a Daily room → caller gets ready + everyone
// else in the chat gets a state broadcast → other party's CTA flips
// from "Start" to "Join". Both sides hit ensure → both get a personal
// meeting token for the same room.

export interface CallRoomEnsurePayload {
  chatId: string
  callType?: CallType
  mediaType?: 'audio' | 'video'
}

export interface CallRoomReadyEvent {
  callId: string
  roomUrl: string
  token: string
  mediaType: 'audio' | 'video'
  /** True when this ensure call created a new Daily room; false when it joined an existing one. */
  isNewRoom: boolean
}

export interface CallRoomStateEvent {
  chatId: string
  isActive: boolean
  callId?: string
  mediaType?: 'audio' | 'video'
  /** userId of the participant who started the room. */
  startedBy?: string
  /** Current count of participants joined to the Daily room. */
  participantCount?: number
}

export interface CallRoomJoinedPayload {
  callId: string
}

export interface CallRoomLeftPayload {
  callId: string
}

// ───────────────────────────────────────────────────────────
// Call history (HTTP)
// ───────────────────────────────────────────────────────────

export interface CallHistory {
  id: string
  callType: CallType
  referenceId: string
  callerId: string
  callerName: string
  callerAvatar?: string
  calleeId: string
  calleeName: string
  calleeAvatar?: string
  status: 'completed' | 'missed' | 'declined' | 'failed' | 'cancelled'
  duration: number
  startedAt: string
  endedAt: string
  createdAt: string
}

export interface CallHistoryResponse {
  items: CallHistory[]
  total: number
  page: number
  limit: number
}
