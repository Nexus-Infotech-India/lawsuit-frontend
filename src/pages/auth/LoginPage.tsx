import { FC, useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import Button from '@/components/atoms/Button'
import BrandLogo from '@/components/atoms/BrandLogo'
import {
  ShieldCheck,
  User as UserIcon,
  Scale,
  Building2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react'

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

type UserRole = 'client' | 'lawyer' | 'organization'

interface RoleCard {
  id: UserRole
  /** Backend role string returned by login() — used for strict enforcement. */
  serverRole: 'CLIENT' | 'LAWYER' | 'ORGANIZATION'
  label: string
  short: string
  description: string
  icon: FC<{ className?: string }>
  /** Post-login redirect path. */
  redirectTo: string
}

const ROLE_CARDS: RoleCard[] = [
  {
    id: 'client',
    serverRole: 'CLIENT',
    label: 'Sign in as Client',
    short: 'Client',
    description: 'Personal legal services & consultations',
    icon: UserIcon,
    redirectTo: '/app/home',
  },
  {
    id: 'lawyer',
    serverRole: 'LAWYER',
    label: 'Sign in as Lawyer',
    short: 'Lawyer',
    description: 'Practising advocate / mediator',
    icon: Scale,
    redirectTo: '/lawyer/dashboard',
  },
  {
    id: 'organization',
    serverRole: 'ORGANIZATION',
    label: 'Sign in as Law Firm',
    short: 'Law Firm',
    description: 'Multi-lawyer organization',
    icon: Building2,
    redirectTo: '/organization/dashboard',
  },
]

const niceServerRole = (r: string | undefined): string => {
  switch ((r || '').toUpperCase()) {
    case 'CLIENT':
      return 'Client'
    case 'LAWYER':
      return 'Lawyer'
    case 'ORGANIZATION':
      return 'Law Firm'
    case 'ADMIN':
      return 'Platform Admin'
    case 'COURT_ADMIN':
      return 'Court Admin'
    default:
      return 'this'
  }
}

/**
 * User sign-in (Client / Lawyer / Law Firm).
 *
 * Two-step flow:
 *   1. Pick role (3 cards)
 *   2. Enter credentials — server role MUST match the selected role, or
 *      we log the user back out and surface a friendly error.
 *
 * Court Admin and Super Admin sign-in live on `/auth/administrators` —
 * a dedicated hub away from the public user surface.
 */
const LoginPage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, isLoading, error, clearError } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  // Set by axios interceptor when an in-app refresh fails.
  const sessionExpired = searchParams.get('session') === 'expired'

  // `?as=client|lawyer|organization` deep-link from the register page lets
  // the user land directly on the credentials step.
  const presetRole = ((): UserRole | null => {
    const r = searchParams.get('as')
    if (r === 'lawyer' || r === 'organization' || r === 'client') return r
    return null
  })()

  // `?email=` prefills the field (mediation invite "Log In" link sends the
  // invited address). `?returnTo=` is where we land after a successful
  // login instead of the role dashboard (so the invitee goes straight
  // back to the invite-accept page).
  const presetEmail = searchParams.get('email') || ''
  const returnTo = searchParams.get('returnTo')

  const [step, setStep] = useState<'pick' | 'form'>(
    presetRole || presetEmail ? 'form' : 'pick',
  )
  const [role, setRole] = useState<UserRole>(presetRole ?? 'client')
  const [formData, setFormData] = useState({ email: presetEmail, password: '' })

  // Keep deep-link param in sync if it changes after mount (rare, but safe).
  useEffect(() => {
    const r = searchParams.get('as')
    if (r === 'lawyer' || r === 'organization' || r === 'client') {
      setRole(r)
      setStep('form')
    }
  }, [searchParams])

  const activeCard = ROLE_CARDS.find(c => c.id === role) ?? ROLE_CARDS[0]

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (error) clearError()
  }

  const pickRole = (next: UserRole) => {
    setRole(next)
    setStep('form')
    if (error) clearError()
  }

  const backToPick = () => {
    setStep('pick')
    if (error) clearError()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const loggedInUser = await login(formData.email, formData.password)
      const actualRole = loggedInUser?.role?.toString?.().toUpperCase?.()

      // STRICT role enforcement. If the credentials don't match the chosen
      // role, sign them right back out and tell them which role this email
      // actually belongs to.
      if (actualRole !== activeCard.serverRole) {
        useAuthStore.getState().logout()
        const actualNice = niceServerRole(actualRole)
        useAuthStore.setState({
          error: `These credentials belong to a ${actualNice} account, not a ${activeCard.short} account. Pick the right role or use different credentials.`,
        })
        return
      }

      // Honour an explicit return target (e.g. the mediation invite
      // page) over the default role dashboard. Only allow same-origin
      // relative paths so the param can't be used as an open redirect.
      if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        navigate(returnTo, { replace: true })
      } else {
        navigate(activeCard.redirectTo, { replace: true })
      }
    } catch (err) {
      console.error('Login failed:', err)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className={`${step === 'pick' ? 'max-w-3xl' : 'max-w-md'} w-full`}>
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <BrandLogo to={null} size="lg" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            {step === 'pick' ? 'Welcome back' : `Sign in as ${activeCard.short}`}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {step === 'pick' ? 'Pick how you want to sign in' : 'Enter your credentials'}
          </p>
        </div>

        {sessionExpired && !error && step === 'pick' && (
          <div className="mb-4 rounded-md p-3 bg-amber-50 border border-amber-100 text-sm text-amber-800">
            Your session has expired. Please sign in again to continue.
          </div>
        )}

        {step === 'pick' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {ROLE_CARDS.map(card => {
                const Icon = card.icon
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => pickRole(card.id)}
                    className="group text-left bg-white rounded-2xl border-2 border-gray-200 p-6 hover:border-primary hover:shadow-md transition-all"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-colors">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="font-semibold text-gray-900 text-base mb-1">{card.label}</div>
                    <div className="text-sm text-gray-500 leading-snug">{card.description}</div>
                    <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                      Continue <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <Link to="/auth/register" className="font-medium text-primary hover:text-primary-dark">
                Sign up
              </Link>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={backToPick}
              className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Change role
            </button>

            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4"
            >
              <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center">
                  <activeCard.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{activeCard.label}</div>
                  <div className="text-xs text-gray-500">{activeCard.description}</div>
                </div>
              </div>

              {sessionExpired && !error && (
                <div className="rounded-md p-3 bg-amber-50 border border-amber-100 text-sm text-amber-800">
                  Your session has expired. Please sign in again to continue.
                </div>
              )}
              {error && (
                <div className="rounded-md p-3 bg-red-50 border border-red-100 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary sm:text-sm"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary sm:text-sm"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
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
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                    Remember me
                  </label>
                </div>
                <Link to="/auth/forgot-password" className="text-sm font-medium text-primary hover:text-primary-dark">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" variant="primary" className="w-full" disabled={isLoading}>
                <span className="inline-flex items-center justify-center gap-2">
                  {isLoading ? 'Signing in…' : `Sign in as ${activeCard.short}`}
                  {!isLoading && <ArrowRight className="w-4 h-4" />}
                </span>
              </Button>

              <div className="pt-2 text-center text-sm text-gray-600 border-t border-gray-100">
                <span className="block pt-3">Don't have an account?</span>
                <Link
                  to={`/auth/register?role=${role}`}
                  className="mt-2 inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg border border-primary/30 text-primary font-medium hover:bg-primary/5 transition-colors"
                >
                  Sign up as {activeCard.short} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </form>
          </>
        )}
      </div>

      {/* Floating Administrators button — lower right. Court Admin + Super
          Admin live behind this single entry point so the public surface
          stays focused on the three user roles. */}
      <Link
        to="/auth/administrators"
        className="fixed bottom-6 right-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 text-white text-sm font-medium shadow-lg hover:bg-slate-800 transition-colors"
      >
        <ShieldCheck className="w-4 h-4" />
        Administrators
      </Link>
    </div>
  )
}

export default LoginPage
