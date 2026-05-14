import { FC, useEffect, useRef, useState } from 'react'
import DailyIframe, { DailyCall } from '@daily-co/daily-js'

export interface DailyVideoPlayerProps {
  /** Daily room URL (e.g. https://<team>.daily.co/<room>) */
  roomUrl: string
  /** Meeting token for the local participant */
  token?: string | null
  /** Mute / camera state driven by the parent so controls stay in sync */
  isMuted?: boolean
  isCameraOff?: boolean
  /** Show Daily's built-in Leave button. Off by default — we usually render our own. */
  showLeaveButton?: boolean
  showFullscreenButton?: boolean
  /** Fires once the local user has successfully joined the meeting */
  onJoined?: () => void
  /** Fires if the remote (or local) user leaves, or Daily reports an error */
  onLeft?: () => void
  onError?: (message: string) => void
  /** Tailwind classes for the outer container */
  className?: string
}

/**
 * Shared Daily.co iframe wrapper.
 *
 * Lifecycle contract:
 *  - The iframe is created once when `roomUrl` becomes available.
 *  - It is destroyed only when the component unmounts OR when `roomUrl` changes.
 *  - Mute / camera toggles route through refs instead of recreating the iframe.
 *
 * This replaces the two ad-hoc implementations in VideoRoom and VideoConsultationPage.
 */
const DailyVideoPlayer: FC<DailyVideoPlayerProps> = ({
  roomUrl,
  token,
  isMuted = false,
  isCameraOff = false,
  showLeaveButton = false,
  showFullscreenButton = true,
  onJoined,
  onLeft,
  onError,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const callRef = useRef<DailyCall | null>(null)
  const [isJoining, setIsJoining] = useState(true)

  // Keep callback refs fresh without resetting the iframe effect
  const onJoinedRef = useRef(onJoined)
  const onLeftRef = useRef(onLeft)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onJoinedRef.current = onJoined
    onLeftRef.current = onLeft
    onErrorRef.current = onError
  }, [onJoined, onLeft, onError])

  // Create the iframe once the room URL is known
  useEffect(() => {
    if (!roomUrl || !containerRef.current) return

    let cancelled = false
    setIsJoining(true)

    // daily-js enforces a singleton per page — only one DailyIframe call
    // object can exist at a time. React's StrictMode double-invokes effects
    // in development, so the cleanup from the first run may not have
    // finished destroying its instance before this second run tries to
    // create a new one. Sweep up any survivor before calling createFrame
    // so we never trip the "Duplicate DailyIframe instances" guard.
    const existing = (DailyIframe as any).getCallInstance?.()
    if (existing) {
      try {
        existing.destroy()
      } catch {
        /* ignore — best-effort cleanup */
      }
    }

    const call = DailyIframe.createFrame(containerRef.current, {
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: '0',
      },
      showLeaveButton,
      showFullscreenButton,
    })
    callRef.current = call

    call.on('joined-meeting', () => {
      if (cancelled) return
      setIsJoining(false)
      onJoinedRef.current?.()
    })

    call.on('left-meeting', () => {
      if (cancelled) return
      onLeftRef.current?.()
    })

    call.on('participant-left', () => {
      // If the other participant leaves, bubble up so the parent can end the call
      if (cancelled) return
      onLeftRef.current?.()
    })

    call.on('error', (e: any) => {
      if (cancelled) return
      const message =
        (e && (e.errorMsg || e.message)) || 'A video call error occurred'
      onErrorRef.current?.(message)
    })

    call
      .join({ url: roomUrl, token: token || undefined })
      .catch((err: any) => {
        if (cancelled) return
        const message = err?.message || 'Failed to join the video call'
        onErrorRef.current?.(message)
        setIsJoining(false)
      })

    return () => {
      cancelled = true
      const c = callRef.current
      callRef.current = null
      if (c) {
        // Must destroy synchronously so the next effect run (e.g. StrictMode
        // double-mount, or a roomUrl change) doesn't collide with the
        // outgoing instance. The old code waited for `leave()` to resolve
        // inside `.finally()` and the second mount fired its createFrame
        // before destroy ran — that's the "Duplicate DailyIframe" crash.
        // `destroy()` handles the leave internally, so calling it directly
        // is safe; we still fire leave() first so server-side participant
        // state updates promptly, but don't await it.
        try {
          c.leave()
        } catch {
          /* ignore */
        }
        try {
          c.destroy()
        } catch {
          /* ignore */
        }
      }
    }
    // roomUrl+token together uniquely identify a room session — re-create if either changes
  }, [roomUrl, token, showLeaveButton, showFullscreenButton])

  // Sync mute state without recreating the iframe
  useEffect(() => {
    const c = callRef.current
    if (!c) return
    try {
      c.setLocalAudio(!isMuted)
    } catch {
      /* ignore — call may not be joined yet */
    }
  }, [isMuted])

  useEffect(() => {
    const c = callRef.current
    if (!c) return
    try {
      c.setLocalVideo(!isCameraOff)
    } catch {
      /* ignore */
    }
  }, [isCameraOff])

  return (
    <div className={className ?? 'w-full h-full relative'}>
      <div ref={containerRef} className="w-full h-full" />
      {isJoining && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 pointer-events-none">
          <div className="flex flex-col items-center text-white">
            <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin mb-2" />
            <p className="text-sm font-medium">Connecting...</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default DailyVideoPlayer
