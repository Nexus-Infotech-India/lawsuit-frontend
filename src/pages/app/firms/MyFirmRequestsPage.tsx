import { FC, useEffect, useState } from 'react'
import { format } from 'date-fns'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'
import { startOrgRequestRazorpayCheckout } from '@/services/orgPaymentFlow'
import { useAuthStore } from '@/stores/authStore'
import type { OrgAppointmentRequestStatus } from '@/types'

const STATUSES: OrgAppointmentRequestStatus[] = ['PENDING', 'ASSIGNED', 'REJECTED', 'CANCELLED', 'EXPIRED']

const MyFirmRequestsPage: FC = () => {
  const myRequests = useOrganizationStore((s) => s.myRequests)
  const fetchMyRequests = useOrganizationStore((s) => s.fetchMyRequests)
  const cancelMyRequest = useOrganizationStore((s) => s.cancelMyRequest)
  const loading = useOrganizationStore((s) => s.loadingMyRequests)
  const user = useAuthStore((s) => s.user)

  const [activeStatus, setActiveStatus] = useState<OrgAppointmentRequestStatus | 'ALL'>('ALL')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMyRequests(activeStatus === 'ALL' ? {} : { status: activeStatus }).catch(() => { })
  }, [activeStatus, fetchMyRequests])

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this request?')) return
    setBusyId(id)
    try {
      await cancelMyRequest(id)
    } finally {
      setBusyId(null)
    }
  }

  const handlePay = async (requestId: string) => {
    setError(null)
    setBusyId(requestId)
    try {
      await startOrgRequestRazorpayCheckout({
        request: myRequests.find((r) => r.id === requestId),
        prefill: {
          name: user?.name,
          email: (user as any)?.email,
          contact: String((user as any)?.phone ?? ''),
        },
        onSuccess: () => {
          fetchMyRequests(activeStatus === 'ALL' ? {} : { status: activeStatus }).catch(() => { })
        },
      })
    } catch (err: any) {
      setError(err?.message || 'Payment failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My firm requests</h1>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveStatus('ALL')}
          className={`px-3 py-1.5 rounded-full text-sm border ${activeStatus === 'ALL' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'}`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm border ${activeStatus === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : myRequests.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-base font-medium text-gray-900">No requests yet</h3>
            <p className="text-sm text-gray-500 mt-1">Browse law firms to send your first request.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {myRequests.map((r) => (
              <li key={r.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1">
                  {r.organization.avatarUrl ? (
                    <img src={r.organization.avatarUrl} alt={r.organization.name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                      {r.organization.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{r.organization.name}</div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(r.scheduledAt), 'PP p')} · {r.durationMins} mins · {r.meetingType || 'N/A'}
                    </div>
                    {r.assignedLawyer && (
                      <div className="text-xs text-gray-700 mt-1">
                        Assigned: <strong>{r.assignedLawyer.name}</strong>
                      </div>
                    )}
                    {r.status === 'REJECTED' && r.rejectionReason && (
                      <div className="text-xs text-red-700 mt-1">
                        Reason: {r.rejectionReason}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeClasses(r.status)}`}>
                    {r.status}
                  </span>
                  {r.status === 'PENDING' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => handleCancel(r.id)}
                      disabled={busyId === r.id}
                    >
                      Cancel
                    </Button>
                  )}
                  {r.status === 'ASSIGNED' && r.appointment?.paymentId && !r.appointment?.id && (
                    <Button size="sm" onClick={() => handlePay(r.id)} disabled={busyId === r.id}>
                      Pay now
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function badgeClasses(status: OrgAppointmentRequestStatus): string {
  switch (status) {
    case 'PENDING': return 'bg-amber-100 text-amber-800'
    case 'ASSIGNED': return 'bg-green-100 text-green-800'
    case 'REJECTED': return 'bg-red-100 text-red-800'
    case 'CANCELLED': return 'bg-gray-100 text-gray-700'
    case 'EXPIRED': return 'bg-gray-200 text-gray-700'
  }
}

export default MyFirmRequestsPage
