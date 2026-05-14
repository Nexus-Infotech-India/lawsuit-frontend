import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/authStore'
import { queryClient } from '@/lib/queryClient'
import { resolveSocketOrigin } from '@/utils/apiUrl'
import type { Notification as AppNotification } from '@/types'
import type {
  CallType,
  CallIncomingEvent,
  CallInitiatedEvent,
  CallAcceptedEvent,
  CallDeclinedEvent,
  CallCancelledEvent,
  CallEndedEvent,
  CallErrorEvent,
  CallRoomReadyEvent,
  CallRoomStateEvent,
} from '@/types/video'

// Socket connects to the same host as the API. Naked hostnames in
// VITE_API_URL (e.g. `api.nyayax.com`) get a protocol prepended so
// new URL() parses cleanly.
const socketUrl = resolveSocketOrigin(import.meta.env.VITE_API_URL as string)

type MessageHandler = (message: ChatMessage) => void
type TypingHandler = (data: { user: { id: string; name?: string } }) => void
type ReadReceiptHandler = (data: { messageId: string; readerId: string; readAt: string }) => void
type OnlineStatusHandler = (data: { usersOnline: string[] }) => void
type UserStatusHandler = (data: { userId: string; online: boolean }) => void
type NotificationHandler = (notification: AppNotification) => void
type UnreadCountHandler = (data: { unreadCount: number }) => void

// Video call event handlers
type CallInitiatedHandler = (data: CallInitiatedEvent) => void
type CallIncomingHandler = (data: CallIncomingEvent) => void
type CallAcceptedHandler = (data: CallAcceptedEvent) => void
type CallDeclinedHandler = (data: CallDeclinedEvent) => void
type CallEndedHandler = (data: CallEndedEvent) => void
type CallCancelledHandler = (data: CallCancelledEvent) => void
type CallErrorHandler = (data: CallErrorEvent) => void

// WebRTC fallback event handlers
export interface WebRTCUserJoinedEvent { roomId: string; socketId: string; userId?: string }
export interface WebRTCUserLeftEvent { roomId: string; socketId: string; userId?: string }
export interface WebRTCOfferEvent { roomId: string; offer: RTCSessionDescriptionInit; from: string; userId?: string }
export interface WebRTCAnswerEvent { roomId: string; answer: RTCSessionDescriptionInit; from: string; userId?: string }
export interface WebRTCIceCandidateEvent { roomId: string; candidate: RTCIceCandidateInit; from: string; userId?: string }
type RtcUserJoinedHandler = (e: WebRTCUserJoinedEvent) => void
type RtcUserLeftHandler = (e: WebRTCUserLeftEvent) => void
type RtcOfferHandler = (e: WebRTCOfferEvent) => void
type RtcAnswerHandler = (e: WebRTCAnswerEvent) => void
type RtcIceCandidateHandler = (e: WebRTCIceCandidateEvent) => void

/**
 * A document row attached to a chat message. The server materialises one of
 * these per uploaded file (so the chip in chat is linkable into the
 * document-AI / OCR / summary surfaces).
 */
export interface ChatDocument {
  id: string
  filename?: string | null
  mimeType?: string | null
  url: string
  size?: number | null
}

export interface ChatMessage {
  id: string
  chatId: string
  senderId: string
  text?: string | null
  /** Legacy bare-URL array — kept for backwards compatibility. */
  attachments?: string[]
  /** Strongly-typed document rows (preferred). */
  documents?: ChatDocument[]
  isRead: boolean
  readAt?: string | null
  createdAt: string
  senderName?: string
}

class SocketService {
  private static instance: SocketService
  private socket: Socket | null = null
  private currentChatId: string | null = null
  private messageHandlers: MessageHandler[] = []
  private typingStartHandlers: TypingHandler[] = []
  private typingStopHandlers: TypingHandler[] = []
  private readReceiptHandlers: ReadReceiptHandler[] = []
  private onlineStatusHandlers: OnlineStatusHandler[] = []
  private userStatusHandlers: UserStatusHandler[] = []
  private notificationHandlers: NotificationHandler[] = []
  private unreadCountHandlers: UnreadCountHandler[] = []
  private onlineUsers: Set<string> = new Set()
  
  // Video call handlers
  private callInitiatedHandlers: CallInitiatedHandler[] = []
  private callIncomingHandlers: CallIncomingHandler[] = []
  private callAcceptedHandlers: CallAcceptedHandler[] = []
  private callDeclinedHandlers: CallDeclinedHandler[] = []
  private callEndedHandlers: CallEndedHandler[] = []
  private callCancelledHandlers: CallCancelledHandler[] = []
  private callErrorHandlers: CallErrorHandler[] = []
  // Shared-room (Daily-room-per-chat) handlers — preferred flow.
  private callRoomReadyHandlers: ((e: CallRoomReadyEvent) => void)[] = []
  private callRoomStateHandlers: ((e: CallRoomStateEvent) => void)[] = []

  // WebRTC fallback handlers
  private rtcUserJoinedHandlers: RtcUserJoinedHandler[] = []
  private rtcUserLeftHandlers: RtcUserLeftHandler[] = []
  private rtcOfferHandlers: RtcOfferHandler[] = []
  private rtcAnswerHandlers: RtcAnswerHandler[] = []
  private rtcIceCandidateHandlers: RtcIceCandidateHandler[] = []

  // Tracks an in-flight handshake. Set to true the moment `io()` returns a
  // Socket and cleared on the first `connect` / `connect_error` event. Without
  // this, four layout-mount calls race and create four parallel sockets.
  private connecting = false

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService()
    }
    return SocketService.instance
  }

  connect(): Socket | null {
    // Idempotent: reuse any existing socket, whether it has already connected
    // or is still mid-handshake. Without this guard, StrictMode + the 4
    // layouts that each call connect() open multiple parallel sockets.
    if (this.socket && (this.socket.connected || this.connecting)) {
      return this.socket
    }

    const token = useAuthStore.getState().token
    if (!token) {
      console.warn('SocketService: No auth token available')
      return null
    }

    this.connecting = true
    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    // Capture the new socket in a local so the listener doesn't read a stale
    // `this.socket` after a reconnect / replacement.
    const sock = this.socket
    sock.on('connect', () => {
      this.connecting = false
      console.log('Socket connected:', sock.id)
      // Rejoin current chat room if any
      if (this.currentChatId) {
        this.joinChat(this.currentChatId)
      }
    })

    sock.on('connect_error', (err) => {
      this.connecting = false
      console.warn('Socket connect_error:', err?.message)
    })

    sock.on('disconnect', (reason) => {
      this.connecting = false
      console.log('Socket disconnected:', reason)
    })

    // Listen for new messages
    this.socket.on('chat:message:new', (data: { message: ChatMessage }) => {
      this.messageHandlers.forEach((handler) => handler(data.message))
    })

    // Listen for typing events
    this.socket.on('chat:typing:start', (data: { user: { id: string; name?: string } }) => {
      this.typingStartHandlers.forEach((handler) => handler(data))
    })

    this.socket.on('chat:typing:stop', (data: { user: { id: string } }) => {
      this.typingStopHandlers.forEach((handler) => handler(data))
    })

    // Listen for read receipts
    this.socket.on('chat:message:read', (data: { messageId: string; readerId: string; readAt: string }) => {
      this.readReceiptHandlers.forEach((handler) => handler(data))
    })

    // Listen for user online status updates
    this.socket.on('users:online', (data: { usersOnline: string[] }) => {
      this.onlineUsers = new Set(data.usersOnline)
      this.onlineStatusHandlers.forEach((handler) => handler(data))
    })

    this.socket.on('user:online', (data: { userId: string }) => {
      this.onlineUsers.add(data.userId)
      this.userStatusHandlers.forEach((handler) => handler({ userId: data.userId, online: true }))
    })

    this.socket.on('user:offline', (data: { userId: string }) => {
      this.onlineUsers.delete(data.userId)
      this.userStatusHandlers.forEach((handler) => handler({ userId: data.userId, online: false }))
    })

    // Listen for push notifications
    this.socket.on('notification', (notification: AppNotification) => {
      this.notificationHandlers.forEach((handler) => handler(notification))
    })

    // Listen for unread count updates
    this.socket.on('notification:unread-count', (data: { unreadCount: number }) => {
      this.unreadCountHandlers.forEach((handler) => handler(data))
    })

    // Listen for mediation lifecycle updates (invite-accepted, lawyer-attached,
    // mediator-picked, in-session, concluded, etc.). One event covers all transitions.
    this.socket.on('mediation:updated', (payload: { mediationId: string; status: string; matched?: boolean; escalatedCaseId?: string | null }) => {
      queryClient.invalidateQueries({ queryKey: ['mediations'] })
      queryClient.invalidateQueries({ queryKey: ['mediation', payload.mediationId] })
    })

    // ─────────────────────────────────────────────────────────────────────
    // Video Call Events
    // ─────────────────────────────────────────────────────────────────────

    // Ack for the caller — confirms the call is ringing and carries room+token
    this.socket.on('call:initiated', (data: CallInitiatedEvent) => {
      this.callInitiatedHandlers.forEach((handler) => handler(data))
    })

    // Incoming call notification (callee side)
    this.socket.on('call:incoming', (data: CallIncomingEvent) => {
      this.callIncomingHandlers.forEach((handler) => handler(data))
    })

    // Call was accepted by the callee (caller side)
    this.socket.on('call:accepted', (data: CallAcceptedEvent) => {
      this.callAcceptedHandlers.forEach((handler) => handler(data))
    })

    // Call was declined by the callee (caller side)
    this.socket.on('call:declined', (data: CallDeclinedEvent) => {
      this.callDeclinedHandlers.forEach((handler) => handler(data))
    })

    // Call cancelled by the caller (callee side)
    this.socket.on('call:cancelled', (data: CallCancelledEvent) => {
      this.callCancelledHandlers.forEach((handler) => handler(data))
    })

    // Call ended (either side)
    this.socket.on('call:ended', (data: CallEndedEvent) => {
      this.callEndedHandlers.forEach((handler) => handler(data))
    })

    // Call error
    this.socket.on('call:error', (data: CallErrorEvent) => {
      console.error('Call error:', data)
      this.callErrorHandlers.forEach((handler) => handler(data))
    })

    // ─── Shared-room flow ────────────────────────────────────────
    // Direct reply to `call:room:ensure` — carries the per-user
    // meeting token and the Daily room URL the caller should join.
    this.socket.on('call:room:ready', (data: CallRoomReadyEvent) => {
      this.callRoomReadyHandlers.forEach((h) => h(data))
    })
    // Broadcast to every socket in `chat_<chatId>` whenever the room's
    // active-state or participant count changes. The chat-level CTA
    // ("Start" vs "Join") and the participant counter read from here.
    this.socket.on('call:room:state', (data: CallRoomStateEvent) => {
      this.callRoomStateHandlers.forEach((h) => h(data))
    })

    // ─────────────────────────────────────────────────────────────────────
    // WebRTC fallback signaling
    // ─────────────────────────────────────────────────────────────────────
    this.socket.on('video:user-joined', (data: WebRTCUserJoinedEvent) => {
      this.rtcUserJoinedHandlers.forEach((h) => h(data))
    })
    this.socket.on('video:user-left', (data: WebRTCUserLeftEvent) => {
      this.rtcUserLeftHandlers.forEach((h) => h(data))
    })
    this.socket.on('video:offer', (data: WebRTCOfferEvent) => {
      this.rtcOfferHandlers.forEach((h) => h(data))
    })
    this.socket.on('video:answer', (data: WebRTCAnswerEvent) => {
      this.rtcAnswerHandlers.forEach((h) => h(data))
    })
    this.socket.on('video:ice-candidate', (data: WebRTCIceCandidateEvent) => {
      this.rtcIceCandidateHandlers.forEach((h) => h(data))
    })

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.currentChatId = null
      this.onlineUsers.clear()
    }
  }

  joinChat(chatId: string) {
    this.currentChatId = chatId
    if (this.socket?.connected) {
      this.socket.emit('chat:join', { chatId })
    }
  }

  leaveChat() {
    this.currentChatId = null
  }

  sendMessage(chatId: string, text: string, attachments?: string[]) {
    if (this.socket?.connected) {
      this.socket.emit('chat:message:new', { chatId, text, attachments })
    }
  }

  startTyping(chatId: string) {
    if (this.socket?.connected) {
      this.socket.emit('chat:typing:start', { chatId })
    }
  }

  stopTyping(chatId: string) {
    if (this.socket?.connected) {
      this.socket.emit('chat:typing:stop', { chatId })
    }
  }

  markMessageRead(chatId: string, messageId: string) {
    if (this.socket?.connected) {
      this.socket.emit('chat:message:read', { chatId, messageId })
    }
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId)
  }

  getOnlineUsers(): string[] {
    return Array.from(this.onlineUsers)
  }

  // Event handlers
  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler)
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler)
    }
  }

  onTypingStart(handler: TypingHandler) {
    this.typingStartHandlers.push(handler)
    return () => {
      this.typingStartHandlers = this.typingStartHandlers.filter((h) => h !== handler)
    }
  }

  onTypingStop(handler: TypingHandler) {
    this.typingStopHandlers.push(handler)
    return () => {
      this.typingStopHandlers = this.typingStopHandlers.filter((h) => h !== handler)
    }
  }

  onReadReceipt(handler: ReadReceiptHandler) {
    this.readReceiptHandlers.push(handler)
    return () => {
      this.readReceiptHandlers = this.readReceiptHandlers.filter((h) => h !== handler)
    }
  }

  onOnlineStatusUpdate(handler: OnlineStatusHandler) {
    this.onlineStatusHandlers.push(handler)
    return () => {
      this.onlineStatusHandlers = this.onlineStatusHandlers.filter((h) => h !== handler)
    }
  }

  onUserStatusChange(handler: UserStatusHandler) {
    this.userStatusHandlers.push(handler)
    return () => {
      this.userStatusHandlers = this.userStatusHandlers.filter((h) => h !== handler)
    }
  }

  onNotification(handler: NotificationHandler) {
    this.notificationHandlers.push(handler)
    return () => {
      this.notificationHandlers = this.notificationHandlers.filter((h) => h !== handler)
    }
  }

  onUnreadCountUpdate(handler: UnreadCountHandler) {
    this.unreadCountHandlers.push(handler)
    return () => {
      this.unreadCountHandlers = this.unreadCountHandlers.filter((h) => h !== handler)
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Video Call Methods
  // ─────────────────────────────────────────────────────────────────────

  /** Initiate an outgoing call. Backend will ack with `call:initiated`. */
  initiateCall(to: string, callType: CallType, referenceId: string) {
    if (this.socket?.connected) {
      this.socket.emit('call:initiate', { to, callType, referenceId })
    }
  }

  /** Accept an incoming call (callee only). */
  acceptCall(callId: string) {
    if (this.socket?.connected) {
      this.socket.emit('call:accept', { callId })
    }
  }

  /** Decline an incoming call (callee only). */
  declineCall(callId: string) {
    if (this.socket?.connected) {
      this.socket.emit('call:decline', { callId })
    }
  }

  /** Cancel an outgoing call before it is answered (caller only). */
  cancelCall(callId: string) {
    if (this.socket?.connected) {
      this.socket.emit('call:cancel', { callId })
    }
  }

  /** End an ongoing call (either party). */
  endCall(callId: string) {
    if (this.socket?.connected) {
      this.socket.emit('call:end', { callId })
    }
  }

  // Video call event subscribers. Each returns an unsubscribe fn.
  onCallInitiated(handler: CallInitiatedHandler) {
    this.callInitiatedHandlers.push(handler)
    return () => {
      this.callInitiatedHandlers = this.callInitiatedHandlers.filter((h) => h !== handler)
    }
  }

  onCallIncoming(handler: CallIncomingHandler) {
    this.callIncomingHandlers.push(handler)
    return () => {
      this.callIncomingHandlers = this.callIncomingHandlers.filter((h) => h !== handler)
    }
  }

  onCallAccepted(handler: CallAcceptedHandler) {
    this.callAcceptedHandlers.push(handler)
    return () => {
      this.callAcceptedHandlers = this.callAcceptedHandlers.filter((h) => h !== handler)
    }
  }

  onCallDeclined(handler: CallDeclinedHandler) {
    this.callDeclinedHandlers.push(handler)
    return () => {
      this.callDeclinedHandlers = this.callDeclinedHandlers.filter((h) => h !== handler)
    }
  }

  onCallCancelled(handler: CallCancelledHandler) {
    this.callCancelledHandlers.push(handler)
    return () => {
      this.callCancelledHandlers = this.callCancelledHandlers.filter((h) => h !== handler)
    }
  }

  onCallEnded(handler: CallEndedHandler) {
    this.callEndedHandlers.push(handler)
    return () => {
      this.callEndedHandlers = this.callEndedHandlers.filter((h) => h !== handler)
    }
  }

  onCallError(handler: CallErrorHandler) {
    this.callErrorHandlers.push(handler)
    return () => {
      this.callErrorHandlers = this.callErrorHandlers.filter((h) => h !== handler)
    }
  }

  // ─── Shared-room emitters ───────────────────────────────────────────
  /**
   * Ask the server to ensure a Daily room exists for this chat and
   * return a per-user meeting token. Triggers a broadcast of
   * `call:room:state` to every chat participant so other tabs flip
   * their CTA from "Start" to "Join". Idempotent — calling twice from
   * the same chat returns the same room.
   */
  ensureCallRoom(payload: {
    chatId: string
    callType?: 'chat' | 'appointment'
    mediaType?: 'audio' | 'video'
  }) {
    if (this.socket?.connected) {
      this.socket.emit('call:room:ensure', payload)
    }
  }

  /**
   * Tell the server we've actually joined the Daily iframe. Fired from
   * the Daily player's `joined-meeting` event. The server uses this to
   * track participant count so it can tear the room down when the last
   * person leaves.
   */
  notifyRoomJoined(callId: string) {
    if (this.socket?.connected) {
      this.socket.emit('call:room:joined', { callId })
    }
  }

  /**
   * Counterpart to `notifyRoomJoined` — fired when our Daily iframe
   * is torn down. The server decrements the participant count and, if
   * it hits zero, deletes the Daily room + Redis record and writes a
   * CallHistory row.
   */
  notifyRoomLeft(callId: string) {
    if (this.socket?.connected) {
      this.socket.emit('call:room:left', { callId })
    }
  }

  /**
   * Read-only ping the FE fires when a chat is opened so the CTA
   * label can be correct before any state-change event arrives.
   * Server replies with a `call:room:state` for this chatId only to
   * the requesting socket.
   */
  pollRoomStatus(chatId: string) {
    if (this.socket?.connected) {
      this.socket.emit('call:room:status', { chatId })
    }
  }

  onCallRoomReady(handler: (e: CallRoomReadyEvent) => void) {
    this.callRoomReadyHandlers.push(handler)
    return () => {
      this.callRoomReadyHandlers = this.callRoomReadyHandlers.filter((h) => h !== handler)
    }
  }

  onCallRoomState(handler: (e: CallRoomStateEvent) => void) {
    this.callRoomStateHandlers.push(handler)
    return () => {
      this.callRoomStateHandlers = this.callRoomStateHandlers.filter((h) => h !== handler)
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // WebRTC fallback signaling — emitters
  // ─────────────────────────────────────────────────────────────────────

  /** Join a WebRTC room. Server will emit `video:user-joined` to existing peers. */
  rtcJoin(roomId: string) {
    if (this.socket?.connected) this.socket.emit('video:join', { roomId })
  }

  /** Send an SDP offer to a specific peer (identified by their socket id). */
  rtcOffer(roomId: string, to: string, offer: RTCSessionDescriptionInit) {
    if (this.socket?.connected) this.socket.emit('video:offer', { roomId, to, offer })
  }

  /** Send an SDP answer back to the offerer. */
  rtcAnswer(roomId: string, to: string, answer: RTCSessionDescriptionInit) {
    if (this.socket?.connected) this.socket.emit('video:answer', { roomId, to, answer })
  }

  /** Forward a local ICE candidate to a peer. */
  rtcIceCandidate(roomId: string, to: string, candidate: RTCIceCandidateInit) {
    if (this.socket?.connected) this.socket.emit('video:ice-candidate', { roomId, to, candidate })
  }

  /** Leave the WebRTC room. */
  rtcLeave(roomId: string) {
    if (this.socket?.connected) this.socket.emit('video:leave', { roomId })
  }

  // WebRTC subscribers — each returns an unsubscribe fn
  onRtcUserJoined(handler: RtcUserJoinedHandler) {
    this.rtcUserJoinedHandlers.push(handler)
    return () => { this.rtcUserJoinedHandlers = this.rtcUserJoinedHandlers.filter((h) => h !== handler) }
  }
  onRtcUserLeft(handler: RtcUserLeftHandler) {
    this.rtcUserLeftHandlers.push(handler)
    return () => { this.rtcUserLeftHandlers = this.rtcUserLeftHandlers.filter((h) => h !== handler) }
  }
  onRtcOffer(handler: RtcOfferHandler) {
    this.rtcOfferHandlers.push(handler)
    return () => { this.rtcOfferHandlers = this.rtcOfferHandlers.filter((h) => h !== handler) }
  }
  onRtcAnswer(handler: RtcAnswerHandler) {
    this.rtcAnswerHandlers.push(handler)
    return () => { this.rtcAnswerHandlers = this.rtcAnswerHandlers.filter((h) => h !== handler) }
  }
  onRtcIceCandidate(handler: RtcIceCandidateHandler) {
    this.rtcIceCandidateHandlers.push(handler)
    return () => { this.rtcIceCandidateHandlers = this.rtcIceCandidateHandlers.filter((h) => h !== handler) }
  }

  /** Returns the local socket id (when connected). Needed so the WebRTC layer can ignore self events. */
  getSocketId(): string | undefined {
    return this.socket?.id
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false
  }
}

export const socketService = SocketService.getInstance()
export default socketService
