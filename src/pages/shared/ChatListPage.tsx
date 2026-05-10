import { FC, useEffect, useMemo, useState, useCallback } from 'react'
import { MessageSquare, Loader2, Search, RefreshCw } from 'lucide-react'
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
 * Standalone WhatsApp-style chat list for clients and lawyers.
 *
 * Mirrors the mobile app's `ChatListScreen`:
 * - Server-side rolled-up rows (one per counterpart, latest message + unread)
 * - Live updates via socket `chat:message:new` (re-fetches debounced)
 * - Tap row to open the existing `ChatTab` modal
 *
 * Mounted at `/app/chats` (Client) and `/lawyer/chats` (Lawyer) — same UI,
 * the underlying `chatApi.listChats` already returns "what this user can see"
 * based on JWT.
 */
const ChatListPage: FC = () => {
  const [chats, setChats] = useState<ChatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const authUserId = useAuthStore((s) => s.user?.id)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await chatApi.listChats()
      const rows = unwrapList<ChatRow>(res.data)
      setChats(rows)
    } catch (err) {
      setError(friendlyError(err, "We couldn't load your conversations."))
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

  return (
    <div className="space-y-4 max-w-3xl mx-auto px-4 sm:px-0">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-indigo-50 flex-shrink-0">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Chats</h1>
            <p className="text-xs sm:text-sm text-gray-500">
              {totalUnread > 0
                ? `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`
                : 'Your conversations across appointments and cases.'}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or message…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
          <MessageSquare className="w-10 h-10 mx-auto text-gray-300" />
          <p className="mt-3 text-gray-700 font-medium">
            {query ? 'No conversations match your search.' : 'No conversations yet.'}
          </p>
          {!query && (
            <p className="text-xs text-gray-400 mt-1">
              Chats appear automatically when you book an appointment or share a case.
            </p>
          )}
        </div>
      ) : (
        <ul className="bg-white border border-gray-100 rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {filtered.map((c) => {
            const other = c.participants?.[0]
            const initial = (other?.name || '?').charAt(0).toUpperCase()
            const last = c.lastMessage
            const isMine = last?.senderId && authUserId && last.senderId === authUserId
            const unread = c.unreadCount ?? 0
            const previewText =
              last?.text?.trim() ||
              (last?.attachments?.length ? `📎 ${last.attachments.length} attachment(s)` : 'Say hi 👋')

            return (
              <li key={c.id}>
                <button
                  onClick={() => setActiveChatId(c.id)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50/80 active:bg-gray-100 transition-colors"
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

      {activeChatId && (
        <ChatTab
          chatId={activeChatId}
          onClose={() => {
            setActiveChatId(null)
            // Refresh to update unread + last-message after closing.
            load()
          }}
        />
      )}
    </div>
  )
}

export default ChatListPage
