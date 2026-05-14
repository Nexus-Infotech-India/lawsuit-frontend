import { FC, useEffect, useState } from 'react'
import { Plus, Loader2, X, ShieldCheck, ToggleRight, Trash2, Lock } from 'lucide-react'
import { adminApi } from '@/services/api'
import { unwrapList } from '@/utils/unwrap'
import { friendlyError } from '@/utils/errors'

interface AdminUser {
  id: string
  name?: string
  email?: string
  phone?: string
  level?: 'SUPER_ADMIN' | 'ADMIN'
  permissions?: string[]
  isActive?: boolean
  createdAt?: string
}

const PERMISSIONS = ['USERS', 'COURTS', 'COURT_ADMIN_TEAM', 'REPORTS', 'LEGAL_UPDATES']

const AdminTeamPage: FC = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AdminUser & { password?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminApi.listAdmins({ limit: 100 })
      setAdmins(unwrapList<AdminUser>(res.data))
    } catch (err: any) {
      showToast(friendlyError(err, 'Failed to load admin team'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleNew = () => {
    setEditing({ id: '', name: '', email: '', phone: '', password: '', level: 'ADMIN', permissions: [] })
    setShowForm(true)
  }

  const handleEdit = (a: AdminUser) => {
    if (a.level === 'SUPER_ADMIN') {
      showToast('Super admins cannot be edited — they hold full platform access by design.', 'error')
      return
    }
    setEditing({ ...a, password: '' })
    setShowForm(true)
  }

  const handleDelete = async (a: AdminUser) => {
    if (a.level === 'SUPER_ADMIN') {
      showToast('Super admins cannot be removed from the team.', 'error')
      return
    }
    if (!confirm(`Remove admin ${a.email}? This is a soft delete.`)) return
    try {
      await adminApi.deleteAdmin(a.id)
      showToast('Admin removed', 'success')
      await load()
    } catch (err: any) {
      showToast(friendlyError(err, 'Could not remove admin'), 'error')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      const payload: any = {
        name: editing.name?.trim(),
        email: editing.email?.trim(),
        phone: editing.phone?.trim(),
        level: editing.level,
        permissions: editing.permissions,
      }
      if (editing.id) {
        await adminApi.updateAdmin(editing.id, payload)
        showToast('Updated', 'success')
      } else {
        // The server auto-generates a temporary password and emails it to
        // the invitee (`admin-management.service.ts` → `sendAdminInviteEmail`).
        // We only forward a password if the inviter explicitly typed one;
        // otherwise let the server take the generate-and-email branch so
        // the team member's inbox gets the real credentials. The previous
        // hard-coded `'TempPass!123'` defeated the email flow and shipped
        // a predictable shared password.
        const createPayload: any = { ...payload }
        if (editing.password) createPayload.password = editing.password
        const res = await adminApi.createAdmin(createPayload)
        const credentialsEmail = (res as any)?.data?.credentialsEmail
        if (credentialsEmail?.delivered) {
          showToast(`Invited — credentials emailed to ${editing.email}`, 'success')
        } else if (credentialsEmail && !credentialsEmail.delivered) {
          // The org-onboarding flow shows the temp password as a fallback
          // when delivery fails; same pattern would apply here, but the
          // server-side admin invite doesn't return the temp password
          // yet, so for now just surface the failure reason.
          showToast(
            `Invited, but the credentials email did not send (${credentialsEmail.error || credentialsEmail.provider}). Use Forgot Password on the login page or resend.`,
            'error',
          )
        } else {
          showToast('Invited', 'success')
        }
      }
      setShowForm(false)
      setEditing(null)
      await load()
    } catch (err: any) {
      showToast(friendlyError(err, 'Could not save admin'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const togglePermission = (perm: string) => {
    if (!editing) return
    const set = new Set(editing.permissions || [])
    if (set.has(perm)) set.delete(perm); else set.add(perm)
    setEditing({ ...editing, permissions: Array.from(set) })
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin team</h1>
            <p className="text-sm text-gray-500">Invite admins, set their level and permissions. SUPER_ADMIN only.</p>
          </div>
        </div>
        <button onClick={handleNew} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Invite admin
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : admins.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center text-gray-500">No admins yet.</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Permissions</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map((a) => (
                <tr key={a.id} className={a.isActive === false ? 'opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{a.name || '—'}</div>
                    <div className="text-xs text-gray-500">{a.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${a.level === 'SUPER_ADMIN' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                      {a.level || 'ADMIN'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(a.permissions || []).map((p) => (
                        <span key={p} className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{p}</span>
                      ))}
                      {a.level === 'SUPER_ADMIN' && (a.permissions || []).length === 0 && (
                        <span className="text-xs text-gray-400">All</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.isActive === false ? (
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">Inactive</span>
                    ) : (
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {a.level === 'SUPER_ADMIN' ? (
                        <span
                          title="Super admin holds full platform access and cannot be edited or removed."
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100"
                        >
                          <Lock className="w-3 h-3" /> Protected
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(a)}
                            title="Edit admin"
                            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                          >
                            <ToggleRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(a)}
                            title="Remove admin"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
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
              <h2 className="text-lg font-semibold">{editing.id ? 'Edit admin' : 'Invite admin'}</h2>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    required
                    disabled={!!editing.id}
                    value={editing.email || ''}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                  <input
                    value={editing.phone || ''}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              {!editing.id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Initial password
                    <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={editing.password || ''}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    placeholder="Leave blank to email a generated temporary password"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If blank, the server generates a one-time password and emails it to {editing.email || 'the invitee'}.
                    They'll be forced to change it on first login.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Level</label>
                <select
                  value={editing.level || 'ADMIN'}
                  onChange={(e) => setEditing({ ...editing, level: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none bg-white"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {PERMISSIONS.map((p) => {
                    const active = editing.permissions?.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePermission(p)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">SUPER_ADMIN ignores explicit permissions and has full access.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Saving…' : editing.id ? 'Save' : 'Invite'}
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

export default AdminTeamPage
