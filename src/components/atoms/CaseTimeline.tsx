import { FC, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, Plus, Save, X, Calendar, Loader2 } from 'lucide-react'
import { casesExtApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

interface TimelineEvent {
  id: string
  title: string
  description?: string | null
  eventDate: string
  type?: string | null
  createdAt?: string
}

interface CaseTimelineProps {
  caseId: string
}

/**
 * Server-backed timeline tab.
 *
 * Replaces the previous local-only stub that:
 *   - never persisted entries (so client/lawyer sides couldn't see each
 *     other's timeline),
 *   - never sorted (later-added past dates appeared after future dates).
 *
 * Now it:
 *   - reads from GET /cases/timeline/events/:caseid (already sorted
 *     chronologically by `eventDate` on the server),
 *   - lets lawyers add/edit/delete entries (clients see read-only — matches
 *     the server's role checks),
 *   - invalidates the React Query cache after every mutation so the same
 *     timeline appears on both client and lawyer panels without manual
 *     refresh.
 */
const CaseTimeline: FC<CaseTimelineProps> = ({ caseId }) => {
  const role = useAuthStore((s) => s.user?.role)
  const isLawyer = role === 'LAWYER'
  const qc = useQueryClient()

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftDate, setDraftDate] = useState(() => new Date().toISOString().slice(0, 10))

  const eventsQuery = useQuery({
    queryKey: ['case-timeline', caseId],
    queryFn: async () => {
      const res = await casesExtApi.listTimelineEvents(caseId)
      const list = (res.data?.data ?? res.data?.items ?? res.data ?? []) as TimelineEvent[]
      return list
    },
  })

  const events = (eventsQuery.data ?? []).slice().sort((a, b) => {
    // Belt-and-suspenders: server already orders by eventDate asc, but if a
    // future schema change ships events out of order, sort here too.
    return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['case-timeline', caseId] })

  const createMut = useMutation({
    mutationFn: (payload: { title: string; description?: string; eventDate: string }) =>
      casesExtApi.createTimelineEvent(caseId, payload),
    onSuccess: () => {
      invalidate()
      resetForm()
      setAdding(false)
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Failed to add timeline event'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { title: string; description?: string; eventDate: string } }) =>
      casesExtApi.updateTimelineEvent(id, payload),
    onSuccess: () => {
      invalidate()
      resetForm()
      setEditingId(null)
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Failed to update timeline event'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => casesExtApi.deleteTimelineEvent(id),
    onSuccess: () => invalidate(),
    onError: (err: any) => alert(err?.response?.data?.error || 'Failed to delete timeline event'),
  })

  const resetForm = () => {
    setDraftTitle('')
    setDraftDescription('')
    setDraftDate(new Date().toISOString().slice(0, 10))
  }

  const startEdit = (ev: TimelineEvent) => {
    setAdding(false)
    setEditingId(ev.id)
    setDraftTitle(ev.title)
    setDraftDescription(ev.description ?? '')
    setDraftDate(new Date(ev.eventDate).toISOString().slice(0, 10))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setAdding(false)
    resetForm()
  }

  const submitDraft = () => {
    const title = draftTitle.trim()
    if (!title) return
    const payload = {
      title,
      description: draftDescription.trim() || undefined,
      eventDate: new Date(draftDate).toISOString(),
    }
    if (editingId) updateMut.mutate({ id: editingId, payload })
    else createMut.mutate(payload)
  }

  const isMutating = createMut.isPending || updateMut.isPending

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">Timeline</h3>
        {isLawyer && !adding && !editingId && (
          <button
            onClick={() => {
              setAdding(true)
              resetForm()
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Add event
          </button>
        )}
      </div>

      {/* Inline add/edit form */}
      {isLawyer && (adding || editingId) && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Event title (e.g. FIR filed)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="pl-7 pr-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={cancelEdit}
                disabled={isMutating}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                onClick={submitDraft}
                disabled={isMutating || !draftTitle.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {isMutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {editingId ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {eventsQuery.isLoading ? (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading timeline…
        </div>
      ) : events.length === 0 ? (
        <div className="text-sm text-gray-500">
          No events yet{isLawyer ? ' — click "Add event" to log the first one.' : '.'}
        </div>
      ) : (
        // Vertical timeline (chronological). Each entry shows its eventDate
        // formatted for human reading; the ordering is enforced server-side
        // and re-affirmed client-side so it remains stable.
        <ol className="relative border-l-2 border-gray-200 ml-3 space-y-4">
          {events.map((ev) => (
            <li key={ev.id} className="ml-4">
              <span className="absolute -left-[7px] mt-1.5 w-3 h-3 bg-primary rounded-full ring-2 ring-white" />
              <div className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-gray-500">
                      {new Date(ev.eventDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="font-medium text-gray-900 mt-0.5">{ev.title}</div>
                    {ev.description && (
                      <div className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{ev.description}</div>
                    )}
                  </div>
                  {isLawyer && !editingId && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(ev)}
                        className="p-1.5 text-gray-500 hover:text-primary hover:bg-primary/5 rounded-md"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this timeline event?')) deleteMut.mutate(ev.id)
                        }}
                        disabled={deleteMut.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default CaseTimeline
