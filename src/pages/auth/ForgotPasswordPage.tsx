import { FC, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react'
import { authApi } from '@/services/api'
import { friendlyError } from '@/utils/errors'

/**
 * Forgot-password flow.
 *
 * Two steps:
 *  1. Identifier (email or phone) → `authApi.requestOtp` sends a code.
 *  2. OTP + new password → `authApi.restorePassword` rotates the password.
 *
 * On success we bounce to /auth/login with the email pre-suggested via state.
 */
type Step = 'identifier' | 'reset' | 'done'

const ForgotPasswordPage: FC = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('identifier')
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!identifier.trim()) {
      setError('Enter your email or phone number.')
      return
    }
    setBusy(true)
    try {
      await authApi.requestOtp(identifier.trim())
      setInfo("We've sent you a 6-digit code. Check your inbox or SMS.")
      setStep('reset')
    } catch (err) {
      setError(friendlyError(err, "We couldn't send the code. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      await authApi.requestOtp(identifier.trim())
      setInfo('A new code is on its way.')
    } catch (err) {
      setError(friendlyError(err, "We couldn't resend the code."))
    } finally {
      setBusy(false)
    }
  }

  const finishReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!/^\d{4,8}$/.test(code.trim())) {
      setError('Enter the verification code from your email/SMS.')
      return
    }
    if (password.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError("Password and confirmation don't match.")
      return
    }
    setBusy(true)
    try {
      await authApi.restorePassword({ identifier: identifier.trim(), code: code.trim(), password })
      setStep('done')
      setTimeout(() => navigate('/auth/login', { replace: true }), 1500)
    } catch (err) {
      setError(friendlyError(err, "We couldn't reset your password."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-indigo-50">
              <KeyRound className="w-5 h-5 text-indigo-600" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {step === 'done' ? 'Password reset' : 'Reset your password'}
            </h1>
          </div>

          {step === 'identifier' && (
            <p className="text-sm text-gray-500 mb-6">
              Enter the email or phone number on your account. We'll send you a 6-digit verification code.
            </p>
          )}
          {step === 'reset' && (
            <p className="text-sm text-gray-500 mb-6">
              Enter the code we sent and pick a new password.
            </p>
          )}

          {info && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700 mb-4 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {info}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {step === 'identifier' && (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email or phone</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com or +91 9876543210"
                    autoComplete="username"
                    required
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {busy ? 'Sending code…' : 'Send code'}
              </button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={finishReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Verification code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  required
                  className="w-full tracking-[0.4em] text-center px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  type="button"
                  onClick={resend}
                  disabled={busy}
                  className="mt-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
              <PasswordField
                label="New password"
                value={password}
                onChange={setPassword}
                show={showPw}
                onToggle={() => setShowPw((s) => !s)}
                hint="At least 8 characters."
              />
              <PasswordField
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                show={showPw}
                onToggle={() => setShowPw((s) => !s)}
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {busy ? 'Updating password…' : 'Reset password'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('identifier')
                  setError(null)
                  setInfo(null)
                  setCode('')
                  setPassword('')
                  setConfirm('')
                }}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 inline-flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Use a different email/phone
              </button>
            </form>
          )}

          {step === 'done' && (
            <div className="rounded-lg border border-green-100 bg-green-50 p-4 flex items-start gap-2 text-sm text-green-800">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-600" />
              <div>
                <div className="font-semibold">Password updated</div>
                <div className="text-xs text-green-700/80 mt-0.5">
                  Redirecting you to sign in with your new password…
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          Remembered it?{' '}
          <Link to="/auth/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

const PasswordField: FC<{
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  hint?: string
}> = ({ label, value, onChange, show, onToggle, hint }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        required
        className="w-full pl-3 pr-10 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
    {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
  </div>
)

export default ForgotPasswordPage
