import { create } from 'zustand'
import type {
  VideoCallState,
  CallStatus,
  CallType,
  CallParticipant,
  CallEndReason,
  CallInitiatedEvent,
  CallIncomingEvent,
  CallRoomReadyEvent,
  CallRoomStateEvent,
} from '@/types/video'
import { soundManager } from '@/utils/soundManager'

/**
 * `roomStatusByChat` carries the "Is someone in the video call right
 * now?" signal received from `call:room:state` broadcasts. The chat
 * page's Start/Join CTA reads from here, keyed by chatId.
 */
export interface ChatRoomStatus {
  isActive: boolean
  callId?: string | null
  mediaType?: 'audio' | 'video'
  startedBy?: string
  participantCount?: number
}

interface VideoCallStore extends VideoCallState {
  // Per-chat room status (populated from `call:room:state` broadcasts).
  roomStatusByChat: Record<string, ChatRoomStatus>
  setRoomStatus: (chatId: string, status: ChatRoomStatus) => void

  // Lifecycle
  initiateCall: (callType: CallType, referenceId: string, callee: CallParticipant) => void
  callInitiated: (data: CallInitiatedEvent) => void
  receiveIncomingCall: (data: CallIncomingEvent) => void
  acceptCall: () => void
  callAccepted: (callee?: CallParticipant | null) => void
  callConnected: () => void
  endCall: (reason: CallEndReason) => void
  reset: () => void

  // Shared-room flow
  beginJoin: (chatId: string) => void
  callRoomReady: (data: CallRoomReadyEvent) => void
  callRoomLeft: () => void

  // UI controls
  toggleMinimize: () => void
  toggleMute: () => void
  toggleCamera: () => void
}

const initialState: VideoCallState = {
  status: 'idle',
  callId: null,
  callType: null,
  referenceId: null,
  caller: null,
  callee: null,
  roomUrl: null,
  token: null,
  startedAt: null,
  endedAt: null,
  endReason: null,
  isMinimized: false,
  isMuted: false,
  isCameraOff: false,
}

export const useVideoCallStore = create<VideoCallStore>((set) => ({
  ...initialState,
  roomStatusByChat: {},

  setRoomStatus: (chatId, status) =>
    set((state) => ({
      roomStatusByChat: { ...state.roomStatusByChat, [chatId]: status },
    })),

  // Shared-room flow ────────────────────────────────────────────────
  // The user hit "Start" or "Join". We optimistically flip to
  // `connecting` (the room exists or is about to). The `call:room:ready`
  // ack will fill in callId / roomUrl / token and the DailyVideoPlayer
  // moves us to `connected` once the iframe joins.
  beginJoin: (chatId) => {
    set({
      ...initialState,
      status: 'connecting',
      callType: 'chat',
      referenceId: chatId,
    })
  },

  callRoomReady: (data) => {
    set({
      callId: data.callId,
      roomUrl: data.roomUrl,
      token: data.token,
      // For audio calls we land with the camera off so the recipient
      // doesn't see an open camera before they realise the call is
      // audio-only. `isCameraOff` is honoured by DailyVideoPlayer.
      isCameraOff: data.mediaType === 'audio',
    })
  },

  callRoomLeft: () => {
    soundManager.playOnce('ended')
    set(initialState)
  },

  // Caller: local optimistic state while we wait for the backend ack
  initiateCall: (callType, referenceId, callee) => {
    soundManager.startLoop('outgoing')
    set({
      ...initialState,
      status: 'initiating',
      callType,
      referenceId,
      callee,
    })
  },

  // Caller: backend ack — now we have a callId + roomUrl + token
  callInitiated: (data) => {
    set({
      callId: data.callId,
      callType: data.callType,
      referenceId: data.referenceId,
      callee: data.callee,
      roomUrl: data.roomUrl,
      token: data.token,
    })
  },

  // Callee: incoming call received
  receiveIncomingCall: (data) => {
    soundManager.startLoop('incoming')
    set({
      ...initialState,
      status: 'ringing',
      callId: data.callId,
      callType: data.callType,
      referenceId: data.referenceId,
      caller: data.caller,
      roomUrl: data.roomUrl,
      token: data.token,
    })
  },

  // Callee: locally accept (socket emit handled by the hook)
  acceptCall: () => {
    soundManager.stopLoop()
    set({ status: 'connecting' })
  },

  // Caller: callee accepted on the other side
  callAccepted: (callee) => {
    soundManager.stopLoop()
    set((state) => ({
      status: 'connecting',
      callee: callee ?? state.callee,
    }))
  },

  // Either side: Daily iframe successfully joined
  callConnected: () => {
    soundManager.playOnce('connected')
    set({
      status: 'connected',
      startedAt: new Date(),
    })
  },

  endCall: (reason) => {
    soundManager.stopLoop()
    soundManager.playOnce('ended')
    set({
      status: 'ended',
      endedAt: new Date(),
      endReason: reason,
    })
  },

  reset: () => {
    soundManager.stopLoop()
    set(initialState)
  },

  toggleMinimize: () => set((state) => ({ isMinimized: !state.isMinimized })),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleCamera: () => set((state) => ({ isCameraOff: !state.isCameraOff })),
}))

// Selector hooks — use these in components to avoid subscribing to the whole store
export const useCallStatus = () => useVideoCallStore((state) => state.status)

export const useIsInCall = () =>
  useVideoCallStore((state) =>
    state.status === 'initiating' ||
    state.status === 'ringing' ||
    state.status === 'connecting' ||
    state.status === 'connected'
  )

export default useVideoCallStore
