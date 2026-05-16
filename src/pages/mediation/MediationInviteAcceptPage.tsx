import { FC, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { mediationApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { MediationInvite } from '@/types/mediation'

const MediationInviteAcceptPage: FC = () => {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const [error, setError] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['invite', token],
    queryFn: async () => (await mediationApi.getInviteByToken(token)).data.data as MediationInvite,
    enabled: !!token,
    retry: false,
  })

  const accept = useMutation({
    mutationFn: () => mediationApi.acceptInvite(token),
    onSuccess: (r) => {
      const med = r.data.data.mediation
      navigate(`/app/mediation/${med.id}`)
    },
    onError: (err: any) => setError(err?.response?.data?.error || 'Failed to accept'),
  })

  const decline = useMutation({
    mutationFn: () => mediationApi.declineInvite(token),
    onSuccess: () => navigate('/'),
    onError: (err: any) => setError(err?.response?.data?.error || 'Failed to decline'),
  })

  useEffect(() => {
    if (q.data && isAuthenticated && user?.email && q.data.respondentEmail && user.email.toLowerCase() !== q.data.respondentEmail.toLowerCase()) {
      setError(
        `This invite was sent to ${q.data.respondentEmail}. Please log in with that email to respond.`
      )
    }
  }, [q.data, user?.email, isAuthenticated])

  if (q.isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading invite…</div>
  }

  if (q.isError || !q.data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-gray-900">Invite not found</h2>
          <p className="text-sm text-gray-500 mt-2">The link may be invalid or expired.</p>
          <Link to="/" className="inline-block mt-4 text-primary hover:underline text-sm">Go home</Link>
        </div>
      </div>
    )
  }

  const invite = q.data
  const canRespond = isAuthenticated && user?.email?.toLowerCase() === invite.respondentEmail.toLowerCase() && invite.status === 'PENDING'

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 to-primary px-6 py-6 text-white">
            <h1 className="text-2xl font-semibold">Mediation Invitation</h1>
            <p className="text-sm opacity-90 mt-1">
              {invite.initiatorClient?.name} wants to resolve a dispute with you through mediation.
            </p>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Dispute</p>
              <h2 className="text-lg font-medium text-gray-900 mt-1">{invite.disputeTitle}</h2>
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{invite.disputeDescription}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">From</p>
                <p className="font-medium text-gray-900">{invite.initiatorClient?.name}</p>
                <p className="text-gray-600">{invite.initiatorClient?.email}</p>
              </div>
              <div>
                <p className="text-gray-500">Invite sent to</p>
                <p className="font-medium text-gray-900">{invite.respondentEmail}</p>
                <p className="text-gray-600">Status: {invite.status}</p>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-100 text-sm text-amber-900 p-3">
              <strong>What is mediation?</strong> A voluntary, confidential process where a neutral mediator
              (agreed upon by both sides) helps you negotiate a settlement. Mediation avoids the cost and time
              of a trial. If it fails, the dispute can still be escalated to a case.
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded p-2">{error}</div>}

            {invite.status !== 'PENDING' ? (
              <div className="text-center text-gray-500 text-sm py-4">
                This invite has been {invite.status.toLowerCase()}.
              </div>
            ) : !isAuthenticated ? (
              <div className="flex flex-col sm:flex-row items-center gap-3 justify-center pt-2">
                <p className="text-sm text-gray-600 text-center sm:text-left flex-1">
                  Sign up or log in with <strong>{invite.respondentEmail}</strong> to respond.
                </p>
                <Link
                  to={`/auth/register?email=${encodeURIComponent(invite.respondentEmail)}&returnTo=${encodeURIComponent(`/mediation/invite/${token}`)}`}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark"
                >
                  Sign Up
                </Link>
                <Link
                  to={`/auth/login?email=${encodeURIComponent(invite.respondentEmail)}&returnTo=${encodeURIComponent(`/mediation/invite/${token}`)}`}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Log In
                </Link>
              </div>
            ) : canRespond ? (
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => decline.mutate()}
                  disabled={decline.isPending || accept.isPending}
                  className="px-5 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {decline.isPending ? 'Declining…' : 'Decline'}
                </button>
                <button
                  onClick={() => accept.mutate()}
                  disabled={accept.isPending || decline.isPending}
                  className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-60"
                >
                  {accept.isPending ? 'Accepting…' : 'Accept & Proceed'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MediationInviteAcceptPage
