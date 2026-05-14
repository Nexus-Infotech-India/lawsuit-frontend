import { FC, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'
import { courtAdminApi } from '@/services/api'

const OrganizationVerificationPage: FC = () => {
  const navigate = useNavigate()
  const me = useOrganizationStore((s) => s.me)
  const fetchMe = useOrganizationStore((s) => s.fetchMe)
  const eligibleCourtAdmins = useOrganizationStore((s) => s.eligibleCourtAdmins)
  const fetchEligibleCourtAdmins = useOrganizationStore((s) => s.fetchEligibleCourtAdmins)
  const requestVerification = useOrganizationStore((s) => s.requestVerification)
  const loadingCourtAdmins = useOrganizationStore((s) => s.loadingCourtAdmins)

  // District-wide fallback admins. The store's `eligibleCourtAdmins` is the
  // server's pincode-match list — narrow by design — but a single pincode
  // covers a tiny slice of a district so the list is often empty. We pull
  // the wider district set so the org head still has someone to send the
  // verification to.
  const [districtAdmins, setDistrictAdmins] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchMe().catch(() => { })
    fetchEligibleCourtAdmins().catch(() => { })
  }, [fetchMe, fetchEligibleCourtAdmins])

  // When the pincode-narrow list comes back empty, fall back to district.
  useEffect(() => {
    if (!me?.district) return
    if (eligibleCourtAdmins && eligibleCourtAdmins.length > 0) return
    let cancelled = false
    courtAdminApi
      .getAdminsByDistrict(me.district, me.state)
      .then((res) => {
        if (cancelled) return
        const data = (res as any).data?.data ?? (res as any).data ?? []
        setDistrictAdmins(Array.isArray(data) ? data : [])
      })
      .catch(() => !cancelled && setDistrictAdmins([]))
    return () => {
      cancelled = true
    }
  }, [me?.district, me?.state, eligibleCourtAdmins])

  // Merge — dedupe by id, pincode matches first.
  const combinedAdmins = useMemo(() => {
    const seen = new Set<string>()
    const merged: any[] = []
    for (const list of [eligibleCourtAdmins, districtAdmins]) {
      for (const a of list ?? []) {
        if (!a?.id || seen.has(a.id)) continue
        seen.add(a.id)
        merged.push(a)
      }
    }
    return merged
  }, [eligibleCourtAdmins, districtAdmins])

  if (me?.isVerified) {
    return (
      <div className="max-w-2xl mx-auto bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <h1 className="text-xl font-semibold text-green-900">Your firm is already verified.</h1>
        <p className="text-green-800 mt-2">Clients can now book consultations through your firm page.</p>
        <Button className="mt-4" onClick={() => navigate('/organization/dashboard')}>Go to dashboard</Button>
      </div>
    )
  }

  const handleSubmit = async () => {
    if (!selectedId) {
      setError('Pick a court admin first.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await requestVerification(selectedId)
      setSuccess('Verification request sent. You will be notified once a court admin reviews your firm.')
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to send request'
      // Pincode mismatch handling
      if (typeof msg === 'string' && /pincode/i.test(msg)) {
        setError(`${msg} — please update your pincode in profile and try again.`)
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Request court verification</h1>
        <p className="text-sm text-gray-500 mt-1">
          A court admin reviews your registration documents and approves your firm. We list court admins matching your firm's pincode.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success ? (
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-700">
          {success}
          <div className="mt-3">
            <Link to="/organization/dashboard" className="text-primary underline">Back to dashboard</Link>
          </div>
        </div>
      ) : (
        <>
          {!me?.pincode && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Your firm has no pincode set.{' '}
              <Link to="/organization/profile" className="underline font-medium">Add it first</Link>.
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                Eligible court admins {me?.pincode ? `· pincode ${me.pincode}` : ''}
              </h2>
            </div>

            {loadingCourtAdmins ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
            ) : combinedAdmins.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No court admin matches your pincode or district yet. Please check back later, or update your firm's address in
                {' '}<Link to="/organization/profile" className="text-indigo-600 hover:underline">your profile</Link>.
              </div>
            ) : (
              <>
                {eligibleCourtAdmins.length === 0 && districtAdmins.length > 0 && (
                  <div className="px-4 py-2 text-xs text-gray-500 bg-amber-50 border-b border-amber-100">
                    No exact pincode match — showing court admins across your district instead.
                  </div>
                )}
                <ul className="divide-y divide-gray-100">
                  {combinedAdmins.map((ca: any) => (
                    <li
                      key={ca.id}
                      onClick={() => setSelectedId(ca.id)}
                      className={`px-4 py-3 cursor-pointer transition ${selectedId === ca.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{ca.name}</p>
                          <p className="text-xs text-gray-500">{ca.email}</p>
                          {ca.court?.name && (
                            <p className="text-xs text-gray-500 mt-0.5">{ca.court.name} · {ca.court.city || ca.court.district}</p>
                          )}
                        </div>
                        <input
                          type="radio"
                          checked={selectedId === ca.id}
                          onChange={() => setSelectedId(ca.id)}
                          className="text-primary"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => navigate('/organization/dashboard')}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !selectedId || !me?.pincode}
            >
              {submitting ? 'Sending…' : 'Send verification request'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export default OrganizationVerificationPage
