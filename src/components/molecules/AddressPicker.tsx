import { FC, useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, ChevronDown, Check } from 'lucide-react'
import { addressApi } from '@/services/api'

export interface AddressValue {
  state?: string
  district?: string
  city?: string
  pincode?: string
  country?: string
}

interface AddressPickerProps {
  value: AddressValue
  onChange: (next: AddressValue) => void
  /** Hide the country field if true (defaults to true — most users are India-only). */
  hideCountry?: boolean
  className?: string
}

interface PostOffice {
  name: string
  branchType?: string
  deliveryStatus?: string
  district?: string
  division?: string
  region?: string
  state?: string
  country?: string
}

/**
 * Address form with India-pincode auto-fetch.
 *
 * Behaviour:
 *  - States are loaded once, districts cascade on state change.
 *  - Typing a 6-digit pincode auto-triggers the lookup (no Enter needed)
 *    and also runs on blur as a safety net.
 *  - State + district are filled silently when blank, never overwritten.
 *  - City is special: if the pincode lookup returns exactly one post office,
 *    we fill `city` with its name; if it returns multiple (common for
 *    metros), we surface them as a dropdown the user picks from. This
 *    matches the mobile `AddressFormPicker` UX so a user typing
 *    "751006" can pick "Badakhemundi Street" / "Saheed Nagar" / etc.
 *  - The city field stays a free-text input — once a pincode option is
 *    picked it's committed to the value but the user can still type a
 *    landmark / street if they prefer.
 */
const AddressPicker: FC<AddressPickerProps> = ({ value, onChange, hideCountry = true, className }) => {
  const [states, setStates] = useState<string[]>([])
  const [districts, setDistricts] = useState<string[]>([])
  const [loadingStates, setLoadingStates] = useState(false)
  const [loadingDistricts, setLoadingDistricts] = useState(false)
  const [pincodeBusy, setPincodeBusy] = useState(false)
  const [postOffices, setPostOffices] = useState<PostOffice[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  // Track which pincode we've already looked up so the on-input trigger
  // doesn't hammer the upstream service when the user pastes a 6-digit
  // value and then re-focuses the field.
  const lastLookedUp = useRef<string | null>(null)

  // Load states once
  useEffect(() => {
    let cancelled = false
    setLoadingStates(true)
    addressApi.getStates()
      .then((res) => {
        const data = (res.data?.states ?? res.data?.data ?? res.data ?? []) as any[]
        if (cancelled) return
        const list: string[] = data.map((s: any) => (typeof s === 'string' ? s : s.name || s.state || ''))
          .filter(Boolean)
        setStates(list)
      })
      .catch(() => { /* offline ok */ })
      .finally(() => !cancelled && setLoadingStates(false))
    return () => { cancelled = true }
  }, [])

  // When state changes → load districts
  useEffect(() => {
    if (!value.state) {
      setDistricts([])
      return
    }
    let cancelled = false
    setLoadingDistricts(true)
    addressApi.getDistricts(value.state)
      .then((res) => {
        const data = (res.data?.districts ?? res.data?.data ?? res.data ?? []) as any[]
        if (cancelled) return
        const list: string[] = data.map((d: any) => (typeof d === 'string' ? d : d.name || d.district || ''))
          .filter(Boolean)
        setDistricts(list)
      })
      .catch(() => setDistricts([]))
      .finally(() => !cancelled && setLoadingDistricts(false))
    return () => { cancelled = true }
  }, [value.state])

  /**
   * Pull post-office matches for the current pincode. Runs on both
   * `onInput` (when the user reaches 6 digits) and `onBlur` (safety net).
   * Idempotent — `lastLookedUp` prevents a duplicate request for the
   * same pincode.
   */
  const lookupPincode = async () => {
    const pin = (value.pincode || '').trim()
    if (pin.length !== 6) return
    if (lastLookedUp.current === pin) return
    lastLookedUp.current = pin
    setPincodeBusy(true)
    try {
      const res = await addressApi.getPincode(pin)
      const data = (res.data?.data ?? res.data) as any
      const offices: PostOffice[] = data?.postOffices ?? data ?? []
      setPostOffices(Array.isArray(offices) ? offices : [])
      const first = offices?.[0]
      if (!first) return
      // Silent autofill for state / district / city when blank.
      const next: AddressValue = { ...value }
      if (!next.state && first.state) next.state = first.state
      if (!next.district && first.district) next.district = first.district
      if (offices.length === 1) {
        // Single match → commit city to the only post-office name. The
        // user can still edit afterwards.
        if (first.name) next.city = first.name
        setPickerOpen(false)
      } else {
        // Multiple matches → open the picker so the user can choose.
        // Don't auto-commit city in this case — the first one is rarely
        // what users want for metros.
        setPickerOpen(true)
      }
      onChange(next)
    } catch {
      /* ignore — leave fields as-is so the user can fill manually */
    } finally {
      setPincodeBusy(false)
    }
  }

  // Reset the lookup cache + close the picker whenever the pincode
  // changes back to a non-6-digit value.
  useEffect(() => {
    const pin = value.pincode || ''
    if (pin.length !== 6) {
      lastLookedUp.current = null
      setPostOffices([])
      setPickerOpen(false)
    }
  }, [value.pincode])

  // Auto-trigger when the user reaches the 6th digit. Without this the
  // user has to blur the field for the lookup to fire — easy to miss.
  useEffect(() => {
    if ((value.pincode || '').length === 6 && lastLookedUp.current !== value.pincode) {
      lookupPincode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.pincode])

  const pickPostOffice = (po: PostOffice) => {
    onChange({
      ...value,
      city: po.name,
      // Trust the post-office state/district over whatever was guessed.
      state: po.state || value.state,
      district: po.district || value.district,
    })
    setPickerOpen(false)
  }

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className || ''}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-gray-400" /> Pincode
        </label>
        <div className="relative">
          <input
            value={value.pincode || ''}
            onChange={(e) => onChange({ ...value, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            onBlur={lookupPincode}
            maxLength={6}
            inputMode="numeric"
            placeholder="6 digits"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {pincodeBusy && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
        </div>
        {postOffices.length > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            {postOffices.length === 1
              ? `Found ${postOffices[0].district}, ${postOffices[0].state}.`
              : `Found ${postOffices.length} localities under ${postOffices[0].district || ''}. Pick one below.`}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
        <select
          value={value.state || ''}
          onChange={(e) => onChange({ ...value, state: e.target.value, district: '' })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
        >
          <option value="">{loadingStates ? 'Loading…' : 'Select…'}</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">District</label>
        {districts.length > 0 ? (
          <select
            value={value.district || ''}
            onChange={(e) => onChange({ ...value, district: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
          >
            <option value="">{loadingDistricts ? 'Loading…' : 'Select…'}</option>
            {districts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        ) : (
          <input
            value={value.district || ''}
            onChange={(e) => onChange({ ...value, district: e.target.value })}
            disabled={loadingDistricts}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">City / Locality</label>
        {postOffices.length > 1 ? (
          // Multi-match → dropdown picker. The user can still type a
          // custom value via the "Use custom value" option that opens the
          // input. Default shows the chosen post-office name.
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className={`w-full text-left px-3 py-2 border rounded-lg outline-none flex items-center justify-between gap-2 ${
                pickerOpen ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200'
              } bg-white`}
            >
              <span className={value.city ? 'text-gray-900' : 'text-gray-400'}>
                {value.city || `Pick from ${postOffices.length} localities…`}
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition ${pickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {pickerOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                {postOffices.map((po) => (
                  <button
                    key={`${po.name}-${po.district}`}
                    type="button"
                    onClick={() => pickPostOffice(po)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start justify-between gap-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="text-gray-900 truncate">{po.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {po.branchType || 'Post office'}{po.district ? ` · ${po.district}` : ''}{po.state ? `, ${po.state}` : ''}
                      </div>
                    </div>
                    {po.name === value.city && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1 text-[11px] text-gray-500">
              Or{' '}
              <button
                type="button"
                onClick={() => {
                  setPostOffices([])
                  setPickerOpen(false)
                }}
                className="underline text-primary"
              >
                type a custom value
              </button>
              .
            </p>
          </div>
        ) : (
          <input
            value={value.city || ''}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            placeholder="Locality, area, or landmark"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        )}
      </div>

      {!hideCountry && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
          <input
            value={value.country || 'India'}
            onChange={(e) => onChange({ ...value, country: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      )}
    </div>
  )
}

export default AddressPicker
