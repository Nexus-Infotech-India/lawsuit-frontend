import { FC, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import Button from '@/components/atoms/Button'

const RESEND_TIMEOUT = 30 // seconds

const OtpVerifyPage: FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { verifyOtp, isLoading, error, clearError } = useAuthStore()

  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  // identifier can be email or phone depending on the flow
  const [identifier, setIdentifier] = useState('')
  const [resendTimer, setResendTimer] = useState(0)

  useEffect(() => {
    // Accept several possible state keys (identifier, email, userId) so the page
    // can be reached from different flows. If none present, keep user on the page
    // and allow manual entry (do not redirect to login immediately).
    const state = (location.state || {}) as any
    const id = state?.identifier ?? state?.email ?? state?.userId ?? ''
    if (id) {
      setIdentifier(String(id))
    }
  }, [location])

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(t => t - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendTimer])

  const handleChange = (index: number, value: string) => {
    if (error) clearError()

    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    // Auto focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`)
      nextInput?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace to clear current and focus previous
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp]
      newOtp[index - 1] = ''
      setOtp(newOtp)
      const prevInput = document.getElementById(`otp-${index - 1}`)
      prevInput?.focus()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const otpString = otp.join('')
    if (otpString.length !== 6) return

    try {
      // if identifier isn't set (rare) let user continue if they filled an input
      const idToVerify = identifier
      await verifyOtp(idToVerify, otpString)
      const user = useAuthStore.getState().user?.role?.toString?.().toUpperCase?.()
      if (user === 'LAWYER') {
        navigate('/lawyer/appointments', { replace: true })
      } else if (user === 'ADMIN') {
        navigate('/admin/dashboard', { replace: true })
      } else if (user === 'COURT_ADMIN') {
        navigate('/court-admin/dashboard', { replace: true })
      } else {
        // default to client home
        navigate('/app/home', { replace: true })
      }
    } catch (err) {
      // Error is handled by the store
      console.error('OTP verification failed:', err)
    }
  }

  const handleResendOtp = () => {
    // TODO: Implement resend OTP functionality
    setResendTimer(RESEND_TIMEOUT)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Verify your email
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            We've sent a 6-digit code to your email address. Please enter it below.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div className="flex justify-center space-x-2">
            {otp.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                maxLength={1}
                className="w-12 h-12 text-center text-2xl rounded-lg border-gray-300 focus:border-primary focus:ring-primary"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                autoComplete="off"
              />
            ))}
          </div>

          <div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={isLoading || otp.join('').length !== 6}
            >
              {isLoading ? 'Verifying...' : 'Verify Email'}
            </Button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              Didn't receive the code?{' '}
              {resendTimer > 0 ? (
                <span className="text-gray-400">
                  Resend in {resendTimer}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  className="text-primary hover:text-primary-dark font-medium"
                >
                  Resend code
                </button>
              )}
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

export default OtpVerifyPage