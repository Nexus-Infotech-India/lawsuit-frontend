import { FC, useEffect } from 'react'
import { useVideoCall } from '@/hooks/useVideoCall'
import IncomingCallModal from '@/components/molecules/IncomingCallModal'
import OutgoingCallModal from '@/components/molecules/OutgoingCallModal'
import VideoRoom from '@/components/organisms/VideoRoom'
import socketService from '@/services/socketService'
import { useVideoCallStore } from '@/stores/videoCallStore'

interface VideoCallProviderProps {
  children: React.ReactNode
}

/**
 * Mounts the in-app call UI for both flows:
 *
 *  Shared-room flow (preferred — used by ChatTab's "Start/Join video call"
 *  CTA): the user clicks the CTA → `useRoomCall.start()` flips the store
 *  to `connecting` and emits `call:room:ensure` → the server replies
 *  with `call:room:ready { callId, roomUrl, token, mediaType }`. We
 *  catch the reply here and write it onto the store so `VideoRoom`
 *  mounts the Daily iframe.
 *
 *  Legacy ring-style flow (mobile + appointment ConsultationPage):
 *  IncomingCallModal / OutgoingCallModal still render for callees /
 *  callers in the old `ringing` / `initiating` states.
 *
 * Must live inside the authenticated layout so the socket is connected.
 */
const VideoCallProvider: FC<VideoCallProviderProps> = ({ children }) => {
  const { status } = useVideoCall()
  const callRoomReady = useVideoCallStore((s) => s.callRoomReady)
  const setRoomStatus = useVideoCallStore((s) => s.setRoomStatus)

  useEffect(() => {
    socketService.connect()
  }, [])

  // Subscribe to room-flow events globally so the local user transitions
  // smoothly from "joining" (set by useRoomCall.start) → "connecting"
  // with the actual room URL + token the moment the server provisions
  // (or fetches) the room.
  useEffect(() => {
    const unsubReady = socketService.onCallRoomReady((evt) => {
      callRoomReady(evt)
    })
    // Also mirror server state changes into the per-chat status map.
    // useRoomCall registers a per-chat listener too; this one keeps a
    // single source of truth for cases where the chat page isn't
    // mounted (e.g. user opened a notification → went straight to the
    // call). chatId is required on the event payload so we can key it.
    const unsubState = socketService.onCallRoomState((evt) => {
      setRoomStatus(evt.chatId, {
        isActive: evt.isActive,
        callId: evt.callId,
        mediaType: evt.mediaType,
        startedBy: evt.startedBy,
        participantCount: evt.participantCount,
      })
    })
    return () => {
      unsubReady()
      unsubState()
    }
  }, [callRoomReady, setRoomStatus])

  const showRoom = status === 'connecting' || status === 'connected'

  return (
    <>
      {children}
      <IncomingCallModal />
      <OutgoingCallModal />
      {showRoom && <VideoRoom />}
    </>
  )
}

export default VideoCallProvider
