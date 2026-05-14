import { FC, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, Plus, Save, X, Loader2, Gavel, Calendar } from 'lucide-react'
import { casesExtApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

interface Hearing {
  id: string
  date: string
  court?: string | null
  judge?: string | null
  purpose?: string | null
  outcome?: string | null
  notes?: string | null
}

interface CaseHearingsProps {
  caseId: string
}

/**
 * Server-backed hearings tab with edit + delete (lawyer-only).
 *
 * Backed by GET /cases/hearings/:caseid (sorted ascending by date on the
 * server). POST/PUT/DELETE go through the matching cases.routes endpoints
 * restricted to LAWYER role. Mutations invalidate the react-query cache so
 * the same list appears on client and lawyer panels without manual refresh.
 */
const CaseHearings: FC<CaseHearingsProps> = ({ caseId }) => {
  const role = useAuthStore((s) => s.user?.role)
  const isLawyer = role === 'LAWYER'
  const qc = useQueryClient()

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{
    date: string
    court: string
    judge: string
    purpose: string
    outcome: string
    notes: string
  }>(() => ({
    date: new Date().toISOString().slice(0, 16),
    court: '',
    judge: '',
    purpose: '',
    outcome: '',
    notes: '',
  }))

  const hearingsQuery = useQuery({
    queryKey: ['case-hearings', caseId],
    queryFn: async () => {
      const res = await casesExtApi.listHearings(caseId)
      return (res.data?.data ?? res.data?.items ?? res.data ?? []) as Hearing[]
    },
  })

  const hearings = (hearingsQuery.data ?? []).slice().sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )
  const invalidate = () => qc.invalidateQueries({ queryKey: ['case-hearings', caseId] })

  const createMut = useMutation({
    mutationFn: (payload: typeof draft) =>
      casesExtApi.addHearing(caseId, {
        date: new Date(payload.date).toISOString(),
        court: payload.court || undefined,
        judge: payload.judge || undefined,
        purpose: payload.purpose || undefined,
        outcome: payload.outcome || undefined,
        notes: payload.notes || undefined,
      }),
    onSuccess: () => {
      invalidate()
      cancelEdit()
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Failed to add hearing'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: typeof draft }) =>
      casesExtApi.updateHearing(id, {
        date: new Date(payload.date).toISOString(),
        court: payload.court || undefined,
        judge: payload.judge || undefined,
        purpose: payload.purpose || undefined,
        outcome: payload.outcome || undefined,
        notes: payload.notes || undefined,
      }),
    onSuccess: () => {
      invalidate()
      cancelEdit()
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Failed to update hearing'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => casesExtApi.deleteHearing(id),
    onSuccess: () => invalidate(),
    onError: (err: any) => alert(err?.response?.data?.error || 'Failed to delete hearing'),
  })

  const resetDraft = () =>
    setDraft({
      date: new Date().toISOString().slice(0, 16),
      court: '',
      judge: '',
      purpose: '',
      outcome: '',
      notes: '',
    })

  const startAdd = () => {
    setEditingId(null)
    resetDraft()
    setAdding(true)
  }

  const startEdit = (h: Hearing) => {
    setAdding(false)
    setEditingId(h.id)
    setDraft({
      date: new Date(h.date).toISOString().slice(0, 16),
      court: h.court ?? '',
      judge: h.judge ?? '',
      purpose: h.purpose ?? '',
      outcome: h.outcome ?? '',
      notes: h.notes ?? '',
    })
  }

  const cancelEdit = () => {
    setAdding(false)
    setEditingId(null)
    resetDraft()
  }

  const submitDraft = () => {
    if (!draft.date) return
    if (editingId) updateMut.mutate({ id: editingId, payload: draft })
    else createMut.mutate(draft)
  }

  const isMutating = createMut.isPending || updateMut.isPending

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Gavel className="w-5 h-5 text-primary" /> Hearings
        </h3>
        {isLawyer && !adding && !editingId && (
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Add hearing
          </button>
        )}
      </div>

      {/* Inline add/edit form */}
      {isLawyer && (adding || editingId) && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date &amp; time</label>
              <div className="relative">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="datetime-local"
                  value={draft.date}
                  onChange={(e) => setDraft((s) => ({ ...s, date: e.target.value }))}
                  className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <Field
              label="Court"
              value={draft.court}
              onChange={(v) => setDraft((s) => ({ ...s, court: v }))}
              placeholder="e.g. High Court of Karnataka"
            />
            <Field
              label="Judge"
              value={draft.judge}
              onChange={(v) => setDraft((s) => ({ ...s, judge: v }))}
              placeholder="Hon'ble …"
            />
            <Field
              label="Purpose"
              value={draft.purpose}
              onChange={(v) => setDraft((s) => ({ ...s, purpose: v }))}
              placeholder="Arguments / evidence / verdict"
            />
            <Field
              label="Outcome"
              value={draft.outcome}
              onChange={(v) => setDraft((s) => ({ ...s, outcome: v }))}
              placeholder="(after hearing)"
            />
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={cancelEdit}
              disabled={isMutating}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
            <button
              onClick={submitDraft}
              disabled={isMutating || !draft.date}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isMutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {editingId ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {hearingsQuery.isLoading ? (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading hearings…
        </div>
      ) : hearings.length === 0 ? (
        <div className="text-sm text-gray-500">
          No hearings scheduled{isLawyer ? ' — click "Add hearing" to schedule one.' : '.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {hearings.map((h) => (
            <li key={h.id} className="p-3 border border-gray-100 rounded-lg bg-white shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">
                      {h.purpose || 'Hearing'}
                    </span>
                    {h.outcome && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">
                        {h.outcome}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(h.date).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {h.court ? ` · ${h.court}` : ''}
                    {h.judge ? ` · ${h.judge}` : ''}
                  </div>
                  {h.notes && <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{h.notes}</div>}
                </div>
                {isLawyer && !editingId && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(h)}
                      className="p-1.5 text-gray-500 hover:text-primary hover:bg-primary/5 rounded-md"
                      title="Edit hearing"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this hearing?')) deleteMut.mutate(h.id)
                      }}
                      disabled={deleteMut.isPending}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
                      title="Delete hearing"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const Field: FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({
  label,
  value,
  onChange,
  placeholder,
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
    />
  </div>
)

export default CaseHearings
