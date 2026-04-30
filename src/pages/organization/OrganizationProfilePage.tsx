import { FC, useEffect, useState } from 'react'
import Button from '@/components/atoms/Button'
import { useOrganizationStore } from '@/stores/organizationStore'
import { uploadToCloudinary } from '@/utils/cloudinaryUpload'

type FormShape = {
  name: string
  email: string
  phone: string
  about: string
  website: string
  registrationNumber: string
  gstNumber: string
  panNumber: string
  practiceAreas: string // comma-separated in the input
  /** Rupees (UI). Multiplied by 100 before sending. */
  consultationFee: string
  country: string
  state: string
  district: string
  city: string
  pincode: string
  address: string
  avatarUrl?: string
  registrationCertUrl?: string
  gstProofUrl?: string
}

const blank: FormShape = {
  name: '', email: '', phone: '', about: '', website: '',
  registrationNumber: '', gstNumber: '', panNumber: '',
  practiceAreas: '', consultationFee: '',
  country: 'India', state: '', district: '', city: '', pincode: '', address: '',
}

const OrganizationProfilePage: FC = () => {
  const me = useOrganizationStore((s) => s.me)
  const fetchMe = useOrganizationStore((s) => s.fetchMe)
  const updateMe = useOrganizationStore((s) => s.updateMe)
  const errorMe = useOrganizationStore((s) => s.errorMe)

  const [form, setForm] = useState<FormShape>(blank)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<{ field: keyof FormShape | null }>({ field: null })
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!me) {
      fetchMe().catch(() => { })
    }
  }, [me, fetchMe])

  useEffect(() => {
    if (!me) return
    setForm({
      name: me.name || '',
      email: me.email || '',
      phone: me.phone || '',
      about: me.about || '',
      website: me.website || '',
      registrationNumber: me.registrationNumber || '',
      gstNumber: me.gstNumber || '',
      panNumber: me.panNumber || '',
      practiceAreas: (me.practiceAreas || []).join(', '),
      consultationFee: me.consultationFee != null ? String(me.consultationFee / 100) : '',
      country: me.country || 'India',
      state: me.state || '',
      district: me.district || '',
      city: me.city || '',
      pincode: me.pincode || '',
      address: me.address || '',
      avatarUrl: me.avatarUrl || undefined,
      registrationCertUrl: me.registrationCertUrl || undefined,
      gstProofUrl: me.gstProofUrl || undefined,
    })
  }, [me])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm((s) => ({ ...s, [name]: value }))
  }

  const handleUpload = async (field: keyof FormShape, file: File | undefined) => {
    if (!file) return
    try {
      setUploading({ field })
      const url = await uploadToCloudinary(file)
      setForm((s) => ({ ...s, [field]: url } as FormShape))
    } catch (err: any) {
      alert(err?.message || 'Upload failed')
    } finally {
      setUploading({ field: null })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSuccess(null)
    try {
      const payload: any = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        about: form.about || null,
        website: form.website || null,
        registrationNumber: form.registrationNumber || null,
        gstNumber: form.gstNumber || null,
        panNumber: form.panNumber || null,
        practiceAreas: form.practiceAreas
          ? form.practiceAreas.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        country: form.country || undefined,
        state: form.state || undefined,
        district: form.district || undefined,
        city: form.city || undefined,
        pincode: form.pincode || undefined,
        address: form.address || undefined,
        avatarUrl: form.avatarUrl,
        registrationCertUrl: form.registrationCertUrl,
        gstProofUrl: form.gstProofUrl,
      }
      // consultationFee comes in as rupees → backend expects paise.
      if (form.consultationFee !== '') {
        const rupees = Number(form.consultationFee)
        if (!Number.isNaN(rupees)) {
          payload.consultationFee = Math.round(rupees * 100)
        }
      } else {
        payload.consultationFee = null
      }
      await updateMe(payload)
      setSuccess('Profile saved')
      setTimeout(() => setSuccess(null), 3000)
    } catch {
      // errorMe is set on the store
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organization Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Keep this up to date — clients see this on your firm page.</p>
      </div>

      {errorMe && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMe}</div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>
      )}

      {/* Avatar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center gap-6">
        {form.avatarUrl ? (
          <img src={form.avatarUrl} alt="logo" className="w-20 h-20 rounded-full object-cover border" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xl font-bold">
            {form.name?.charAt(0).toUpperCase() || '?'}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700">Logo</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleUpload('avatarUrl', e.target.files?.[0])}
            className="mt-1 text-sm"
          />
          {uploading.field === 'avatarUrl' && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
        </div>
      </div>

      <Section title="Public information">
        <Field label="Firm name" name="name" value={form.name} onChange={handleChange} required />
        <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
        <Field label="Phone" name="phone" value={form.phone} onChange={handleChange} required />
        <Field label="Website" name="website" value={form.website} onChange={handleChange} />
        <Field
          label="Practice areas (comma separated)"
          name="practiceAreas"
          value={form.practiceAreas}
          onChange={handleChange}
          placeholder="Civil, Criminal, Corporate"
        />
        <Field
          label="Consultation fee (₹)"
          name="consultationFee"
          type="number"
          value={form.consultationFee}
          onChange={handleChange}
          placeholder="e.g. 1500"
        />
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">About</label>
          <textarea
            name="about"
            rows={3}
            value={form.about}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm"
          />
        </div>
      </Section>

      <Section title="Statutory information">
        <Field label="Registration number" name="registrationNumber" value={form.registrationNumber} onChange={handleChange} />
        <Field label="GST number" name="gstNumber" value={form.gstNumber} onChange={handleChange} />
        <Field label="PAN number" name="panNumber" value={form.panNumber} onChange={handleChange} />

        <FileUploadField
          label="Registration certificate"
          url={form.registrationCertUrl}
          uploading={uploading.field === 'registrationCertUrl'}
          onUpload={(file) => handleUpload('registrationCertUrl', file)}
        />
        <FileUploadField
          label="GST proof"
          url={form.gstProofUrl}
          uploading={uploading.field === 'gstProofUrl'}
          onUpload={(file) => handleUpload('gstProofUrl', file)}
        />
      </Section>

      <Section title="Address">
        <Field label="Country" name="country" value={form.country} onChange={handleChange} />
        <Field label="State" name="state" value={form.state} onChange={handleChange} />
        <Field label="District" name="district" value={form.district} onChange={handleChange} />
        <Field label="City" name="city" value={form.city} onChange={handleChange} />
        <Field label="Pincode" name="pincode" value={form.pincode} onChange={handleChange} placeholder="6 digits" />
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <textarea
            name="address"
            rows={2}
            value={form.address}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm"
          />
        </div>
      </Section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
    <h2 className="text-lg font-medium text-gray-900 mb-4 border-b border-gray-100 pb-2">{title}</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
)

const Field: FC<{
  label: string
  name: string
  value: string
  type?: string
  required?: boolean
  placeholder?: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}> = ({ label, name, value, onChange, type = 'text', required, placeholder }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700">{label}</label>
    <input
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      required={required}
      placeholder={placeholder}
      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary sm:text-sm"
    />
  </div>
)

const FileUploadField: FC<{
  label: string
  url?: string
  uploading: boolean
  onUpload: (file: File | undefined) => void
}> = ({ label, url, uploading, onUpload }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700">{label}</label>
    <div className="mt-1 flex items-center gap-3">
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => onUpload(e.target.files?.[0])}
        className="text-sm"
      />
      {uploading && <span className="text-xs text-gray-500">Uploading…</span>}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
          View uploaded file
        </a>
      )}
    </div>
  </div>
)

export default OrganizationProfilePage
