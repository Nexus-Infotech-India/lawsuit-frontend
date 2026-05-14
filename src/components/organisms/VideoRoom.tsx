import { FC, useEffect, useState } from 'react'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Minimize2,
  Maximize2,
  User,
} from 'lucide-react'
import { useVideoCall } from '@/hooks/useVideoCall'
import DailyVideoPlayer from '@/components/organisms/DailyVideoPlayer'
import socketService from '@/services/socketService'
import { useVideoCallStore } from '@/stores/videoCallStore'

interface VideoRoomProps {
  onClose?: () => void
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * In-app call UI. Rendered whenever status is connecting or connected.
 *
 * The outer wrapper switches class names based on isMinimized, but the
 * underlying DailyVideoPlayer stays mounted across the transition so the
 * iframe (and the actual media stream) is never torn down.
 */
const VideoRoom: FC<VideoRoomProps> = ({ onClose }) => {
  const {
    status,
    roomUrl,
    token,
    caller,
    callee,
    callType,
    isMinimized,
    isMuted,
    isCameraOff,
    endCall,
    toggleMinimize,
    toggleMute,
    toggleCamera,
    markConnected,
    getCallDuration,
  } = useVideoCall()

  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const callId = useVideoCallStore((s) => s.callId)

  // The other party on the call — whichever one isn't us
  const otherParticipant = caller || callee

  // Tick duration once we're connected
  useEffect(() => {
    if (status !== 'connected') return
    const interval = setInterval(() => {
      setCallDuration(getCallDuration())
    }, 1000)
    return () => clearInterval(interval)
  }, [status, getCallDuration])

  // Tell the server when this client actually enters / leaves the
  // Daily iframe. The server uses these signals to track participant
  // count for the room-state broadcast and to tear down the Daily
  // room when the last person leaves.
  const handleIframeJoined = () => {
    markConnected()
    if (callId) socketService.notifyRoomJoined(callId)
  }

  const handleIframeLeft = () => {
    // Note: `endCall('completed')` is preserved for the legacy ring
    // flow (so call history lands as COMPLETED). The shared-room
    // server tear-down happens on `call:room:left`.
    if (callId) socketService.notifyRoomLeft(callId)
    endCall('completed')
  }

  const handleEndCall = () => {
    if (callId) socketService.notifyRoomLeft(callId)
    endCall('completed')
    onClose?.()
  }

  // Defensive: don't render if we aren't actively in a call
  if (status !== 'connecting' && status !== 'connected') return null
  if (!roomUrl) return null

  const outerClass = isMinimized
    ? 'fixed bottom-4 right-4 z-[90] w-72 h-48 bg-gray-900 rounded-xl shadow-2xl overflow-hidden animate-scale-in'
    : 'fixed inset-0 z-[90] bg-gray-900 flex flex-col animate-fade-in'

  return (
    <div className={outerClass}>
      {!isMinimized && (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800">
          <div className="flex items-center gap-3">
            {otherParticipant?.avatar ? (
              <img
                src={otherParticipant.avatar}
                alt={otherParticipant.name}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <h2 className="text-white font-semibold">{otherParticipant?.name}</h2>
              <p className="text-gray-400 text-sm capitalize">
                {callType === 'chat' ? 'Chat Call' : 'Appointment Call'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-white text-sm bg-gray-700 px-3 py-1 rounded-full">
              {formatDuration(callDuration)}
            </span>
            <button
              onClick={toggleMinimize}
              className="p-2 rounded-full hover:bg-gray-700 transition"
              title="Minimize"
            >
              <Minimize2 className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Video surface — always mounted to keep the call alive */}
      <div className={isMinimized ? 'w-full h-full relative' : 'flex-1 relative'}>
        <DailyVideoPlayer
          roomUrl={roomUrl}
          token={token}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          onJoined={handleIframeJoined}
          onLeft={handleIframeLeft}
          onError={(msg) => setError(msg)}
          className="w-full h-full"
        />

        {error && (
          <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center px-4 text-center">
            <p className="text-red-400 mb-4 text-sm">{error}</p>
            <button
              onClick={handleEndCall}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm"
            >
              Close
            </button>
          </div>
        )}

        {isMinimized && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none">
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-2 min-w-0">
                {otherParticipant?.avatar ? (
                  <img
                    src={otherParticipant.avatar}
                    alt={otherParticipant.name}
                    className="w-6 h-6 rounded-full"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <User className="w-3 h-3 text-white" />
                  </div>
                )}
                <span className="text-white text-xs font-medium truncate">
                  {otherParticipant?.name}
                </span>
              </div>
              <span className="text-white text-xs bg-black/50 px-2 py-0.5 rounded">
                {formatDuration(callDuration)}
              </span>
            </div>

            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-auto">
              <button
                onClick={toggleMinimize}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition"
                title="Expand"
              >
                <Maximize2 className="w-4 h-4 text-white" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className={`p-2 rounded-full transition ${
                    isMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'
                  }`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <MicOff className="w-4 h-4 text-white" />
                  ) : (
                    <Mic className="w-4 h-4 text-white" />
                  )}
                </button>

                <button
                  onClick={handleEndCall}
                  className="p-2 rounded-full bg-red-500 hover:bg-red-600 transition"
                  title="End call"
                >
                  <PhoneOff className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!isMinimized && (
        <div className="px-4 py-4 bg-gray-800 flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`p-4 rounded-full transition ${
              isMuted
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <MicOff className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-white" />
            )}
          </button>

          <button
            onClick={toggleCamera}
            className={`p-4 rounded-full transition ${
              isCameraOff
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
            title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isCameraOff ? (
              <VideoOff className="w-6 h-6 text-white" />
            ) : (
              <Video className="w-6 h-6 text-white" />
            )}
          </button>

          <button
            onClick={handleEndCall}
            className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition"
            title="End call"
          >
            <PhoneOff className="w-6 h-6 text-white" />
          </button>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
      `}</style>
    </div>
  )
}

export default VideoRoom
