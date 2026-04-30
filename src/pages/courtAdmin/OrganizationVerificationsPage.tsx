import { FC, useEffect, useState } from 'react'
import { format } from 'date-fns'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'
import type { OrgVerificationRequest } from '@/types'

const OrganizationVerificationsPage: FC = () => {
  const pending = useOrganizationStore((s) => s.pendingOrgVerifications)
  const all = useOrganizationStore((s) => s.allOrgVerifications)
  const fetchPending = useOrganizationStore((s) => s.fetchPendingOrgVerifications)
  const fetchAll = useOrganizationStore((s) => s.fetchAllOrgVerifications)
  const verifyOrganization = useOrganizationStore((s) => s.verifyOrganization)
  const loading = useOrganizationStore((s) => s.loadingOrgVerifications)

  const [tab, setTab] = useState<'PENDING' | 'HISTORY'>('PENDING')
  const [active, setActive] = useState<OrgVerificationRequest | null>(null)

  useEffect(() => {
    fetchPending().catch(() => { })
    fetchAll({ statuses: 'APPROVED,REJECTED' }).catch(() => { })
  }, [fetchPending, fetchAll])

  const list = tab === 'PENDING' ? pending : all.filter((v) => v.status !== 'PENDING')

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Organization verifications</h1>
        <div className="text-sm text-gray-500">
          Pending: <span className="font-bold text-indigo-600">{pending.length}</span>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['PENDING', 'HISTORY'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${tab === t
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {t === 'PENDING' ? 'Action required' : 'Verification history'}
              {t === 'PENDING' && pending.length > 0 && (
                <span className="ml-2 py-0.5 px-2.5 rounded-full text-xs bg-indigo-100 text-indigo-600">
                  {pending.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm">
            No {tab === 'PENDING' ? 'pending requests' : 'history'}.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((v) => (
              <li key={v.id} className="p-5">
                <div className="flex items-center justify-between flex-col sm:flex-row gap-3">
                  <div className="flex items-center gap-4">
                    {v.organization.avatarUrl ? (
                      <img src={v.organization.avatarUrl} alt={v.organization.name} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                        {v.organization.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{v.organization.name}</div>
                      <div className="text-xs text-gray-500">
                        {v.organization.city || ''}{v.organization.pincode ? ` · ${v.organization.pincode}` : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">Submitted {format(new Date(v.createdAt), 'PP')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {v.status === 'PENDING' ? (
                      <Button size="sm" onClick={() => setActive(v)}>Review</Button>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${v.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                        {v.status}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && (
        <ReviewModal
          request={active}
          onClose={() => setActive(null)}
          onAct={async (status, remarks) => {
            await verifyOrganization(active.organization.id, status, remarks)
          }}
        />
      )}
    </div>
  )
}

const ReviewModal: FC<{
  request: OrgVerificationRequest
  onClose: () => void
  onAct: (status: 'APPROVED' | 'REJECTED', remarks?: string) => Promise<void>
}> = ({ request, onClose, onAct }) => {
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (status: 'APPROVED' | 'REJECTED') => {
    setBusy(true)
    setError(null)
    try {
      await onAct(status, remarks || undefined)
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const org = request.organization

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Review {org.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Detail label="Email" value={org.email} />
            <Detail label="Phone" value={org.phone} />
            <Detail label="Pincode" value={org.pincode || '—'} />
            <Detail label="City" value={org.city || '—'} />
            <Detail label="Registration #" value={org.registrationNumber || '—'} />
            <Detail label="GST #" value={org.gstNumber || '—'} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DocPreview label="Registration certificate" url={org.registrationCertUrl} />
            <DocPreview label="GST proof" url={org.gstProofUrl} />
          </div>

          <div className="rounded-md bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">
            Approving will auto-verify all lawyers currently in this firm.
          </div>

          {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700">Remarks (optional)</label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit('REJECTED')}
            disabled={busy}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
          >
            Reject
          </Button>
          <Button onClick={() => submit('APPROVED')} disabled={busy}>
            Approve
          </Button>
        </div>
      </div>
    </div>
  )
}

const Detail: FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
    <div className="text-sm text-gray-900 font-medium mt-0.5">{value || '—'}</div>
  </div>
)

const DocPreview: FC<{ label: string; url?: string | null }> = ({ label, url }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</div>
    {url ? (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block border border-gray-200 rounded-md p-3 text-sm text-primary hover:bg-gray-50"
      >
        View document →
      </a>
    ) : (
      <div className="border border-dashed border-gray-200 rounded-md p-3 text-sm text-gray-400">
        Not uploaded
      </div>
    )}
  </div>
)

export default OrganizationVerificationsPage
