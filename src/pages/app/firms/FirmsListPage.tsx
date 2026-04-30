import { FC, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'

const FirmsListPage: FC = () => {
  const publicOrgs = useOrganizationStore((s) => s.publicOrgs)
  const fetchPublicOrgs = useOrganizationStore((s) => s.fetchPublicOrgs)
  const loading = useOrganizationStore((s) => s.loadingPublicOrgs)

  const [pincode, setPincode] = useState('')
  const [practiceArea, setPracticeArea] = useState('')

  useEffect(() => {
    fetchPublicOrgs().catch(() => { })
  }, [fetchPublicOrgs])

  const applyFilters = () => {
    fetchPublicOrgs({
      pincode: pincode || undefined,
      practiceArea: practiceArea || undefined,
    }).catch(() => { })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Law firms</h1>
        <p className="text-sm text-gray-500 mt-1">Verified firms — book a consultation and your firm assigns the right lawyer.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Pincode</label>
          <input
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            placeholder="6 digits"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Practice area</label>
          <input
            value={practiceArea}
            onChange={(e) => setPracticeArea(e.target.value)}
            placeholder="Civil, Criminal, …"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm"
          />
        </div>
        <Button onClick={applyFilters}>Apply</Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500 text-sm">Loading firms…</div>
      ) : publicOrgs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <h3 className="text-base font-medium text-gray-900">No firms found</h3>
          <p className="text-sm text-gray-500 mt-1">Try a different pincode or practice area.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {publicOrgs.map((org) => (
            <Link
              key={org.id}
              to={`/app/firms/${org.id}`}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition"
            >
              <div className="flex items-center gap-3">
                {org.avatarUrl ? (
                  <img src={org.avatarUrl} alt={org.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                    {org.name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{org.name}</h3>
                  <p className="text-xs text-gray-500">
                    {org.city || org.district || ''}{org.pincode ? ` · ${org.pincode}` : ''}
                  </p>
                </div>
              </div>
              {org.practiceAreas?.length > 0 && (
                <p className="mt-3 text-xs text-gray-600 line-clamp-2">{org.practiceAreas.join(' · ')}</p>
              )}
              {org.consultationFee != null && (
                <p className="mt-3 text-sm font-medium text-gray-900">
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(org.consultationFee / 100)}
                  <span className="text-xs text-gray-500 font-normal"> / consultation</span>
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default FirmsListPage
