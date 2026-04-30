import { FC, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import Button from '@/components/atoms/Button'

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

const RegisterPage: FC = () => {
  const navigate = useNavigate()
  const { register, requestOtp, isLoading, error, clearError } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'client',
    registrationNumber: '',
    pincode: '',
  })

  const [courtDetails, setCourtDetails] = useState({
    name: '',
    type: 'DISTRICT',
    address: '',
    pincode: '',
    state: '',
    district: '',
    city: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    if (error) clearError()
  }

  const handleCourtChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setCourtDetails(prev => ({
      ...prev,
      [name]: value
    }))
    if (error) clearError()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload: any = { ...formData };
      if (formData.role === 'court_admin') {
        const detailsToSubmit = { ...courtDetails };
        if (!detailsToSubmit.city) {
          delete (detailsToSubmit as any).city;
        }
        payload.courtDetails = detailsToSubmit;
        delete payload.pincode;
      } else if (formData.role === 'organization') {
        // Organization keeps registrationNumber + pincode
        if (!payload.registrationNumber) delete payload.registrationNumber;
        if (!payload.pincode) delete payload.pincode;
      } else {
        delete payload.registrationNumber;
        delete payload.pincode;
      }
      await register(payload)
      // After successful registration, the backend automatically sends an OTP. Navigate directly to verification.
      navigate('/auth/otp-verify', { state: { identifier: formData.email } })
    } catch (err) {
      // Error is handled by the store
      console.error('Registration failed:', err)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/auth/login" className="font-medium text-primary hover:text-primary-dark">
              sign in to existing account
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="John Doe"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="john@example.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="123-456-7890"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                  placeholder="********"
                  value={formData.password}
                  onChange={handleChange}
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-red-400">
                Must be at least 8 characters long with letters, numbers and special characters
              </p>
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                I am a
              </label>
              <select
                id="role"
                name="role"
                required
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary focus:border-primary rounded-md sm:text-sm"
                value={formData.role}
                onChange={handleChange}
              >
                <option value="client">Client</option>
                <option value="lawyer">Lawyer</option>
                <option value="organization">Law Firm / Organization</option>
                <option value="court_admin">Court Admin</option>
              </select>
            </div>

            {formData.role === 'organization' && (
              <div className="pt-4 border-t border-gray-200 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Law Firm Details</h3>
                <p className="text-xs text-gray-500">Optional now — you can add these later in your profile.</p>
                <div>
                  <label htmlFor="org-registrationNumber" className="block text-sm font-medium text-gray-700">Registration Number (optional)</label>
                  <input
                    id="org-registrationNumber"
                    name="registrationNumber"
                    type="text"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm"
                    value={formData.registrationNumber}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label htmlFor="org-pincode" className="block text-sm font-medium text-gray-700">Pincode (optional)</label>
                  <input
                    id="org-pincode"
                    name="pincode"
                    type="text"
                    pattern="\d{6}"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm"
                    placeholder="6-digit pincode"
                    value={formData.pincode}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            {formData.role === 'court_admin' && (
              <div className="pt-4 border-t border-gray-200 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Court Details</h3>
                <div>
                  <label htmlFor="registrationNumber" className="block text-sm font-medium text-gray-700">Registration Number</label>
                  <input id="registrationNumber" name="registrationNumber" type="text" required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm" value={formData.registrationNumber} onChange={handleChange} />
                </div>
                <div>
                  <label htmlFor="court-name" className="block text-sm font-medium text-gray-700">Court Name</label>
                  <input id="court-name" name="name" type="text" required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm" value={courtDetails.name} onChange={handleCourtChange} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="court-type" className="block text-sm font-medium text-gray-700">Type</label>
                    <select id="court-type" name="type" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm" value={courtDetails.type} onChange={handleCourtChange}>
                      <option value="DISTRICT">District</option>
                      <option value="HIGH_COURT">High Court</option>
                      <option value="SUPREME_COURT">Supreme Court</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="court-pincode" className="block text-sm font-medium text-gray-700">Pincode</label>
                    <input id="court-pincode" name="pincode" type="text" required pattern="\d{6}" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm" value={courtDetails.pincode} onChange={handleCourtChange} />
                  </div>
                </div>
                <div>
                  <label htmlFor="court-address" className="block text-sm font-medium text-gray-700">Address</label>
                  <input id="court-address" name="address" type="text" required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm" value={courtDetails.address} onChange={handleCourtChange} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="court-city" className="block text-sm font-medium text-gray-700">City (Optional)</label>
                    <input id="court-city" name="city" type="text" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm" value={courtDetails.city} onChange={handleCourtChange} />
                  </div>
                  <div>
                    <label htmlFor="court-district" className="block text-sm font-medium text-gray-700">District</label>
                    <input id="court-district" name="district" type="text" required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm" value={courtDetails.district} onChange={handleCourtChange} />
                  </div>
                  <div>
                    <label htmlFor="court-state" className="block text-sm font-medium text-gray-700">State</label>
                    <input id="court-state" name="state" type="text" required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm" value={courtDetails.state} onChange={handleCourtChange} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </Button>
          </div>

          <div className="text-sm text-center text-gray-600">
            By registering, you agree to our{' '}
            <Link to="/terms-of-service" className="font-medium text-primary hover:text-primary-dark">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy-policy" className="font-medium text-primary hover:text-primary-dark">
              Privacy Policy
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RegisterPage