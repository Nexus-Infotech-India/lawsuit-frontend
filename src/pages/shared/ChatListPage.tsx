import { FC, useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare, Loader2, Search, RefreshCw, ChevronLeft } from 'lucide-react'
import { chatApi } from '@/services/api'
import { friendlyError } from '@/utils/errors'
import { unwrapList } from '@/utils/unwrap'
import { useAuthStore } from '@/stores/authStore'
import socketService from '@/services/socketService'
import ChatTab from '@/components/atoms/ChatTab'

interface Participant {
  id: string
  name?: string
  avatarUrl?: string | null
}

interface LastMessage {
  id?: string
  text?: string | null
  senderId?: string
  createdAt?: string
  attachments?: string[]
}

interface ChatRow {
  id: string
  caseId?: string | null
  case?: { id?: string; title?: string } | null
  participants?: Participant[]
  lastMessage?: LastMessage | null
  unreadCount?: number
  updatedAt?: string
}

const fmtRelative = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const diff = Math.max(0, now - d.getTime())
  const m = 60 * 1000
  const h = 60 * m
  const day = 24 * h
  if (diff < m) return 'now'
  if (diff < h) return `${Math.floor(diff / m)}m`
  if (diff < day) return `${Math.floor(diff / h)}h`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/**
 * WhatsApp-style unified chat page.
 *
 * Layout: a fixed-width left list of conversations (one row per counterpart,
 * latest message + unread badge) and a right pane that renders the selected
 * conversation inline via `<ChatTab inline />`. On narrow screens (`<md`)
 * only one of the two panes is visible at a time — selecting a row swaps
 * the list out for the conversation, and a back button restores the list.
 *
 * URL params drive deep-linking from anywhere in the app:
 *   • `?chatId=<id>` opens that chat
 *   • `?with=<otherUserId>[&caseId=<id>]` lazily creates / fetches the chat
 *     between the current user and `otherUserId` and opens it
 *   • `?appointmentId=<id>` opens the chat tied to that appointment (uses
 *     the dedicated `/chat/appointment/:id` endpoint that idempotently
 *     creates the row)
 *
 * The page is mounted at `/app/chats`, `/lawyer/chats`, `/organization/chats`
 * and `/admin/chats`. The server-side `chatApi.listChats` already returns
 * "what this user can see" based on the JWT, so the same page works for
 * every role.
 */
const ChatListPage: FC = () => {
  const [chats, setChats] = useState<ChatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [resolving, setResolving] = useState(false)
  const authUserId = useAuthStore((s) => s.user?.id)
  const [searchParams, setSearchParams] = useSearchParams()

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await chatApi.listChats()
      // The server returns `{ chats: [...] }` — passing 'chats' as the
      // candidate key makes the unwrap robust even if a future deploy
      // re-shapes the response to `{ items: [...] }` or a bare array.
      // Without this, the page silently rendered empty because
      // `unwrapList`'s default fallback chain doesn't include 'chats'.
      const rows = unwrapList<ChatRow>(res.data, 'chats')
      setChats(rows)
      return rows
    } catch (err) {
      setError(friendlyError(err, "We couldn't load your conversations."))
      return [] as ChatRow[]
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Refresh the list whenever a new message arrives anywhere — this is
  // cheap on the server (one query) and gives instant ordering updates,
  // which is closer to the mobile experience than per-row diff patches.
  useEffect(() => {
    const unsub = socketService.onMessage(() => {
      load()
    })
    return () => {
      unsub?.()
    }
  }, [load])

  // Deep-link resolution. Three modes — `chatId` opens directly, `with`
  // (optionally `caseId`) lazily creates/fetches the chat row, and
  // `appointmentId` hits the dedicated appointment-chat endpoint.
  useEffect(() => {
    const chatId = searchParams.get('chatId')
    const withUserId = searchParams.get('with')
    const caseId = searchParams.get('caseId')
    const appointmentId = searchParams.get('appointmentId')

    if (chatId) {
      setActiveChatId(chatId)
      return
    }

    if (appointmentId) {
      let cancelled = false
      setResolving(true)
      ;(async () => {
        try {
          const res = await chatApi.getOrCreateAppointmentChat(appointmentId)
          const data = (res as any).data ?? res
          const chat = data.chat ?? data
          if (!cancelled && chat?.id) {
            setActiveChatId(chat.id)
            // Replace the appointmentId in the URL with chatId so the
            // address bar reflects what's actually open and reload doesn't
            // re-resolve through the lookup.
            const next = new URLSearchParams(searchParams)
            next.delete('appointmentId')
            next.set('chatId', chat.id)
            setSearchParams(next, { replace: true })
            // List might not have this chat yet (first time touching it).
            load()
          }
        } catch (err) {
          if (!cancelled) {
            setError(friendlyError(err, "We couldn't open that conversation."))
          }
        } finally {
          if (!cancelled) setResolving(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }

    if (withUserId) {
      let cancelled = false
      setResolving(true)
      ;(async () => {
        try {
          const res = await chatApi.createChat({
            otherUserId: withUserId,
            caseId: caseId || undefined,
          })
          const data = (res as any).data ?? res
          const chat = data.chat ?? data
          if (!cancelled && chat?.id) {
            setActiveChatId(chat.id)
            const next = new URLSearchParams(searchParams)
            next.delete('with')
            next.delete('caseId')
            next.set('chatId', chat.id)
            setSearchParams(next, { replace: true })
            load()
          }
        } catch (err) {
          if (!cancelled) {
            setError(friendlyError(err, "We couldn't open that conversation."))
          }
        } finally {
          if (!cancelled) setResolving(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }
  }, [searchParams, setSearchParams, load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => {
      const name = c.participants?.[0]?.name?.toLowerCase() || ''
      const last = c.lastMessage?.text?.toLowerCase() || ''
      const caseTitle = c.case?.title?.toLowerCase() || ''
      return name.includes(q) || last.includes(q) || caseTitle.includes(q)
    })
  }, [chats, query])

  const totalUnread = useMemo(
    () => chats.reduce((s, c) => s + (c.unreadCount ?? 0), 0),
    [chats],
  )

  const selectChat = (id: string) => {
    setActiveChatId(id)
    const next = new URLSearchParams(searchParams)
    next.set('chatId', id)
    setSearchParams(next, { replace: true })
  }

  const backToList = () => {
    setActiveChatId(null)
    const next = new URLSearchParams(searchParams)
    next.delete('chatId')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex h-[calc(100vh-130px)] bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      {/* ── Left pane: list ───────────────────────────────────────── */}
      <aside
        className={`
          w-full md:w-[360px] md:flex-shrink-0 flex flex-col border-r border-gray-100
          ${activeChatId ? 'hidden md:flex' : 'flex'}
        `}
      >
        {/* List header */}
        <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-50 flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-gray-900 truncate">Chats</h1>
              {totalUnread > 0 && (
                <p className="text-xs text-indigo-600 font-medium">
                  {totalUnread} unread
                </p>
              )}
            </div>
          </div>
          <button
            onClick={load}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </header>

        {/* Search */}
        <div className="p-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or message…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>

        {error && (
          <div className="mx-3 mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* List body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <MessageSquare className="w-10 h-10 mx-auto text-gray-300" />
              <p className="mt-3 text-gray-700 font-medium">
                {query ? 'No matches.' : 'No conversations yet.'}
              </p>
              {!query && (
                <p className="text-xs text-gray-400 mt-1">
                  Chats appear when you book an appointment or share a case.
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((c) => {
                const other = c.participants?.[0]
                const initial = (other?.name || '?').charAt(0).toUpperCase()
                const last = c.lastMessage
                const isMine = last?.senderId && authUserId && last.senderId === authUserId
                const unread = c.unreadCount ?? 0
                const isActive = c.id === activeChatId
                const previewText =
                  last?.text?.trim() ||
                  (last?.attachments?.length
                    ? `📎 ${last.attachments.length} attachment(s)`
                    : 'Say hi 👋')

                return (
                  <li key={c.id}>
                    <button
                      onClick={() => selectChat(c.id)}
                      className={`
                        w-full text-left flex items-center gap-3 px-4 py-3
                        transition-colors
                        ${isActive
                          ? 'bg-indigo-50 hover:bg-indigo-50'
                          : 'hover:bg-gray-50 active:bg-gray-100'}
                      `}
                    >
                      {other?.avatarUrl ? (
                        <img
                          src={other.avatarUrl}
                          alt=""
                          className="w-12 h-12 rounded-full object-cover bg-gray-100 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-semibold flex-shrink-0">
                          {initial}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {other?.name || 'Unknown'}
                          </span>
                          <span className="text-[11px] text-gray-400 flex-shrink-0">
                            {fmtRelative(last?.createdAt || c.updatedAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span
                            className={`text-xs truncate ${unread > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
                          >
                            {isMine && <span className="text-gray-400 mr-1">You:</span>}
                            {previewText}
                          </span>
                          {unread > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold flex-shrink-0">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </div>
                        {c.case?.title && (
                          <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                            Case · {c.case.title}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Right pane: conversation ──────────────────────────────── */}
      <section
        className={`
          flex-1 min-w-0 flex flex-col bg-gray-50
          ${activeChatId ? 'flex' : 'hidden md:flex'}
        `}
      >
        {activeChatId ? (
          <>
            {/* Mobile-only back button bar */}
            <div className="md:hidden flex items-center px-2 py-2 border-b bg-white">
              <button
                onClick={backToList}
                className="p-2 rounded hover:bg-gray-100 text-gray-600"
                aria-label="Back to chat list"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">Back</span>
            </div>
            <div className="flex-1 min-h-0">
              <ChatTab inline chatId={activeChatId} />
            </div>
          </>
        ) : resolving ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Opening conversation…
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12 text-gray-500">
            <div className="p-4 rounded-full bg-indigo-50 mb-4">
              <MessageSquare className="w-10 h-10 text-indigo-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Your messages</h2>
            <p className="text-sm text-gray-500 max-w-sm">
              Select a conversation from the left to read messages, send a reply,
              or start an audio / video call.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

export default ChatListPage
