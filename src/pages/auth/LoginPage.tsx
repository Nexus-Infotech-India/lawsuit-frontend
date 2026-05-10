import { FC, useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import Button from '@/components/atoms/Button'
import { ShieldCheck } from 'lucide-react'

const EyeIcon: FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
)

const EyeOffIcon: FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
)

type LoginMode = 'user' | 'admin'

const LoginPage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, isLoading, error, clearError } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  // `?mode=admin` opens the form with the Super Admin tab active. This lets
  // /auth/admin-login redirect users here while preserving the admin path.
  const [mode, setMode] = useState<LoginMode>(() => (searchParams.get('mode') === 'admin' ? 'admin' : 'user'))
  // `?session=expired` is set by the axios interceptor when an in-app refresh
  // fails — so we can show a friendly explainer instead of dropping the user
  // at a blank form.
  const sessionExpired = searchParams.get('session') === 'expired'

  useEffect(() => {
    if (searchParams.get('mode') === 'admin') setMode('admin')
  }, [searchParams])

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    if (error) clearError()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Use the user returned from login() — reading useAuthStore.getState().user
      // here is racy: other stores (userStore.getUser via HomePage's mount,
      // courtAdminStore init from shared storage) can call setState({ user })
      // synchronously between the await and the navigate, dropping the role.
      // The returned value is the canonical post-login user.
      const loggedInUser = await login(formData.email, formData.password)
      const role = loggedInUser?.role?.toString?.().toUpperCase?.()

      // If the Super Admin tab was selected but the credentials belong to a
      // non-admin account, surface a clear error rather than silently routing
      // to the user dashboard.
      if (mode === 'admin' && role !== 'ADMIN') {
        useAuthStore.getState().logout()
        useAuthStore.setState({ error: 'These credentials are not for a platform admin account.' })
        return
      }

      if (role === 'LAWYER') {
        navigate('/lawyer/dashboard', { replace: true })
      } else if (role === 'ADMIN') {
        navigate('/admin/dashboard', { replace: true })
      } else if (role === 'ORGANIZATION') {
        navigate('/organization/dashboard', { replace: true })
      } else {
        // default to client home
        navigate('/app/home', { replace: true })
      }
    } catch (err) {
      // Error is handled by the store
      console.error('Login failed:', err)
    }
  }

  const isAdmin = mode === 'admin'

  return (
    <div className={`min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 ${isAdmin ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900' : 'bg-gray-50'}`}>
      <div className="max-w-md w-full space-y-8">
        <div>
          {isAdmin && (
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-300/30 text-indigo-100 text-xs font-medium uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                Platform admin access
              </div>
            </div>
          )}
          <h2 className={`mt-2 text-center text-3xl font-extrabold ${isAdmin ? 'text-white' : 'text-gray-900'}`}>
            {isAdmin ? 'Super Admin Sign In' : 'Sign in to your account'}
          </h2>
          <div className={`mt-4 inline-flex w-full rounded-lg p-1 text-sm font-medium ${isAdmin ? 'bg-white/10 backdrop-blur' : 'bg-gray-100'}`}>
            <button
              type="button"
              onClick={() => setMode('user')}
              aria-pressed={mode === 'user'}
              className={`flex-1 px-3 py-1.5 rounded-md transition-colors ${mode === 'user'
                ? 'bg-white text-primary shadow-sm'
                : isAdmin ? 'text-white/70 hover:text-white' : 'text-gray-600 hover:text-primary hover:bg-white/60'
                }`}
              title="Clients, lawyers, and law firms all sign in here"
            >
              Client / Lawyer / Firm
            </button>
            <button
              type="button"
              onClick={() => navigate('/auth/court-admin-login')}
              className={`flex-1 px-3 py-1.5 rounded-md transition-colors ${isAdmin ? 'text-white/70 hover:text-white' : 'text-gray-600 hover:text-primary hover:bg-white/60'
                }`}
            >
              Court Admin
            </button>
            <button
              type="button"
              onClick={() => setMode('admin')}
              aria-pressed={mode === 'admin'}
              className={`flex-1 px-3 py-1.5 rounded-md transition-colors inline-flex items-center justify-center gap-1 ${mode === 'admin'
                ? 'bg-indigo-600 text-white shadow-sm'
                : isAdmin ? 'text-white/70 hover:text-white' : 'text-gray-600 hover:text-indigo-600 hover:bg-white/60'
                }`}
              title="Platform admins (SUPER_ADMIN / ADMIN) sign in here"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Super Admin
            </button>
          </div>

          {isAdmin ? (
            <p className="mt-3 text-center text-xs text-white/70">
              Restricted access. Activity is audit-logged. Use your platform admin credentials.
            </p>
          ) : (
            <>
              <p className="mt-2 text-center text-xs text-gray-500">
                Law firms: sign in with the email used while registering. New firm?{' '}
                <Link to="/auth/register" className="text-primary hover:text-primary-dark font-medium">
                  Register your firm
                </Link>
                .
              </p>
              <p className="mt-4 text-center text-sm text-gray-600">
                Or{' '}
                <Link to="/auth/register" className="font-medium text-primary hover:text-primary-dark">
                  create a new account
                </Link>
              </p>
            </>
          )}
        </div>

        <form
          className={`mt-8 space-y-6 ${isAdmin ? 'bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6' : ''}`}
          onSubmit={handleSubmit}
        >
          {sessionExpired && !error && (
            <div className={`rounded-md p-4 ${isAdmin ? 'bg-amber-500/20 border border-amber-400/30' : 'bg-amber-50 border border-amber-100'}`}>
              <div className={`text-sm ${isAdmin ? 'text-amber-100' : 'text-amber-800'}`}>
                Your session has expired. Please sign in again to continue.
              </div>
            </div>
          )}
          {error && (
            <div className={`rounded-md p-4 ${isAdmin ? 'bg-red-500/20 border border-red-400/30' : 'bg-red-50'}`}>
              <div className={`text-sm ${isAdmin ? 'text-red-100' : 'text-red-700'}`}>{error}</div>
            </div>
          )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border placeholder-gray-500 rounded-t-md focus:outline-none focus:z-10 sm:text-sm ${isAdmin
                  ? 'border-white/20 bg-white/10 text-white placeholder-white/50 focus:ring-indigo-400 focus:border-indigo-400'
                  : 'border-gray-300 text-gray-900 focus:ring-primary focus:border-primary'
                  }`}
                placeholder={isAdmin ? 'Admin email' : 'Email address'}
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className={`appearance-none rounded-none relative block w-full px-3 py-2 pr-10 border placeholder-gray-500 rounded-b-md focus:outline-none focus:z-10 sm:text-sm ${isAdmin
                  ? 'border-white/20 bg-white/10 text-white placeholder-white/50 focus:ring-indigo-400 focus:border-indigo-400'
                  : 'border-gray-300 text-gray-900 focus:ring-primary focus:border-primary'
                  }`}
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className={`absolute inset-y-0 right-0 flex items-center pr-3 z-10 ${isAdmin ? 'text-white/60 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className={`ml-2 block text-sm ${isAdmin ? 'text-white/80' : 'text-gray-900'}`}>
                Remember me
              </label>
            </div>

            {!isAdmin && (
              <div className="text-sm">
                <Link to="/auth/forgot-password" className="font-medium text-primary hover:text-primary-dark">
                  Forgot your password?
                </Link>
              </div>
            )}
          </div>

          <div>
            {isAdmin ? (
              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                {isLoading ? 'Signing in…' : 'Sign in as Super Admin'}
              </button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            )}
          </div>

          {isAdmin && (
            <p className="text-center text-xs text-white/50">
              Not a platform admin?{' '}
              <button
                type="button"
                onClick={() => setMode('user')}
                className="text-indigo-300 hover:text-indigo-200 underline"
              >
                Switch to user sign in
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

export default LoginPage