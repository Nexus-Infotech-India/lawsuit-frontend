import { FC, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'

const OrganizationDashboardPage: FC = () => {
  const navigate = useNavigate()
  const me = useOrganizationStore((s) => s.me)
  const requests = useOrganizationStore((s) => s.requests)
  const lawyers = useOrganizationStore((s) => s.lawyers)
  const fetchMe = useOrganizationStore((s) => s.fetchMe)
  const fetchRequests = useOrganizationStore((s) => s.fetchRequests)
  const fetchLawyers = useOrganizationStore((s) => s.fetchLawyers)

  useEffect(() => {
    fetchMe().catch(() => { })
    fetchRequests({ status: 'PENDING' }).catch(() => { })
    fetchLawyers().catch(() => { })
  }, [fetchMe, fetchRequests, fetchLawyers])

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'PENDING').length,
    [requests],
  )

  if (!me) {
    return <div className="text-center py-12 text-gray-500">Loading organization profile…</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          {me.avatarUrl ? (
            <img src={me.avatarUrl} alt={me.name} className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold">
              {me.name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{me.name}</h1>
            <p className="text-sm text-gray-500">{me.email}</p>
          </div>
        </div>
        <div>
          {me.isVerified ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700 border border-green-200">
              Court Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 border border-amber-200">
              Verification pending
            </span>
          )}
        </div>
      </div>

      {!me.isVerified && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-900">Complete your onboarding</h3>
          <p className="text-sm text-amber-800 mt-1">
            Add your registration certificate, GST proof, and request a court admin verification before clients can discover your firm.
          </p>
          <div className="mt-3 flex gap-3">
            <Link
              to="/organization/profile"
              className="text-sm px-3 py-1.5 rounded-md bg-white border border-amber-300 hover:bg-amber-100"
            >
              Edit profile
            </Link>
            <Link
              to="/organization/verification"
              className="text-sm px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700"
            >
              Request court verification
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">Pending requests</p>
          <p className="mt-2 text-3xl font-bold text-indigo-600">{pendingCount}</p>
          <Button variant="ghost" size="sm" className="mt-3 px-0" onClick={() => navigate('/organization/requests')}>
            View all →
          </Button>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">Lawyers</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{lawyers.length}</p>
          <Button variant="ghost" size="sm" className="mt-3 px-0" onClick={() => navigate('/organization/lawyers')}>
            Manage →
          </Button>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">Consultation fee</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {me.consultationFee != null
              ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
                me.consultationFee / 100,
              )
              : '—'}
          </p>
          <Button variant="ghost" size="sm" className="mt-3 px-0" onClick={() => navigate('/organization/profile')}>
            Edit →
          </Button>
        </div>
      </div>
    </div>
  )
}

export default OrganizationDashboardPage
