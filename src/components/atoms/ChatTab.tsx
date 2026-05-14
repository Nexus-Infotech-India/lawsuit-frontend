import { FC, useEffect, useState, useRef, useCallback } from 'react'
import { Phone, Video, X, Paperclip, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { chatApi, casesApi, storageApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import socketService, { ChatMessage, ChatDocument } from '@/services/socketService'
import { pickCloudinaryResourceType } from '@/utils/cloudinaryUpload'
import { useVideoCall } from '@/hooks/useVideoCall'
import { useVideoCallStore } from '@/stores/videoCallStore'
import { useRoomCall } from '@/hooks/useRoomCall'
import type { CallParticipant } from '@/types/video'

interface Message {
  id: string
  text: string
  senderId: string
  createdAt: string
  senderName?: string
  isRead?: boolean
  readAt?: string | null
  /**
   * Attached documents. `id` may be a synthetic `temp-…` string while the
   * upload is in flight — those entries are replaced when the socket / send
   * response delivers the real Document rows.
   */
  documents?: ChatDocument[]
}

/**
 * Best-effort upload-size guard. The server doesn't enforce a limit but
 * Cloudinary free tier rejects >10 MB single-files. Keep this in sync with
 * the mobile app's `ChatTab.tsx` `MAX_ATTACHMENT_MB`.
 */
const MAX_ATTACHMENT_MB = 10
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024

/**
 * Normalize raw message rows (from `getMessages`, the socket, or the
 * send response) into the local `Message` shape. Kept as a single
 * function so the same logic applies everywhere and we don't lose
 * documents on one of the three paths the way the old code did.
 */
function toMessage(raw: any, fallbackSenderId?: string): Message {
  // Coerce the documents array. Server returns `documents: Document[]`
  // (the rich relation); legacy code may emit `attachments: string[]`.
  // We prefer the former and synthesise minimal docs from the latter so
  // the UI doesn't have to branch.
  const documents: ChatDocument[] | undefined = Array.isArray(raw?.documents) && raw.documents.length
    ? raw.documents.map((d: any) => ({
        id: String(d.id),
        filename: d.filename ?? null,
        mimeType: d.mimeType ?? null,
        url: String(d.url ?? d.fileUrl ?? ''),
        size: typeof d.size === 'number' ? d.size : null,
      }))
    : Array.isArray(raw?.attachments) && raw.attachments.length
      ? raw.attachments.map((url: string, i: number) => ({
          id: `legacy-${i}-${url}`,
          filename: url.split('/').pop() || 'attachment',
          mimeType: null,
          url,
          size: null,
        }))
      : undefined

  return {
    id: String(raw?.id ?? ''),
    text: raw?.text || '',
    senderId: String(raw?.senderId || raw?.userId || raw?.user?.id || fallbackSenderId || ''),
    createdAt: raw?.createdAt || raw?.created_at || new Date().toISOString(),
    senderName: raw?.senderName || raw?.user?.name || raw?.sender?.name,
    isRead: raw?.isRead ?? false,
    readAt: raw?.readAt || null,
    documents,
  }
}

interface Participant {
  id: string
  name: string
  avatarUrl?: string
}

interface ChatTabProps {
  chatId?: string
  onClose?: () => void
  caseId?: string
  /**
   * When true the component renders without modal chrome — no body-scroll
   * lock, no fixed positioning, no Close button. Used by the unified two-pane
   * chat page (`ChatListPage`). When false (default) it behaves like a modal
   * widget (legacy usage).
   */
  inline?: boolean
}

/**
 * Renders a single conversation: header (with online status + audio/video
 * call buttons), scrollable message list, and a send input.
 *
 * `inline` mode strips the modal chrome so this can be embedded as the right
 * pane of a WhatsApp-style two-pane layout.
 */
const ChatTab: FC<ChatTabProps> = ({ chatId: propChatId, onClose, caseId, inline = false }) => {
  const [activeChatId, setActiveChatId] = useState<string | null>(propChatId || null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [otherUser, setOtherUser] = useState<Participant | null>(null)
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Transient inline error (failed upload, oversized file, etc.). Distinct
  // from `error` because that one replaces the whole pane on fatal init
  // failures — we don't want a 10MB-too-big toast to wipe the conversation.
  const [transientError, setTransientError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const isFirstLoad = useRef(true)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Single hidden <input type="file"> driven by the paperclip button. We use
  // a ref instead of letting the user click the input directly so the file
  // picker can be triggered from a styled button.
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const authUserId = useAuthStore((s) => s.user?.id)
  const authUserRole = useAuthStore((s) => s.user?.role)
  const { isInCall } = useVideoCall()
  const navigate = useNavigate()

  // Shared-room video-call state for THIS chat. Drives the
  // "Start video call" / "Join video call" CTA in the header. The hook
  // also handles the initial poll so the label is correct on mount.
  const roomCall = useRoomCall(activeChatId)

  // Reset state when the chatId changes (e.g. switching conversations in the
  // two-pane layout). Without this the new conversation flashes the previous
  // conversation's messages while loading.
  useEffect(() => {
    setActiveChatId(propChatId || null)
    setMessages([])
    setOtherUser(null)
    setIsOtherUserOnline(false)
    setIsTyping(false)
    setTypingUser(null)
    setError(null)
    setTransientError(null)
    setUploading(false)
    isFirstLoad.current = true
  }, [propChatId])

  // Prevent background scrolling while modal is open — only when used as a
  // modal. In inline mode the page owns scroll behavior.
  useEffect(() => {
    if (inline) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow || ''
    }
  }, [inline])

  // Initialize chat - if caseId is provided but no chatId, create/get chat for that case
  useEffect(() => {
    // If we already have a chatId from props, use it
    if (propChatId) {
      setActiveChatId(propChatId)
      return
    }

    // If we have a caseId, we need to get/create a chat for this case
    if (caseId && !activeChatId) {
      const initChat = async () => {
        setInitializing(true)
        setError(null)
        try {
          // First, get case details to find the other party
          const caseRes = await casesApi.getById(caseId)
          const caseData = (caseRes as any).data?.case ?? (caseRes as any).data?.data ?? (caseRes as any).data ?? caseRes

          // Determine the other user (client or lawyer depending on current user)
          let otherUserId: string | null = null
          if (caseData.clientId && caseData.clientId !== authUserId) {
            otherUserId = caseData.clientId
          } else if (caseData.lawyerId && caseData.lawyerId !== authUserId) {
            otherUserId = caseData.lawyerId
          }

          if (!otherUserId) {
            setError('Could not determine chat participant')
            setInitializing(false)
            return
          }

          // Create or get existing chat for this case
          const chatRes = await chatApi.createChat({ otherUserId, caseId })
          const chatData = (chatRes as any).data ?? chatRes
          const chat = chatData.chat ?? chatData

          if (chat?.id) {
            setActiveChatId(chat.id)
          } else {
            setError('Failed to initialize chat')
          }
        } catch (err: any) {
          console.error('Failed to initialize chat', err)
          setError(err?.response?.data?.error || err?.message || 'Failed to initialize chat')
        } finally {
          setInitializing(false)
        }
      }
      initChat()
    }
  }, [propChatId, caseId, authUserId, activeChatId])

  // Connect to socket and join chat room
  useEffect(() => {
    if (!activeChatId) return

    // Connect socket
    const socket = socketService.connect()
    if (socket) {
      socketService.joinChat(activeChatId)
    }

    // Listen for new messages
    const unsubMessage = socketService.onMessage((msg: ChatMessage) => {
      if (msg.chatId === activeChatId) {
        setMessages((prev) => {
          // Avoid duplicates AND reconcile an optimistic temp-id message with
          // its server-confirmed twin. We match by `(senderId, text, ~1s)`.
          if (prev.some((m) => m.id === msg.id)) return prev
          const replaced = prev.map((m) => {
            if (
              m.id.startsWith('temp-') &&
              m.senderId === msg.senderId &&
              (m.text || '') === (msg.text || '') &&
              Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 5000
            ) {
              return toMessage(msg)
            }
            return m
          })
          if (replaced.some((m) => m.id === msg.id)) return replaced
          return [...replaced, toMessage(msg)]
        })
        // Mark as read if it's not our message
        if (msg.senderId !== authUserId) {
          socketService.markMessageRead(activeChatId, msg.id)
        }
      }
    })

    // Listen for typing events
    const unsubTypingStart = socketService.onTypingStart((data) => {
      if (data.user.id !== authUserId) {
        setIsTyping(true)
        setTypingUser(data.user.name || 'Someone')
      }
    })

    const unsubTypingStop = socketService.onTypingStop((data) => {
      if (data.user.id !== authUserId) {
        setIsTyping(false)
        setTypingUser(null)
      }
    })

    // Listen for read receipts
    const unsubReadReceipt = socketService.onReadReceipt((data) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId ? { ...m, isRead: true, readAt: data.readAt } : m
        )
      )
    })

    // Listen for online status updates
    const unsubOnlineStatus = socketService.onOnlineStatusUpdate((data) => {
      if (otherUser && data.usersOnline.includes(otherUser.id)) {
        setIsOtherUserOnline(true)
      } else if (otherUser) {
        setIsOtherUserOnline(false)
      }
    })

    // Listen for user status changes
    const unsubUserStatus = socketService.onUserStatusChange((data) => {
      if (otherUser && data.userId === otherUser.id) {
        setIsOtherUserOnline(data.online)
      }
    })

    return () => {
      unsubMessage()
      unsubTypingStart()
      unsubTypingStop()
      unsubReadReceipt()
      unsubOnlineStatus()
      unsubUserStatus()
      socketService.leaveChat()
    }
  }, [activeChatId, authUserId, otherUser])

  // Load participants
  useEffect(() => {
    if (!activeChatId) return
    let mounted = true

    const loadParticipants = async () => {
      try {
        const res = await chatApi.getParticipants(activeChatId)
        const data = (res as any).data ?? res
        const participantsList = data.participants || data || []
        if (mounted) {
          setParticipants(participantsList)
          // Find the other user (not the current user)
          const other = participantsList.find((p: Participant) => p.id !== authUserId)
          if (other) {
            setOtherUser(other)
            setIsOtherUserOnline(socketService.isUserOnline(other.id))
          }
        }
      } catch (err) {
        console.error('Failed to load participants', err)
      }
    }

    loadParticipants()
    return () => {
      mounted = false
    }
  }, [activeChatId, authUserId])

  // Load messages
  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!activeChatId) return
      setLoading(true)
      try {
        const res = await chatApi.getMessages(activeChatId)
        const data = (res as any).data ?? res
        const msgsRaw = Array.isArray(data) ? data : data.items || data.messages || data.data || []
        const normalized = msgsRaw.map((m: any) => toMessage(m))
        // sort ascending (oldest first)
        normalized.sort((a: Message, b: Message) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        if (mounted) {
          setMessages(normalized)
          // Mark unread messages from others as read
          normalized.forEach((m: Message) => {
            if (m.senderId !== authUserId && !m.isRead) {
              socketService.markMessageRead(activeChatId, m.id)
            }
          })
        }
      } catch (err) {
        console.error('Failed to load messages', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [activeChatId, authUserId])

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!activeChatId) return
    socketService.startTyping(activeChatId)

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      socketService.stopTyping(activeChatId)
    }, 2000)
  }, [activeChatId])

  const send = async () => {
    if (!text.trim() || !activeChatId) return

    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    socketService.stopTyping(activeChatId)

    const messageText = text.trim()
    setText('') // Clear immediately for better UX

    try {
      // Send via API (this stores in DB and emits via socket)
      const res = await chatApi.sendMessage(activeChatId, { text: messageText })
      const data = (res as any).data ?? res
      const msg = data.message ?? data

      if (msg) {
        setMessages((prev) => {
          // Avoid duplicates (socket might have already added it)
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, toMessage(msg, authUserId)]
        })
      }
    } catch (err) {
      console.error('Failed to send message', err)
      setText(messageText) // Restore text on error
    }
  }

  // ── File attachment ───────────────────────────────────────────────
  // Uploads the picked file to Cloudinary using the server's signed-upload
  // endpoint, then calls `chatApi.sendMessage` with both `attachments` (the
  // legacy URL array the server still accepts) and `attachmentMetas` (so the
  // server can mint a typed `Document` row per file — that's what powers
  // the doc chips, OCR, and AI-summary surfaces).
  //
  // Behaviour mirrors `lawsuit-app/src/components/ChatTab.tsx::handleAttach`
  // so file uploads from web and mobile land identically in the DB.
  const handlePickFile = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so re-picking the same file fires onChange again.
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file || !activeChatId) return

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setTransientError(`File too large. Max ${MAX_ATTACHMENT_MB} MB.`)
      return
    }

    setTransientError(null)
    setUploading(true)

    // Optimistic message — synthetic temp id so we can reconcile when the
    // real message arrives via socket / send-response.
    const tempId = `temp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      text: '',
      senderId: authUserId || '',
      createdAt: new Date().toISOString(),
      isRead: false,
      readAt: null,
      documents: [
        {
          id: `temp-doc-${Date.now()}`,
          filename: file.name,
          mimeType: file.type || null,
          url: '',
          size: file.size,
        },
      ],
    }
    setMessages((prev) => [...prev, optimistic])

    try {
      const sigRes = await storageApi.getSignature('chat-attachments')
      const sig = (sigRes as any)?.data ?? sigRes
      const { cloudName, apiKey, signature, timestamp, folder } = sig
      if (!cloudName || !apiKey || !signature || !timestamp) {
        throw new Error('Upload signature missing required fields')
      }

      // Cloudinary endpoint depends on whether we're uploading an image
      // (auto-thumbnail, transformations available) or a raw document.
      // PDFs ride along with images on `/image/upload` so they're
      // served with `Content-Type: application/pdf` and render inline
      // when the recipient clicks the chip. Plain `raw/upload` would
      // store the file but every preview attempt would fail with
      // "Failed to load PDF document".
      const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${pickCloudinaryResourceType(file.type)}/upload`

      const fd = new FormData()
      fd.append('file', file)
      fd.append('api_key', apiKey)
      fd.append('timestamp', String(timestamp))
      fd.append('signature', signature)
      if (folder) fd.append('folder', folder)

      const uploadRes = await fetch(endpoint, { method: 'POST', body: fd })
      if (!uploadRes.ok) {
        const body = await uploadRes.text().catch(() => '')
        throw new Error(`Cloudinary ${uploadRes.status}: ${body.slice(0, 200)}`)
      }
      const uploaded = await uploadRes.json()
      const url: string = uploaded.secure_url || uploaded.url
      if (!url) throw new Error('Upload succeeded but no URL was returned')

      // Persist the message with the real URL + meta.
      const sendRes = await chatApi.sendMessage(activeChatId, {
        text: '',
        attachments: [url],
        attachmentMetas: [
          {
            url,
            filename: file.name,
            mimeType: file.type || undefined,
            size: file.size,
          },
        ],
      })
      const data = (sendRes as any).data ?? sendRes
      const realMsg = data.message ?? data
      if (realMsg) {
        setMessages((prev) => {
          // Replace the optimistic placeholder; if the socket already
          // delivered the real message, just drop the placeholder.
          const next = prev.filter((m) => m.id !== tempId)
          if (next.some((m) => m.id === realMsg.id)) return next
          return [...next, toMessage(realMsg, authUserId)]
        })
      }
    } catch (err: any) {
      console.error('Failed to upload attachment', err)
      setTransientError(err?.message || 'Failed to upload file')
      // Roll back the optimistic placeholder on failure.
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } finally {
      setUploading(false)
    }
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const behavior: ScrollBehavior = isFirstLoad.current ? 'auto' : 'smooth'
    const t = setTimeout(() => {
      try {
        el.scrollTo({ top: el.scrollHeight, behavior })
      } catch (e) {
        el.scrollTop = el.scrollHeight
      }
      isFirstLoad.current = false
    }, 20)
    return () => clearTimeout(t)
  }, [messages.length])

  // Get read status for the last message sent by current user
  const getReadStatus = (msg: Message): 'sent' | 'delivered' | 'read' | null => {
    if (msg.senderId !== authUserId) return null
    if (msg.isRead) return 'read'
    return 'sent'
  }

  // Note: legacy `startCall(mode)` (ring-style call:initiate flow) was
  // removed when this chat tab switched to the shared-room flow via
  // `useRoomCall`. The audio/video distinction now lives in the
  // `useRoomCall.start(mediaType)` argument; the CTA button below
  // calls it directly.

  // ── Render ─────────────────────────────────────────────────────────
  // Inline mode skips the modal wrapper styles (rounded shadow card) so the
  // chat fills its parent pane edge-to-edge.
  const containerClass = inline
    ? 'w-full h-full bg-white flex flex-col'
    : 'w-full h-full bg-white rounded-lg shadow-lg flex flex-col'

  // Show loading state while initializing chat
  if (initializing) {
    return (
      <div className={`${containerClass} items-center justify-center`}>
        <div className="text-gray-500">Initializing chat...</div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className={`${containerClass} items-center justify-center gap-4`}>
        <div className="text-red-500">{error}</div>
        {onClose && !inline && (
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">
            Close
          </button>
        )}
      </div>
    )
  }

  // Show message if no chat is available
  if (!activeChatId && !caseId && !propChatId) {
    return (
      <div className={`${containerClass} items-center justify-center gap-4`}>
        <div className="text-gray-500">No chat selected</div>
        {onClose && !inline && (
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">
            Close
          </button>
        )}
      </div>
    )
  }

  const initial = (otherUser?.name || '?').charAt(0).toUpperCase()

  return (
    <div className={containerClass}>
      {/* Header with avatar, online status, and call buttons */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-3 min-w-0">
          {otherUser?.avatarUrl ? (
            <img
              src={otherUser.avatarUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover bg-gray-100 flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-base font-semibold flex-shrink-0">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 truncate">
              {otherUser?.name || 'Chat'}
            </div>
            {otherUser && (
              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOtherUserOnline ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                <span className="text-gray-500">{isOtherUserOnline ? 'Online' : 'Offline'}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {otherUser && activeChatId && (
            // Single Start/Join CTA. The label flips based on
            // `call:room:state` broadcasts from the server — the moment
            // the other party clicks "Start" their click triggers a
            // state broadcast and this button switches to "Join". This
            // is the Daily.co-native flow the user asked for: one
            // shared room per chat, no ringing / accept / decline.
            <button
              onClick={() => {
                if (roomCall.isJoined) return
                if (roomCall.isActive) roomCall.join()
                else roomCall.start('video')
              }}
              disabled={isInCall || roomCall.isJoined}
              title={
                roomCall.isJoined
                  ? 'You are in the call'
                  : roomCall.isActive
                    ? 'Join the ongoing video call'
                    : 'Start a video call'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition ${
                roomCall.isJoined
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  : roomCall.isActive
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 animate-pulse'
                    : 'bg-primary text-white hover:bg-primary/90'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-label={roomCall.isActive ? 'Join video call' : 'Start video call'}
            >
              <Video className="w-4 h-4" />
              {roomCall.isJoined
                ? 'In call'
                : roomCall.isActive
                  ? `Join video call${roomCall.participantCount ? ` (${roomCall.participantCount})` : ''}`
                  : 'Start video call'}
            </button>
          )}
          {onClose && !inline && (
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-gray-100 text-gray-500"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 h-full min-h-0 flex flex-col">
        {/* Messages Area */}
        <div ref={messagesRef} className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4">
          {loading ? (
            <div className="text-sm text-gray-500">Loading messages…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8">No messages yet. Start a conversation!</div>
          ) : (
            messages.map((m) => {
              const isMine = !!authUserId && m.senderId === authUserId
              const readStatus = getReadStatus(m)
              const docs = m.documents ?? []
              const hasText = !!m.text?.trim()
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[70%] ${
                      isMine ? 'bg-primary text-white' : 'bg-gray-100 text-gray-800'
                    } px-4 py-2 rounded-lg`}
                  >
                    {hasText && (
                      <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                    )}
                    {docs.length > 0 && (
                      <div className={`flex flex-col gap-1.5 ${hasText ? 'mt-2' : ''}`}>
                        {docs.map((d) => {
                          const isImg = (d.mimeType || '').startsWith('image/')
                          const isUploading = d.id.startsWith('temp-doc-') || !d.url
                          const isDeepLinkable = !d.id.startsWith('temp-doc-') && !d.id.startsWith('legacy-') && !!d.id
                          // Route the click into the Document AI workspace
                          // when possible (OCR + summary + Q&A live there).
                          // The path prefix is ROLE-AWARE: a lawyer clicking
                          // a chip used to be bounced to /app/document-ai
                          // which their layout doesn't mount — they ended
                          // up on the lawyer dashboard instead. Now we send
                          // each role to their own document-ai route.
                          // Falls back to opening the raw file in a new tab
                          // for legacy/URL-only docs or when the doc id
                          // can't be deep-linked.
                          const onOpen = () => {
                            if (isUploading) return
                            if (isDeepLinkable) {
                              const docAiBase =
                                authUserRole === 'LAWYER' ? '/lawyer/document-ai'
                                  : authUserRole === 'ORGANIZATION' ? '/organization/document-ai'
                                    : authUserRole === 'ADMIN' ? '/admin/document-ai'
                                      : authUserRole === 'COURT_ADMIN' ? '/court-admin/document-ai'
                                        : '/app/document-ai'
                              navigate(`${docAiBase}?documentId=${d.id}`)
                              return
                            }
                            if (d.url) {
                              window.open(d.url, '_blank', 'noopener,noreferrer')
                            }
                          }
                          return (
                            // Two affordances on every chip:
                            //   • Main button → opens Document AI (extract /
                            //     summarise / Q&A) when the doc is real,
                            //     falls back to the raw file otherwise.
                            //   • Secondary "↗" link → ALWAYS opens the
                            //     raw file in a new tab so a user without
                            //     Document AI access still has a way to
                            //     read the attachment.
                            <div
                              key={d.id}
                              className={`flex items-center gap-1 rounded-md text-xs
                                ${isMine ? 'bg-white/15' : 'bg-white border border-gray-200'}
                                ${isUploading ? 'opacity-70' : ''}
                              `}
                            >
                              <button
                                type="button"
                                onClick={onOpen}
                                disabled={isUploading}
                                className={`flex-1 flex items-center gap-2 px-2 py-1.5 text-left rounded-md
                                  ${isUploading ? 'cursor-wait' : 'cursor-pointer hover:bg-black/5'}
                                `}
                                title={
                                  isUploading
                                    ? 'Uploading…'
                                    : isDeepLinkable
                                      ? 'Open in Document AI (extract / summarise / Q&A)'
                                      : 'Open file'
                                }
                              >
                                {isUploading ? (
                                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                                ) : isImg ? (
                                  <ImageIcon className="w-4 h-4 flex-shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 flex-shrink-0" />
                                )}
                                <span className="truncate max-w-[180px]">
                                  {d.filename || (d.url ? d.url.split('/').pop() : 'Attachment')}
                                </span>
                                {isUploading && (
                                  <span className={isMine ? 'text-white/80' : 'text-gray-500'}>
                                    Uploading…
                                  </span>
                                )}
                              </button>
                              {/* Always-available raw-file fallback. Hidden
                                  while the upload is in flight (URL is
                                  empty) and for legacy / temp rows. */}
                              {!isUploading && d.url && (
                                <a
                                  href={d.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className={`flex-shrink-0 px-1.5 py-1.5 rounded-md
                                    ${isMine ? 'text-white/90 hover:bg-white/20' : 'text-gray-500 hover:bg-gray-100'}
                                  `}
                                  title="Open original file in a new tab"
                                  aria-label="Open file"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path d="M14 3h7v7M10 14L21 3M21 14v7H3V3h7" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </a>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className="text-xs opacity-70 mt-1 flex items-center gap-2">
                      <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {/* Read receipt indicator */}
                      {isMine && readStatus && (
                        <span className="flex items-center">
                          {readStatus === 'read' ? (
                            <span title={`Read at ${m.readAt ? new Date(m.readAt).toLocaleString() : ''}`}>
                              ✓✓
                            </span>
                          ) : (
                            <span title="Sent">✓</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          {/* Typing indicator */}
          {isTyping && typingUser && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>•</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>•</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>•</span>
              </div>
              <span>{typingUser} is typing...</span>
            </div>
          )}
        </div>

        {/* Transient error banner — failed upload, oversized file, etc.
            Sits above the input so it's easy to spot without bumping into
            the message list. Distinct from the fatal `error` state which
            replaces the whole pane on init failure. */}
        {transientError && (
          <div className="mb-2 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
            <span className="truncate">{transientError}</span>
            <button
              onClick={() => setTransientError(null)}
              className="text-red-700 hover:text-red-900 font-medium"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="flex items-center gap-2 flex-none">
          {/* Hidden file input — driven by the paperclip button. Accepts a
              accepts anything — the platform stores whatever the user
              picks; the recipient can preview images and PDFs inline and
              download everything else. */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelected}
          />
          <button
            type="button"
            onClick={handlePickFile}
            disabled={uploading || !activeChatId}
            title={uploading ? 'Uploading…' : 'Attach file'}
            className="p-2 rounded-full text-gray-500 hover:text-primary hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
            aria-label="Attach file"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </button>

          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              handleTyping()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Type a message..."
          />
          <button
            onClick={send}
            disabled={!text.trim()}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Send
          </button>
        </div>
      </div>
      {/* `participants` is read but not rendered — keep it referenced to silence
          unused-state TS warnings in strict builds. */}
      <span className="hidden" aria-hidden="true">{participants.length}</span>
    </div>
  )
}

export default ChatTab
