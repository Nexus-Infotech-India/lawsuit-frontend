import { FC, useEffect, useState } from 'react'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'

const blank = {
  name: '', email: '', phone: '', password: '',
  licenseNumber: '', barCouncilId: '',
  specializations: '',
  feePerConsultation: '',
  pincode: '', city: '', state: '',
  bio: '',
  experienceYears: '',
}

const OrganizationLawyersPage: FC = () => {
  const lawyers = useOrganizationStore((s) => s.lawyers)
  const fetchLawyers = useOrganizationStore((s) => s.fetchLawyers)
  const addLawyer = useOrganizationStore((s) => s.addLawyer)
  const loadingLawyers = useOrganizationStore((s) => s.loadingLawyers)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...blank })
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLawyers().catch(() => { })
  }, [fetchLawyers])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((s) => ({ ...s, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const payload: any = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      }
      if (form.licenseNumber) payload.licenseNumber = form.licenseNumber
      if (form.barCouncilId) payload.barCouncilId = form.barCouncilId
      if (form.specializations) {
        payload.specializations = form.specializations.split(',').map((s) => s.trim()).filter(Boolean)
      }
      if (form.feePerConsultation) payload.feePerConsultation = Number(form.feePerConsultation)
      if (form.pincode) payload.pincode = form.pincode
      if (form.city) payload.city = form.city
      if (form.state) payload.state = form.state
      if (form.bio) payload.bio = form.bio
      if (form.experienceYears) payload.experienceYears = Number(form.experienceYears)

      await addLawyer(payload)
      setToast(`OTP sent to ${form.email}`)
      setForm({ ...blank })
      setShowForm(false)
      setTimeout(() => setToast(null), 4000)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to add lawyer')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Lawyers</h1>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add lawyer'}
        </Button>
      </div>

      {toast && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {toast}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Onboard a new lawyer</h2>
          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name" name="name" value={form.name} onChange={handleChange} required />
            <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
            <Field label="Phone" name="phone" value={form.phone} onChange={handleChange} required />
            <Field label="Temporary password" name="password" type="password" value={form.password} onChange={handleChange} required />
            <Field label="License number" name="licenseNumber" value={form.licenseNumber} onChange={handleChange} />
            <Field label="Bar Council ID" name="barCouncilId" value={form.barCouncilId} onChange={handleChange} />
            <Field label="Specializations (comma separated)" name="specializations" value={form.specializations} onChange={handleChange} />
            <Field label="Fee per consultation (₹)" name="feePerConsultation" type="number" value={form.feePerConsultation} onChange={handleChange} />
            <Field label="Pincode" name="pincode" value={form.pincode} onChange={handleChange} />
            <Field label="City" name="city" value={form.city} onChange={handleChange} />
            <Field label="State" name="state" value={form.state} onChange={handleChange} />
            <Field label="Experience (years)" name="experienceYears" type="number" value={form.experienceYears} onChange={handleChange} />
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Bio</label>
              <textarea
                name="bio"
                rows={3}
                value={form.bio}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Sending OTP…' : 'Add lawyer'}</Button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loadingLawyers ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading lawyers…</div>
        ) : lawyers.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-base font-medium text-gray-900">No lawyers yet</h3>
            <p className="text-sm text-gray-500 mt-1">Add your first lawyer to start receiving requests.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lawyer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bar Council</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specializations</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {lawyers.map((l) => (
                <tr key={l.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {l.avatarUrl ? (
                        <img src={l.avatarUrl} alt={l.name} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">
                          {l.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{l.name}</div>
                        <div className="text-xs text-gray-500">{l.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{l.barCouncilId || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {(l.specializations || []).join(', ') || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {l.feePerConsultation != null
                      ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(l.feePerConsultation)
                      : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${l.isVerified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                      {l.isVerified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const Field: FC<{
  label: string
  name: string
  value: string
  type?: string
  required?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}> = ({ label, name, value, onChange, type = 'text', required }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700">{label}{required && ' *'}</label>
    <input
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      required={required}
      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm"
    />
  </div>
)

export default OrganizationLawyersPage
