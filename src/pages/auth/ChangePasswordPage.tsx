import { FC, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { friendlyError } from '@/utils/errors'

/**
 * Change-password page.
 *
 * Two modes, picked from the `?force=1` query param (set by the
 * `mustChangePassword` route guard):
 *
 *  - `force` mode  — the user can't navigate away (no Cancel button, copy
 *    explains why), and on success we redirect into the role's dashboard.
 *  - voluntary    — used from Settings; shows a Cancel that returns the user
 *    to the previous page.
 *
 * The server endpoint also clears the `mustChangePassword` flag, so we patch
 * the auth store on success and the route guard auto-releases.
 */
const ChangePasswordPage: FC = () => {
  const [params] = useSearchParams()
  const isForced = params.get('force') === '1'
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const role = useAuthStore((s) => s.user?.role)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!currentPassword) {
      setError('Please enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.")
      return
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current one.')
      return
    }

    setSubmitting(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev))
      setSuccess(true)
      // Redirect into the role's home shortly so the user sees the success
      // state for a beat instead of being thrown straight back to the dashboard.
      const dest =
        role === 'LAWYER'
          ? '/lawyer/dashboard'
          : role === 'ORGANIZATION'
            ? '/organization/dashboard'
            : role === 'ADMIN'
              ? '/admin/dashboard'
              : '/app/home'
      setTimeout(() => navigate(dest, { replace: true }), 1200)
    } catch (err) {
      setError(friendlyError(err, "We couldn't change your password."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-indigo-50">
              {isForced ? (
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
              ) : (
                <Lock className="w-5 h-5 text-indigo-600" />
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {isForced ? 'Change your password' : 'Change password'}
            </h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            {isForced
              ? "For your security, you'll need to set a new password before continuing."
              : 'Enter your current password and pick a new one. Use at least 8 characters.'}
          </p>

          {success ? (
            <div className="rounded-lg border border-green-100 bg-green-50 p-4 flex items-start gap-2 text-sm text-green-800">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-600" />
              <div>
                <div className="font-semibold">Password updated</div>
                <div className="text-xs text-green-700/80 mt-0.5">Redirecting you back in a moment…</div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <PasswordField
                label="Current password"
                value={currentPassword}
                onChange={setCurrentPassword}
                show={showCurrent}
                onToggle={() => setShowCurrent((s) => !s)}
                autoComplete="current-password"
                required
              />
              <PasswordField
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                show={showNew}
                onToggle={() => setShowNew((s) => !s)}
                autoComplete="new-password"
                required
                hint="At least 8 characters."
              />
              <PasswordField
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showNew}
                onToggle={() => setShowNew((s) => !s)}
                autoComplete="new-password"
                required
              />

              {error && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {submitting ? 'Updating…' : 'Update password'}
              </button>

              {!isForced && (
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              )}
            </form>
          )}
        </div>

        {isForced && !success && (
          <p className="mt-4 text-center text-xs text-gray-400">
            You can't access the rest of the app until your password is updated.
          </p>
        )}
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
  autoComplete?: string
  required?: boolean
  hint?: string
}> = ({ label, value, onChange, show, onToggle, autoComplete, required, hint }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}
      {required && <span className="text-red-500"> *</span>}
    </label>
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="w-full pl-3 pr-10 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
    {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
  </div>
)

export default ChangePasswordPage
