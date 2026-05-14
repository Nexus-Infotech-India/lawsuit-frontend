import { FC, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LawyerCard from '../../components/molecules/LawyerCard'
import Button from '../../components/atoms/Button'
import { useLawyerStore } from '@/stores/lawyerStore'

interface Filters {
  location?: string
  specialization?: string
  maxFee?: string
  language?: string
}

const RADIUS_OPTIONS = [10, 25, 50, 100]
const SORT_OPTIONS: { value: string; label: string; geoOnly?: boolean }[] = [
  { value: 'rating', label: 'Rating' },
  { value: 'experience', label: 'Experience' },
  { value: 'fee', label: 'Fee' },
  { value: 'distance', label: 'Distance (nearest)', geoOnly: true },
]

const SearchPage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q')?.trim() ?? '')
  const [filters, setFilters] = useState<Filters>(() => {
    const initialLocation = searchParams.get('location')?.trim()
    const initialSpecialization = searchParams.get('specialization')?.trim()

    return {
      ...(initialLocation ? { location: initialLocation } : {}),
      ...(initialSpecialization ? { specialization: initialSpecialization } : {}),
    }
  })
  const [page, setPage] = useState(1)

  /* ─── Geo state ─── */
  const [geoCoords, setGeoCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [radiusKm, setRadiusKm] = useState(50)
  const [clientPincode, setClientPincode] = useState('')
  const [sortBy, setSortBy] = useState('rating')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const {
    lawyers,
    loading,
    total,
    limit,
    filterOptions,
    fetchLawyers,
  } = useLawyerStore((s) => ({
    lawyers: s.lawyers,
    loading: s.loading,
    total: s.total,
    limit: s.limit,
    filterOptions: s.filterOptions,
    fetchLawyers: s.fetchLawyers,
  }))

  // Fetch lawyers based on search, filters, and geo coords
  const load = async (p = 1) => {
    const mappedFilters: any = {}
    if (searchQuery) mappedFilters.q = searchQuery
    if (filters.location) mappedFilters.location = filters.location
    if (filters.specialization) mappedFilters.specialization = filters.specialization
    if (filters.maxFee) mappedFilters.maxFee = Number(filters.maxFee)
    if (filters.language) mappedFilters.languages = filters.language.split(',').map((s) => s.trim())

    // Geo params
    if (geoCoords) {
      mappedFilters.latitude = geoCoords.latitude
      mappedFilters.longitude = geoCoords.longitude
      mappedFilters.radiusKm = radiusKm
    }

    // Pincode-based geo search (works without GPS)
    if (clientPincode && /^\d{6}$/.test(clientPincode.trim())) {
      mappedFilters.clientPincode = clientPincode.trim()
      if (!geoCoords) mappedFilters.radiusKm = radiusKm
    }

    // Sort
    mappedFilters.sortBy = sortBy
    mappedFilters.order = sortOrder

    await fetchLawyers(mappedFilters, p, limit)
  }

  useEffect(() => {
    load(page)
  }, [searchQuery, filters, page, geoCoords, radiusKm, clientPincode, sortBy, sortOrder])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    load(1)
  }

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === 'all' ? undefined : value
    }))
    setPage(1)
  }

  const hasActiveFilters = Object.values(filters).some(value => value !== undefined) || geoCoords !== null || (clientPincode.length === 6)

  const removeFilter = (key: keyof Filters) => {
    setFilters(prev => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
    setPage(1)
  }

  /* ─── Geolocation handler ─── */
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser')
      return
    }
    setGeoLoading(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        // Auto-switch to sort by distance when location is enabled
        setSortBy('distance')
        setSortOrder('asc')
        setGeoLoading(false)
        setPage(1)
      },
      (err) => {
        setGeoError(
          err.code === 1
            ? 'Location permission denied. Please allow location access.'
            : 'Unable to retrieve your location. Please try again.'
        )
        setGeoLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const clearLocation = () => {
    setGeoCoords(null)
    setGeoError(null)
    if (sortBy === 'distance') {
      setSortBy('rating')
      setSortOrder('desc')
    }
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Offers banner */}
      <div className="w-full h-40 rounded-xl flex items-center justify-between bg-gradient-to-r from-primary to-midnight text-white mb-4">
        <div className="max-w-7xl sm:mx-auto lg:mx-4 px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
          <div className="text-xl">Limited-time: Get 20% off your first consultation when you book this week!</div>
          <div>
            <a href="/offers" className="text-sm font-semibold underline"></a>
          </div>
        </div>
      </div>
      {/* Search Bar - Fixed at top */}
      <div className="bg-white border-b sticky top-0 z-20 rounded-md shadow-[0_-10px_15px_-3px_rgb(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <form onSubmit={handleSearch}>
            <div className="flex gap-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lawyers by name or specialization..."
                className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <Button variant='secondary' type="submit">Search</Button>
            </div>
          </form>

          {/* Location & Sort controls */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {/* Use My Location button */}
            {!geoCoords ? (
              <button
                onClick={handleUseMyLocation}
                disabled={geoLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition disabled:opacity-50"
              >
                {geoLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Locating…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Use My Location
                  </>
                )}
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-full bg-green-50 border border-green-300 text-green-700">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Location active
                <button
                  onClick={clearLocation}
                  className="ml-1 text-green-500 hover:text-green-700"
                  title="Clear location"
                >
                  ×
                </button>
              </div>
            )}

            {/* Pincode search */}
            <div className="inline-flex items-center gap-2">
              <input
                type="text"
                value={clientPincode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setClientPincode(val)
                  if (val.length === 6 || val.length === 0) setPage(1)
                }}
                placeholder="Enter Pincode"
                maxLength={6}
                className="w-28 text-sm rounded-lg border border-gray-300 px-2 py-1.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              {clientPincode.length === 6 && (
                <button
                  onClick={() => { setClientPincode(''); setPage(1) }}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                  title="Clear pincode"
                >
                  ×
                </button>
              )}
            </div>

            {/* Radius selector — shown only when geo is active */}
            {geoCoords && (
              <div className="inline-flex items-center gap-2">
                <label className="text-sm text-gray-600">Radius:</label>
                <select
                  value={radiusKm}
                  onChange={(e) => { setRadiusKm(Number(e.target.value)); setPage(1) }}
                  className="text-sm rounded-lg border border-gray-300 px-2 py-1.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  {RADIUS_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r} km</option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort */}
            <div className="inline-flex items-center gap-2 ml-auto">
              <label className="text-sm text-gray-600">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value)
                  // Default order for distance is asc, for others desc
                  setSortOrder(e.target.value === 'distance' ? 'asc' : 'desc')
                  setPage(1)
                }}
                className="text-sm rounded-lg border border-gray-300 px-2 py-1.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              >
                {SORT_OPTIONS.filter((o) => !o.geoOnly || geoCoords).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 transition"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>

          {/* Geo status messages */}
          {geoError && (
            <div className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {geoError}
            </div>
          )}
          {geoCoords && !loading && (
            <div className="mt-2 text-sm text-gray-500">
              📍 Showing lawyers within <strong>{radiusKm} km</strong> of your location · {total} result{total !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-2 px-4 sm:px-6 lg:px-6 py-10">
        <div className="grid grid-cols-10 gap-8 min-h-[calc(100vh-8rem)]">
          {/* Left Sidebar Filters - 30% */}
          <div className="col-span-3">
            <div className="bg-white rounded-lg shadow p-4 sticky top-24">
              <h3 className="font-medium text-lg mb-4">Filters</h3>

              <div className="space-y-6">
                {/*
                  Location / Specialization / Maximum Fee are SINGLE-select.
                  The server's /lawyers endpoint accepts each as a single
                  scalar (city: string, specialization: string, maxFee: number).
                  The previous multi-select checkboxes joined values with ","
                  which: (a) made `Number("50000,100000") === NaN` for maxFee,
                  and (b) made the comma-joined city/specialization not match
                  any real lawyer. Radio inputs match the server contract
                  exactly. Language stays multi-select because the API does
                  accept `languages: string[]`.
                */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Location</label>
                    {filters.location && (
                      <button
                        type="button"
                        onClick={() => removeFilter('location')}
                        className="text-[11px] text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {filterOptions.locations.map(location => (
                      <label key={location} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="filter-location"
                          checked={filters.location === location}
                          onChange={() => handleFilterChange('location', location)}
                          className="text-primary focus:ring-primary"
                        />
                        <span className="text-sm">{location}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Specialization</label>
                    {filters.specialization && (
                      <button
                        type="button"
                        onClick={() => removeFilter('specialization')}
                        className="text-[11px] text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {filterOptions.specializations.map(spec => (
                      <label key={spec} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="filter-specialization"
                          checked={filters.specialization === spec}
                          onChange={() => handleFilterChange('specialization', spec)}
                          className="text-primary focus:ring-primary"
                        />
                        <span className="text-sm">{spec}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Maximum Fee</label>
                    {filters.maxFee && (
                      <button
                        type="button"
                        onClick={() => removeFilter('maxFee')}
                        className="text-[11px] text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {['50000', '100000', '150000', '250000'].map(fee => (
                      <label key={fee} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="filter-maxfee"
                          checked={filters.maxFee === fee}
                          onChange={() => handleFilterChange('maxFee', fee)}
                          className="text-primary focus:ring-primary"
                        />
                        <span className="text-sm">Up to ₹{(Number(fee) / 100).toLocaleString('en-IN')}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Language
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {filterOptions.languages.map(lang => (
                      <label key={lang} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={filters.language?.split(',').includes(lang)}
                          onChange={(e) => {
                            const currentLangs = filters.language?.split(',').filter(Boolean) || [];
                            const updatedLangs = e.target.checked
                              ? [...currentLangs, lang]
                              : currentLangs.filter(l => l !== lang);
                            handleFilterChange('language', updatedLangs.join(',') || 'all');
                          }}
                          className="text-primary focus:ring-primary rounded"
                        />
                        <span className="text-sm">{lang}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Results Area - 70% */}
          <div className="col-span-7 flex flex-col min-h-full">
            {/* Active Filters - Fixed under search */}
            {hasActiveFilters && (
              <div className="bg-white rounded-lg shadow-sm p-4 mb-4 sticky top-24 z-19">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm text-gray-500">Active filters:</span>
                  {Object.entries(filters).map(([key, value]) => (
                    value && value !== 'all' && (
                      <div
                        key={key}
                        className="inline-flex items-center bg-gray-100 rounded-full px-3 py-1 text-sm"
                      >
                        <span className="text-gray-600 capitalize">
                          {key}: {String(value).split(',').join(', ')}
                        </span>
                        <button
                          onClick={() => removeFilter(key as keyof Filters)}
                          className="ml-2 text-gray-500 hover:text-gray-700"
                        >
                          ×
                        </button>
                      </div>
                    )
                  ))}
                  {geoCoords && (
                    <div className="inline-flex items-center bg-blue-100 rounded-full px-3 py-1 text-sm">
                      <span className="text-blue-700">
                        📍 Within {radiusKm} km
                      </span>
                      <button
                        onClick={clearLocation}
                        className="ml-2 text-blue-500 hover:text-blue-700"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {clientPincode.length === 6 && (
                    <div className="inline-flex items-center bg-purple-100 rounded-full px-3 py-1 text-sm">
                      <span className="text-purple-700">
                        📮 Pincode: {clientPincode}
                      </span>
                      <button
                        onClick={() => { setClientPincode(''); setPage(1) }}
                        className="ml-2 text-purple-500 hover:text-purple-700"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => { setFilters({}); clearLocation() }}
                    className="text-primary hover:text-primary-dark text-sm ml-auto"
                  >
                    Clear all filters
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable Results */}
            <div className="overflow-y-auto flex-1 min-h-[500px]">
              {loading ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto"></div>
                    <div className="space-y-3 mt-4">
                      <div className="h-4 bg-gray-200 rounded"></div>
                      <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                      <div className="h-4 bg-gray-200 rounded w-4/6"></div>
                    </div>
                  </div>
                  <p className="text-gray-500 mt-4">Loading results...</p>
                </div>
              ) : (
                <>
                  {lawyers.length > 0 ? (
                    <div className="space-y-4">
                      {lawyers.map(lawyer => (
                        <div key={lawyer.id} className="bg-white rounded-lg shadow">
                          <LawyerCard
                            id={lawyer.id}
                            name={lawyer.name}
                            specialization={lawyer.specialization}
                            experienceYears={lawyer.experienceYears}
                            rating={lawyer.rating}
                            fee={lawyer.fee}
                            location={lawyer.location}
                            languages={lawyer.languages || []}
                            avatar={lawyer.avatar}
                            distance={lawyer.distance}
                            isVerified={lawyer.isVerified}
                            onView={() => navigate(`/app/lawyers/${lawyer.id}`)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg shadow p-8 text-center">
                      <div className="text-gray-400 mb-4">
                        <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No lawyers found</h3>
                      <p className="text-gray-500">
                        {geoCoords
                          ? `No lawyers found within ${radiusKm} km. Try increasing the radius.`
                          : 'Try adjusting your filters or search criteria to find more results.'}
                      </p>
                      {geoCoords && (
                        <button
                          onClick={() => { setRadiusKm(100); setPage(1) }}
                          className="mt-3 text-sm text-blue-600 hover:underline"
                        >
                          Expand to 100 km radius
                        </button>
                      )}
                    </div>
                  )}

                  {/* Pagination */}
                  {total > limit && (
                    <div className="flex justify-center gap-2 my-8">
                      <Button
                        onClick={() => setPage(prev => {
                          const next = Math.max(1, prev - 1)
                          load(next)
                          return next
                        })}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <span className="py-2 px-4">
                        Page {page} of {Math.max(1, Math.ceil(total / limit))}
                      </span>
                      <Button
                        onClick={() => setPage(prev => {
                          const next = Math.min(Math.max(1, Math.ceil(total / limit)), prev + 1)
                          load(next)
                          return next
                        })}
                        disabled={page === Math.max(1, Math.ceil(total / limit))}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SearchPage