import { useEffect, useMemo } from 'react'
import { useVideoCallStore } from '@/stores/videoCallStore'
import socketService from '@/services/socketService'

/**
 * Subscribe to a chat's video-room state and expose `start | join | leave`
 * actions for the Start/Join CTA in `ChatTab`.
 *
 * Behavior:
 *  - On mount: register a `call:room:state` listener (per chatId) and
 *    poll the server once so the CTA shows the right label even when
 *    we just opened the page mid-call.
 *  - `start()` and `join()` both call the same server event
 *    (`call:room:ensure`) — Daily rooms are shared, the only difference
 *    is whether someone's already in.
 *  - The `call:room:ready` ack — which carries the per-user meeting
 *    token — is handled by `VideoCallProvider` so callers don't have
 *    to wire that themselves.
 */
export function useRoomCall(chatId: string | null | undefined) {
  const roomStatusByChat = useVideoCallStore((s) => s.roomStatusByChat)
  const setRoomStatus = useVideoCallStore((s) => s.setRoomStatus)
  const beginJoin = useVideoCallStore((s) => s.beginJoin)
  const status = useVideoCallStore((s) => s.status)
  const activeChatId = useVideoCallStore((s) => s.referenceId)

  // Register listener + initial status poll.
  useEffect(() => {
    if (!chatId) return
    // Make sure the socket is up.
    socketService.connect()

    const unsub = socketService.onCallRoomState((evt) => {
      if (evt.chatId !== chatId) return
      setRoomStatus(chatId, {
        isActive: evt.isActive,
        callId: evt.callId,
        mediaType: evt.mediaType,
        startedBy: evt.startedBy,
        participantCount: evt.participantCount,
      })
    })

    // Initial poll — server replies with one `call:room:state` event
    // targeting just this socket so the CTA is correct before any
    // peer changes the state.
    socketService.pollRoomStatus(chatId)

    return () => {
      unsub()
    }
  }, [chatId, setRoomStatus])

  const status_ = chatId ? roomStatusByChat[chatId] : undefined
  const isActiveRoom = !!status_?.isActive
  // Is THIS user already in the local Daily room? `referenceId` is set
  // to the chatId while the call is in progress.
  const localUserInRoom = activeChatId === chatId && (status === 'connecting' || status === 'connected')

  return useMemo(
    () => ({
      /** True when at least one participant is in the Daily room. */
      isActive: isActiveRoom,
      /** True when the LOCAL user is the one currently in the room. */
      isJoined: localUserInRoom,
      /** Who started the call (userId). */
      startedBy: status_?.startedBy ?? null,
      /** Participant count from the server. Includes the local user once they're joined. */
      participantCount: status_?.participantCount ?? 0,
      /** 'audio' or 'video' — preserved across joins. */
      mediaType: status_?.mediaType ?? 'video',

      /**
       * Start a new room (no one is in it yet) or join the active one.
       * Both code paths emit `call:room:ensure`; the server figures out
       * which case applies and replies with `call:room:ready` carrying
       * the room URL + per-user token.
       */
      start(mediaType: 'audio' | 'video' = 'video') {
        if (!chatId) return
        beginJoin(chatId)
        socketService.ensureCallRoom({ chatId, callType: 'chat', mediaType })
      },
      join() {
        if (!chatId) return
        beginJoin(chatId)
        socketService.ensureCallRoom({
          chatId,
          callType: 'chat',
          mediaType: status_?.mediaType ?? 'video',
        })
      },

      /**
       * Leave the room. The actual `call:room:left` socket emit is
       * fired from `DailyVideoPlayer.onLeftMeeting` so the server only
       * decrements the counter when the iframe actually tears down.
       * Callers use this to programmatically hide the video UI.
       */
      leave() {
        // The DailyVideoPlayer's lifecycle handles the server notify
        // when the iframe unmounts; we just reset the local store here
        // for the CTA to flip back immediately.
        useVideoCallStore.getState().callRoomLeft()
      },
    }),
    [chatId, beginJoin, isActiveRoom, localUserInRoom, status_],
  )
}

export default useRoomCall
