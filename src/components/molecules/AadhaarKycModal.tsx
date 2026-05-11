import { FC, useEffect, useState, useRef } from 'react'
import { X, ShieldCheck, Loader2, AlertCircle, Check, RefreshCw, Lock, Mail } from 'lucide-react'
import { ekycApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { friendlyError } from '@/utils/errors'
import { ekycProviderLabel } from '@/utils/ekycProvider'

interface AadhaarKycModalProps {
  open: boolean
  onClose: () => void
  /** Existing pending submission to resume — skips the Aadhaar step. */
  resumeSubmission?: { id: string; expiresAt?: string | null } | null
  /** Fired when the user successfully verifies. Parent should refetch status. */
  onVerified?: () => void
}

// Steps:
//   aadhaar         → step 1 of the Aadhaar path (also hosts the OR-alternative card)
//   otp             → step 2 of the Aadhaar path
//   email-otp       → step 2 of the temporary email-OTP fallback path
//   done            → success (works for either path)
type Step = 'aadhaar' | 'otp' | 'email-otp' | 'done'

// Which path the user is currently on. Drives copy ("Aadhaar verified" vs
// "Identity verified — temporary"), the success-screen note, and the OTP
// submit handler.
type Path = 'AADHAAR' | 'EMAIL_OTP'

// Format 1234 5678 9012 as the user types
const formatAadhaar = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 12)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

const AadhaarKycModal: FC<AadhaarKycModalProps> = ({ open, onClose, resumeSubmission, onVerified }) => {
  const setUser = useAuthStore((s) => s.setUser)
  const me = useAuthStore((s) => s.user)
  const [step, setStep] = useState<Step>('aadhaar')
  const [path, setPath] = useState<Path>('AADHAAR')
  const [aadhaar, setAadhaar] = useState('')
  const [consent, setConsent] = useState(false)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [sentToEmailMasked, setSentToEmailMasked] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Flips to `true` the first time the Aadhaar OTP send fails because the
   * UIDAI provider (Sandbox.co.in) returns "Insufficient privilege" — i.e.
   * production API access hasn't been provisioned for this account yet.
   * When set, we replace the scary inline error with a calm explainer and
   * visually emphasise the Email OTP fallback section below.
   */
  const [providerUnavailable, setProviderUnavailable] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [verifiedClient, setVerifiedClient] = useState<{
    aadhaarLast4?: string
    aadhaarName?: string
    ekycVerifiedVia?: 'AADHAAR' | 'EMAIL_OTP'
  } | null>(null)
  const otpInputRef = useRef<HTMLInputElement>(null)

  // Reset on open / handle resume
  useEffect(() => {
    if (!open) return
    setError(null)
    setOtp('')
    setVerifiedClient(null)
    setConsent(false)
    setSentToEmailMasked(null)
    setPath('AADHAAR')
    if (resumeSubmission?.id) {
      setSubmissionId(resumeSubmission.id)
      setExpiresAt(resumeSubmission.expiresAt ?? null)
      setStep('otp')
      setAadhaar('')
    } else {
      setSubmissionId(null)
      setExpiresAt(null)
      setStep('aadhaar')
      setAadhaar('')
    }
  }, [open, resumeSubmission?.id, resumeSubmission?.expiresAt])

  // Countdown for OTP expiry — covers both Aadhaar (step='otp') and email
  // (step='email-otp') paths since both share `expiresAt`.
  useEffect(() => {
    if ((step !== 'otp' && step !== 'email-otp') || !expiresAt) {
      setSecondsLeft(null)
      return
    }
    const target = new Date(expiresAt).getTime()
    const tick = () => {
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000))
      setSecondsLeft(left)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [step, expiresAt])

  // Autofocus OTP field when entering either step-2 (Aadhaar OR email).
  useEffect(() => {
    if (step === 'otp' || step === 'email-otp') {
      const t = setTimeout(() => otpInputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [step])

  if (!open) return null

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = aadhaar.replace(/\s/g, '')
    if (cleaned.length !== 12) {
      setError('Aadhaar must be 12 digits.')
      return
    }
    if (!consent) {
      setError('Please confirm you understand how Aadhaar OTP is used.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await ekycApi.initiateAadhaar(cleaned)
      const data = (res.data?.data ?? res.data) as { id: string; expiresAt?: string }
      setSubmissionId(data.id)
      setExpiresAt(data.expiresAt ?? null)
      setStep('otp')
      setOtp('')
    } catch (err: any) {
      // Specialised messages for known statuses, otherwise route through
      // friendlyError so server-supplied text wins.
      const status = err?.response?.status
      const data = err?.response?.data as any
      // Sandbox.co.in returns `{ error: { code: 'server_error', message: 'Insufficient privilege' } }`
      // when the UIDAI production API hasn't been provisioned for the account.
      // Detect either the structured error code OR the literal message so a
      // small wording change on their side doesn't reopen this bug.
      const providerCode = data?.error?.code || data?.error?.error?.code
      const providerMsg = (data?.error?.message || data?.error?.error?.message || data?.error || data?.message || '').toString().toLowerCase()
      const isProviderUnavailable =
        providerCode === 'server_error' ||
        providerMsg.includes('insufficient privilege') ||
        providerMsg.includes('provider not configured') ||
        status === 503

      if (isProviderUnavailable) {
        setProviderUnavailable(true)
        // No inline red banner — the calm explainer below replaces it.
        setError(null)
      } else if (status === 429) {
        setError("You've requested too many OTPs in the last hour. Please wait and try again.")
      } else if (status === 409) {
        setError('Your account is already verified — no further action needed.')
      } else {
        setError(friendlyError(err, "We couldn't send the OTP right now."))
      }
    } finally {
      setBusy(false)
    }
  }

  // Shared OTP submitter — branches between the Aadhaar path and the
  // temporary email-OTP fallback based on `path` state.
  const handleSubmitOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!submissionId) return
    if (otp.length !== 6) {
      setError('Enter the 6-digit OTP.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = path === 'EMAIL_OTP'
        ? await ekycApi.submitEmailOtp(submissionId, otp)
        : await ekycApi.submitOtp(submissionId, otp)
      const client = (res.data?.data ?? res.data) as {
        ekycVerified?: boolean
        ekycVerifiedAt?: string
        ekycVerifiedVia?: 'AADHAAR' | 'EMAIL_OTP'
        aadhaarLast4?: string
        aadhaarName?: string
      }
      setVerifiedClient(client)
      // Mirror the verified flag onto the auth-store user so EkycGuard,
      // EkycStatusCard, and any other consumer reflect it without a
      // /auth/me round-trip.
      if (client?.ekycVerified) {
        setUser((prev) => prev ? ({
          ...prev,
          ekycVerified: true,
          ekycVerifiedAt: client.ekycVerifiedAt,
          ekycVerifiedVia: client.ekycVerifiedVia ?? path,
          aadhaarLast4: client.aadhaarLast4,
          aadhaarName: client.aadhaarName,
        } as any) : prev)
      }
      setStep('done')
      onVerified?.()
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 410) {
        // Server returns 410 GONE when the OTP expired. Bounce back to the
        // step-1 chooser so the user can re-request via either path.
        setError('That OTP has expired. Please request a new one.')
        setStep('aadhaar')
        setPath('AADHAAR')
        setSubmissionId(null)
        setExpiresAt(null)
        setOtp('')
        setSentToEmailMasked(null)
      } else if (status === 429) {
        setError("Too many OTP attempts. Please wait 15 minutes and try again.")
      } else {
        // 400 with body { data: submission, error: '...' } means the OTP was
        // wrong. Show the server's reason and clear OTP for re-entry.
        setError(friendlyError(err, "That OTP didn't work. Double-check the digits and try again."))
        setOtp('')
      }
    } finally {
      setBusy(false)
    }
  }

  // Temporary email-OTP fallback: triggered from the OR-alternative card on
  // the step-1 Aadhaar screen. No input from the user — server uses the
  // registered email and replies with a masked version we display.
  const handleInitiateEmailOtp = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await ekycApi.initiateEmailOtp()
      const data = (res.data?.data ?? res.data) as {
        id: string
        expiresAt?: string
        sentToEmailMasked?: string
      }
      setPath('EMAIL_OTP')
      setSubmissionId(data.id)
      setExpiresAt(data.expiresAt ?? null)
      setSentToEmailMasked(data.sentToEmailMasked ?? null)
      setStep('email-otp')
      setOtp('')
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 429) {
        setError("You've requested too many OTPs in the last hour. Please wait and try again.")
      } else if (status === 409) {
        setError('Your account is already verified — no further action needed.')
      } else if (status === 502) {
        setError("We couldn't send the email right now. Please try again in a moment.")
      } else {
        setError(friendlyError(err, "We couldn't send the OTP email right now."))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleResend = () => {
    // Restart from step 1. For EMAIL_OTP, that means tapping the alternative
    // card again — same UX as Aadhaar resend.
    setStep('aadhaar')
    setPath('AADHAAR')
    setSubmissionId(null)
    setExpiresAt(null)
    setSentToEmailMasked(null)
    setOtp('')
    setError(null)
  }

  const otpExpired = secondsLeft != null && secondsLeft <= 0

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {path === 'EMAIL_OTP' ? 'Identity verification' : 'Aadhaar eKYC'}
              </h2>
              <p className="text-xs text-gray-500">
                {step === 'aadhaar' && 'Step 1 of 2 · Aadhaar or email OTP'}
                {step === 'otp' && 'Step 2 of 2 · Enter Aadhaar OTP'}
                {step === 'email-otp' && 'Step 2 of 2 · Enter email OTP (temporary)'}
                {step === 'done' && (path === 'EMAIL_OTP' ? 'Verified (temporary)' : 'Verified')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step content */}
        {step === 'aadhaar' && (
          <form onSubmit={handleInitiate} className="p-5 space-y-4">
            <p className="text-sm text-gray-600">
              We'll send a one-time OTP to the mobile number linked with your Aadhaar.
              Your Aadhaar number is hashed before storage and never shown back.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Aadhaar number</label>
              <input
                value={aadhaar}
                onChange={(e) => setAadhaar(formatAadhaar(e.target.value))}
                inputMode="numeric"
                placeholder="1234 5678 9012"
                maxLength={14}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 font-mono tracking-wider"
              />
            </div>

            {/* Consent — required before initiating UIDAI OTP. Mirrors the
                mobile app and gives us a clear audit trail. */}
            <label className="flex items-start gap-2 cursor-pointer text-xs text-gray-600 leading-relaxed">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-200"
              />
              <span>
                I consent to NyayaX initiating an Aadhaar OTP via UIDAI. I understand my Aadhaar number is hashed
                (SHA-256) before storage; only the last 4 digits and my registered name are retained. My consent
                is recorded for audit purposes.
              </span>
            </label>

            {error && !providerUnavailable && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}

            {/* Calm explainer when the UIDAI sandbox provider is unavailable —
                points at the Email OTP fallback below so the user has a clear
                path forward instead of staring at a "Insufficient privilege"
                error from the upstream provider. */}
            {providerUnavailable && (
              <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700" />
                <div>
                  <div className="font-semibold">Aadhaar verification isn't live yet</div>
                  <div className="text-xs text-amber-800 mt-0.5">
                    Our UIDAI Aadhaar OTP integration is still pending provider
                    approval. Please use the <strong>Email OTP</strong> option below
                    for now — you'll be verified just as well, and we'll upgrade
                    you to Aadhaar verification automatically once it's live.
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || aadhaar.replace(/\s/g, '').length !== 12 || !consent || providerUnavailable}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={providerUnavailable ? 'Aadhaar provider is not available yet — please use Email OTP below.' : undefined}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {busy ? 'Sending OTP…' : providerUnavailable ? 'Aadhaar OTP unavailable' : 'Send OTP'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              Up to 5 OTP requests per hour. Delivery is handled by UIDAI.
            </p>
            <p className="text-[10px] text-gray-400 text-center -mt-2">
              Powered by <span className="font-medium">{ekycProviderLabel('sandbox')}</span>
            </p>

            {/* ─── OR — Temporary alternative (email OTP) ───────────────
                Shown while the Aadhaar provider API key is not yet active.
                Sends a 6-digit OTP to the email registered on the account
                and grants the same `ekycVerified=true` flag (tagged as
                EMAIL_OTP so the badge / super-admin filter can distinguish
                it from a full Aadhaar verification). */}
            <div className="relative pt-2">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="font-medium tracking-wider">OR</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            </div>

            {/* Visual emphasis bumps up (ring + slightly stronger bg) when
                the Aadhaar flow failed because the provider is unavailable —
                helps the user spot the recommended next step immediately. */}
            <div
              className={`rounded-lg border p-4 transition-shadow ${
                providerUnavailable
                  ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
                  : 'border-amber-200 bg-amber-50/60'
              }`}
            >
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-amber-900">
                    {providerUnavailable ? 'Use this instead — Email OTP' : 'Temporary alternative — Email OTP'}
                  </h4>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    {providerUnavailable
                      ? 'Until the Aadhaar provider goes live, this is the recommended way to verify. We send a 6-digit OTP to your registered email '
                      : "The Aadhaar provider isn't connected yet. As a temporary measure, you can verify with a 6-digit OTP sent to your registered email "}
                    {me?.email ? <>(<span className="font-mono">{me.email}</span>).</> : '.'}{' '}
                    You'll be marked verified for now; we'll ask you to upgrade
                    to Aadhaar verification once that flow is live.
                  </p>
                  <button
                    type="button"
                    onClick={handleInitiateEmailOtp}
                    disabled={busy}
                    className={`mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50 ${
                      providerUnavailable
                        ? 'bg-amber-600 text-white border border-amber-600 hover:bg-amber-700'
                        : 'border border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    {busy && path === 'EMAIL_OTP'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Mail className="w-3.5 h-3.5" />}
                    {busy && path === 'EMAIL_OTP' ? 'Sending…' : 'Send email OTP instead'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleSubmitOtp} className="p-5 space-y-4">
            <p className="text-sm text-gray-600">
              Enter the 6-digit OTP sent to your Aadhaar-linked mobile number.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">OTP</label>
              <input
                ref={otpInputRef}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="••••••"
                maxLength={6}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 font-mono tracking-[0.4em] text-center text-lg"
              />
              {secondsLeft != null && (
                <div className={`mt-1.5 text-xs ${otpExpired ? 'text-red-600' : 'text-gray-500'}`}>
                  {otpExpired
                    ? 'OTP expired. Please request a new one.'
                    : `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
                </div>
              )}
            </div>
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Resend
              </button>
              <button
                type="submit"
                disabled={busy || otp.length !== 6 || otpExpired}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {busy ? 'Verifying…' : 'Verify'}
              </button>
            </div>
          </form>
        )}

        {/* Step 2 of the temporary email-OTP fallback. Same OTP input as the
            Aadhaar path; copy + colour cues mark this as the temporary route. */}
        {step === 'email-otp' && (
          <form onSubmit={handleSubmitOtp} className="p-5 space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Temporary verification — using email OTP while the Aadhaar
              provider is unavailable.
            </div>
            <p className="text-sm text-gray-600">
              Enter the 6-digit OTP we sent to{' '}
              <span className="font-medium">
                {sentToEmailMasked || me?.email || 'your registered email'}
              </span>.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">OTP</label>
              <input
                ref={otpInputRef}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="••••••"
                maxLength={6}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 font-mono tracking-[0.4em] text-center text-lg"
              />
              {secondsLeft != null && (
                <div className={`mt-1.5 text-xs ${otpExpired ? 'text-red-600' : 'text-gray-500'}`}>
                  {otpExpired
                    ? 'OTP expired. Please request a new one.'
                    : `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
                </div>
              )}
            </div>
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="submit"
                disabled={busy || otp.length !== 6 || otpExpired}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {busy ? 'Verifying…' : 'Verify'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="p-6 text-center">
            <div className={`w-14 h-14 mx-auto rounded-full ${path === 'EMAIL_OTP' ? 'bg-amber-50' : 'bg-green-50'} flex items-center justify-center mb-3`}>
              <Check className={`w-7 h-7 ${path === 'EMAIL_OTP' ? 'text-amber-600' : 'text-green-600'}`} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {path === 'EMAIL_OTP' ? 'Identity verified — temporary' : 'Aadhaar verified'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {path === 'EMAIL_OTP' ? (
                <>
                  Your account is verified via email OTP for now. We'll prompt
                  you to upgrade to Aadhaar verification once that flow is live.
                </>
              ) : (
                <>
                  {verifiedClient?.aadhaarName ? `Welcome, ${verifiedClient.aadhaarName}.` : 'Your eKYC is complete.'}
                  {verifiedClient?.aadhaarLast4 && (
                    <> Aadhaar ending <strong>{verifiedClient.aadhaarLast4}</strong>.</>
                  )}
                </>
              )}
            </p>
            <button
              onClick={onClose}
              className={`mt-5 px-5 py-2 rounded-lg text-white text-sm font-medium ${path === 'EMAIL_OTP' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AadhaarKycModal
