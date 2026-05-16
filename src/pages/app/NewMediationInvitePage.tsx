import { FC, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import api, { apiEndpoints, mediationApi } from '@/services/api'

/**
 * Start a mediation (draft-free legacy flow).
 *
 * `mediationApi.createInvite` emails the other party immediately and, if
 * they're already on the platform, also fires an in-app notification — no
 * DRAFT limbo. A Mediation row is created only when they accept.
 *
 * When opened with `?caseId=…` (from the case page's "Resolution Method:
 * MEDIATION" badge) we prefill the dispute from the case and pass the
 * caseId through so the server auto-attaches the case's lawyer as the
 * initiator lawyer and links Mediation.caseId on accept.
 */
const NewMediationInvitePage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const caseId = searchParams.get('caseId') || undefined

  const [form, setForm] = useState({
    respondentName: '',
    respondentEmail: '',
    respondentPhone: '',
    disputeTitle: '',
    disputeDescription: '',
  })
  const [error, setError] = useState<string | null>(null)

  // Prefill the dispute from the source case so the initiator doesn't
  // retype it. Best-effort — a fetch failure just leaves the fields blank.
  useEffect(() => {
    if (!caseId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get<{ data: Array<{ title?: string; description?: string }> }>(
          apiEndpoints.case.getCaseDetails(caseId),
        )
        const c = res.data?.data?.[0]
        if (!cancelled && c) {
          setForm((f) => ({
            ...f,
            disputeTitle: f.disputeTitle || c.title || '',
            disputeDescription: f.disputeDescription || c.description || '',
          }))
        }
      } catch {
        /* leave blank on failure */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [caseId])

  const mutation = useMutation({
    mutationFn: () => mediationApi.createInvite({ ...form, caseId }),
    onSuccess: () => navigate('/app/mediations'),
    onError: (err: any) => setError(err?.response?.data?.error || 'Failed to send invite'),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  const input =
    'w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Start a Mediation</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send an invitation to the other party. They'll get an email (and an in-app
          notification if they're already on NyayaX). A mediation record is created when they
          accept — you can edit this invitation any time before then.
        </p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="bg-blue-50 border border-blue-100 text-blue-800 text-sm rounded-md p-3">
          <strong>How it works:</strong> We email the person below an invitation link. If they
          don't have a NyayaX account they can sign up with the invited email and respond.
          {caseId && (
            <>
              {' '}
              The lawyer on this case is automatically added as your (initiator) lawyer.
            </>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Other party's name</label>
          <input
            className={input}
            value={form.respondentName}
            onChange={(e) => setForm({ ...form, respondentName: e.target.value })}
            placeholder="Jane Doe"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              className={input}
              value={form.respondentEmail}
              onChange={(e) => setForm({ ...form, respondentEmail: e.target.value })}
              placeholder="jane@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
            <input
              className={input}
              value={form.respondentPhone}
              onChange={(e) => setForm({ ...form, respondentPhone: e.target.value })}
              placeholder="+91 98765 43210"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dispute title <span className="text-red-500">*</span>
          </label>
          <input
            required
            minLength={3}
            className={input}
            value={form.disputeTitle}
            onChange={(e) => setForm({ ...form, disputeTitle: e.target.value })}
            placeholder="Unpaid invoice for services rendered"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dispute description <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            minLength={10}
            rows={5}
            className={input}
            value={form.disputeDescription}
            onChange={(e) => setForm({ ...form, disputeDescription: e.target.value })}
            placeholder="Briefly describe the dispute, the facts, and the outcome you are seeking."
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded p-2">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-60"
          >
            {mutation.isPending ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default NewMediationInvitePage
