import { FC, useState } from 'react'
import { Megaphone, Send, AlertCircle, Check } from 'lucide-react'
import { adminApi } from '@/services/api'

const ROLES = ['CLIENT', 'LAWYER', 'COURT_ADMIN', 'ORGANIZATION'] as const

const AdminAnnouncementsPage: FC = () => {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const toggleRole = (r: string) => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return
    if (!confirm(`Send "${title}" to ${roles.length === 0 ? 'EVERY active user' : roles.join(', ')}?`)) return
    setSending(true)
    try {
      await adminApi.broadcast({
        title: title.trim(),
        message: message.trim(),
        roles: roles.length === 0 ? undefined : roles,
      })
      showToast('Announcement sent', 'success')
      setTitle('')
      setMessage('')
      setRoles([])
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to send', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-50">
          <Megaphone className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Broadcast announcement</h1>
          <p className="text-sm text-gray-500">Send a push notification + in-app banner to one or more roles. SUPER_ADMIN only.</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Announcements fan out to every active user in the selected role(s). They cannot be recalled. Double-check copy before sending.</span>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Short headline"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
          <textarea
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={800}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
          />
          <div className="text-xs text-gray-400 mt-1 text-right">{message.length} / 800</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Send to</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRoles([])}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${roles.length === 0
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
            >
              All users
            </button>
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRole(r)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${roles.includes(r)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={sending || !title.trim() || !message.trim()}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending…' : 'Broadcast'}
          </button>
        </div>
      </form>

      {toast && (
        <div className="fixed right-6 bottom-6 z-50">
          <div className={`flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminAnnouncementsPage
