import { FC, useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Loader2, X, Landmark, Search } from 'lucide-react'
import { adminCourtApi } from '@/services/api'
import { unwrapList } from '@/utils/unwrap'
import AddressPicker from '@/components/molecules/AddressPicker'

interface Court {
  id: string
  name: string
  type?: string
  pincode?: string
  state?: string
  district?: string
  city?: string
  address?: string
  createdAt?: string
}

const empty: Partial<Court> = { name: '', type: 'DISTRICT', pincode: '', state: '', district: '', city: '', address: '' }

const AdminCourtsPage: FC = () => {
  const [courts, setCourts] = useState<Court[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Court> | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminCourtApi.listCourts({ q: q.trim() || undefined, limit: 100 })
      setCourts(unwrapList<Court>(res.data))
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to load', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleNew = () => {
    setEditing({ ...empty })
    setShowForm(true)
  }

  const handleEdit = (c: Court) => {
    setEditing({ ...c })
    setShowForm(true)
  }

  const handleDelete = async (c: Court) => {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return
    try {
      await adminCourtApi.deleteCourt(c.id)
      showToast('Deleted', 'success')
      await load()
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Delete failed', 'error')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      const payload = {
        name: (editing.name || '').trim(),
        type: editing.type,
        pincode: editing.pincode?.trim(),
        state: editing.state?.trim(),
        district: editing.district?.trim(),
        city: editing.city?.trim(),
        address: editing.address?.trim(),
      }
      if (editing.id) {
        await adminCourtApi.updateCourt(editing.id, payload)
      } else {
        await adminCourtApi.createCourt(payload)
      }
      showToast(editing.id ? 'Updated' : 'Created', 'success')
      setShowForm(false)
      setEditing(null)
      await load()
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50">
            <Landmark className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Courts</h1>
            <p className="text-sm text-gray-500">Manage the platform's court directory.</p>
          </div>
        </div>
        <button onClick={handleNew} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New court
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search by name / pincode…"
          className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : courts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center text-gray-500">No courts yet.</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Pincode</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {courts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.type || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {[c.city, c.district, c.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.pincode || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => handleEdit(c)} className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">{editing.id ? 'Edit court' : 'New court'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  required
                  value={editing.name || ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
                  <select
                    value={editing.type || ''}
                    onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none bg-white"
                  >
                    <option value="DISTRICT">District</option>
                    <option value="HIGH_COURT">High Court</option>
                    <option value="SUPREME_COURT">Supreme Court</option>
                    <option value="TRIBUNAL">Tribunal</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>
              {/* Pincode → state/district/city auto-fill. Multi-match
                  pincodes (metros / large districts) surface a picker so
                  the admin can choose the right locality. */}
              <AddressPicker
                value={{
                  pincode: editing.pincode,
                  state: editing.state,
                  district: editing.district,
                  city: editing.city,
                }}
                onChange={(next) =>
                  setEditing({
                    ...editing,
                    pincode: next.pincode,
                    state: next.state,
                    district: next.district,
                    city: next.city,
                  })
                }
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                <textarea
                  rows={2}
                  value={editing.address || ''}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Saving…' : editing.id ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50">
          <div className={`px-5 py-3 rounded-xl shadow-lg text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminCourtsPage
