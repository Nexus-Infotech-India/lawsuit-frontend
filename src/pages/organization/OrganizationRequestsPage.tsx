import { FC, useEffect, useState } from 'react'
import { format } from 'date-fns'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'
import type { OrgAppointmentRequest, OrgAppointmentRequestStatus, VerifiedLawyer } from '@/types'

const STATUS_TABS: OrgAppointmentRequestStatus[] = ['PENDING', 'ASSIGNED', 'REJECTED', 'CANCELLED', 'EXPIRED']

const OrganizationRequestsPage: FC = () => {
  const requests = useOrganizationStore((s) => s.requests)
  const fetchRequests = useOrganizationStore((s) => s.fetchRequests)
  const lawyers = useOrganizationStore((s) => s.lawyers)
  const fetchLawyers = useOrganizationStore((s) => s.fetchLawyers)
  const assignRequest = useOrganizationStore((s) => s.assignRequest)
  const rejectRequest = useOrganizationStore((s) => s.rejectRequest)
  const loadingRequests = useOrganizationStore((s) => s.loadingRequests)

  const [activeStatus, setActiveStatus] = useState<OrgAppointmentRequestStatus>('PENDING')
  const [assignTarget, setAssignTarget] = useState<OrgAppointmentRequest | null>(null)
  const [rejectTarget, setRejectTarget] = useState<OrgAppointmentRequest | null>(null)

  useEffect(() => {
    fetchRequests({ status: activeStatus }).catch(() => { })
    fetchLawyers().catch(() => { })
  }, [activeStatus, fetchRequests, fetchLawyers])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Appointment Requests</h1>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((status) => (
          <button
            key={status}
            onClick={() => setActiveStatus(status)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${activeStatus === status
              ? 'bg-primary text-white border-primary'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loadingRequests ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-base font-medium text-gray-900">No {activeStatus.toLowerCase()} requests</h3>
            <p className="text-sm text-gray-500 mt-1">When a client books your firm, requests will show up here.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{r.client.name}</div>
                    <div className="text-xs text-gray-500">{r.client.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {format(new Date(r.scheduledAt), 'PP p')}
                    <div className="text-xs text-gray-500">{r.durationMins} mins</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{r.meetingType || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">{r.notes || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {r.status === 'PENDING' ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => setAssignTarget(r)}>Assign</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setRejectTarget(r)}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">{r.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {assignTarget && (
        <AssignModal
          request={assignTarget}
          lawyers={lawyers}
          onClose={() => setAssignTarget(null)}
          onAssign={async (lawyerId, paymentMethod) => {
            await assignRequest(assignTarget.id, { lawyerId, paymentMethod })
          }}
        />
      )}

      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onReject={async (reason) => {
            await rejectRequest(rejectTarget.id, reason)
          }}
        />
      )}
    </div>
  )
}

// ── Assign Modal ───────────────────────────────────────────────────

const AssignModal: FC<{
  request: OrgAppointmentRequest
  lawyers: VerifiedLawyer[]
  onClose: () => void
  onAssign: (lawyerId: string, paymentMethod: 'razorpay' | 'wallet') => Promise<void>
}> = ({ request, lawyers, onClose, onAssign }) => {
  const [lawyerId, setLawyerId] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'wallet'>('razorpay')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter to verified lawyers only — backend rejects unverified anyway
  const eligible = lawyers.filter((l) => l.isVerified !== false)

  const handleSubmit = async () => {
    if (!lawyerId) {
      setError('Pick a lawyer')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onAssign(lawyerId, paymentMethod)
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to assign'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Assign a lawyer</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-sm text-gray-700">
            <div className="font-medium">{request.client.name}</div>
            <div className="text-xs text-gray-500">
              {format(new Date(request.scheduledAt), 'PP p')} · {request.durationMins} mins
              {request.meetingType ? ` · ${request.meetingType}` : ''}
            </div>
          </div>

          {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700">Lawyer</label>
            <select
              value={lawyerId}
              onChange={(e) => setLawyerId(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm"
            >
              <option value="">Select…</option>
              {eligible.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {eligible.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                No verified lawyers in your firm yet.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Payment method</label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('razorpay')}
                className={`px-3 py-2 rounded-md text-sm border ${paymentMethod === 'razorpay' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200'}`}
              >
                Razorpay (client pays)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('wallet')}
                className={`px-3 py-2 rounded-md text-sm border ${paymentMethod === 'wallet' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200'}`}
              >
                Wallet (client's wallet)
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              The client receives a notification to complete payment (Razorpay) or the booking is confirmed instantly (Wallet).
            </p>
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || eligible.length === 0}>
            {submitting ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Reject Modal ───────────────────────────────────────────────────

const RejectModal: FC<{
  request: OrgAppointmentRequest
  onClose: () => void
  onReject: (reason: string) => Promise<void>
}> = ({ request, onClose, onReject }) => {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Provide a short reason')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onReject(reason)
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to reject')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Reject request</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700">Reject the request from <strong>{request.client.name}</strong>?</p>
          {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700">Reason</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm"
              placeholder="Briefly explain why this booking is being rejected…"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
          >
            {submitting ? 'Rejecting…' : 'Reject'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default OrganizationRequestsPage
