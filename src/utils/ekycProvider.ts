// Friendly labels + error-message mapping for the eKYC provider in use.
//
// The server returns `provider: 'sandbox' | 'email' | 'stub' | …` on every
// EkycSubmission; UI surfaces should use `ekycProviderLabel(provider)` so
// renaming the provider only touches this file. Same for `ekycVerifiedVia`
// on the Client row (AADHAAR | EMAIL_OTP) — both forms map to a friendly
// short string here.

export type EkycProviderRaw = string | null | undefined;
export type EkycVerifiedViaRaw = 'AADHAAR' | 'EMAIL_OTP' | null | undefined;

const PROVIDER_LABELS: Record<string, string> = {
  sandbox: 'Sandbox.co.in',
  email: 'NyayaX Email OTP',
  stub: 'Dev Stub',
  // Legacy — kept so historical EkycSubmission rows still render a name.
  surepass: 'Surepass',
};

const PROVIDER_LONG_LABELS: Record<string, string> = {
  sandbox: 'Aadhaar OKYC via Sandbox.co.in',
  email: 'Temporary email-OTP fallback',
  stub: 'Local-dev stub provider',
  surepass: 'Aadhaar OKYC via Surepass',
};

/** Short label, e.g. "Sandbox.co.in". Used in compact badges + status pills. */
export function ekycProviderLabel(provider: EkycProviderRaw): string {
  if (!provider) return 'NyayaX';
  return PROVIDER_LABELS[provider] ?? provider;
}

/** Long label, e.g. "Aadhaar OKYC via Sandbox.co.in". Used in subtitles + tooltips. */
export function ekycProviderLongLabel(provider: EkycProviderRaw): string {
  if (!provider) return 'NyayaX identity verification';
  return PROVIDER_LONG_LABELS[provider] ?? `Provider: ${provider}`;
}

/** "Verified via Sandbox.co.in" / "Verified via NyayaX Email OTP". */
export function verifiedViaLabel(via: EkycVerifiedViaRaw): string {
  if (via === 'EMAIL_OTP') return 'Verified via NyayaX Email OTP (temporary)';
  if (via === 'AADHAAR') return 'Verified via Sandbox.co.in';
  return 'Verified';
}

// ---------------------------------------------------------------------------
// Sandbox-specific error message mapping
// ---------------------------------------------------------------------------
// Sandbox surfaces a small set of recurring error strings. The generic
// friendlyError helper passes these through verbatim, which is fine but a
// bit terse. This mapping rewrites the most common ones into copy that
// tells the user what to *do*, not just what went wrong.
//
// Keys are case-insensitive substrings — we match with .includes() so minor
// wording variants ("Reference id has expired" vs "Reference ID expired")
// still hit. Anything not matched falls through unchanged.

const SANDBOX_REWRITES: Array<{ match: RegExp; rewrite: string }> = [
  // OTP wrong / mismatch — most common failure path.
  { match: /invalid\s*otp|otp\s*(is\s*)?(invalid|incorrect|wrong|did\s*not\s*match|mismatch)/i,
    rewrite: "That OTP didn't match. Double-check the digits and try again." },
  // Reference id (provider's submission token) expired or unknown.
  { match: /reference[_\s-]*id.*(expired|invalid|not\s*found)/i,
    rewrite: 'That OTP request expired. Please request a new OTP.' },
  // Aadhaar number isn't linked to a phone — UIDAI side, retry won't help.
  { match: /(aadhaar|aadhar).*(not\s*linked|no\s*mobile|mobile\s*not\s*linked|no\s*registered\s*mobile)/i,
    rewrite: "Your Aadhaar isn't linked to a mobile number. Update your linkage at an Aadhaar Seva Kendra to verify here." },
  // Throttling — UIDAI returns this when the same Aadhaar requests too many OTPs.
  { match: /(too\s*many|rate\s*limit|throttle|exceeded)/i,
    rewrite: 'Too many OTP requests for this Aadhaar. Please wait a few minutes and try again.' },
  // Invalid Aadhaar (Verhoeff fails server-side too, or UIDAI rejects).
  { match: /(invalid|incorrect|malformed).*(aadhaar|aadhar)/i,
    rewrite: 'That Aadhaar number looks invalid. Please re-enter and try again.' },
  // Provider auth failure — config issue, surface a softer "try again later".
  { match: /(unauthorized|forbidden|invalid\s*api\s*(key|secret)|access\s*token)/i,
    rewrite: "Identity verification is temporarily unavailable. Please try again in a few minutes." },
];

/**
 * Apply Sandbox-specific message rewrites. Pass the message you'd otherwise
 * show; the matched rewrite replaces it, otherwise you get the original.
 *
 * URL-gated: the broad patterns ("unauthorized", "rate limit", etc.) only
 * fire when the failing request actually came from the eKYC API. Earlier
 * versions applied them globally, which rewrote unrelated errors (document
 * AI 403s, JWT 401s, Cloudinary permission errors) into the misleading
 * "Identity verification is temporarily unavailable" message. The Aadhaar-
 * specific patterns mention "aadhaar" in their regex and are safe to keep
 * always-on regardless of URL.
 */
const EKYC_URL_RE = /\/ekyc(\/|$|\?)/i;

export function rewriteSandboxError(raw: string, opts?: { url?: string }): string {
  if (!raw) return raw;
  const url = opts?.url ?? '';
  const fromEkyc = !!url && EKYC_URL_RE.test(url);
  for (const { match, rewrite } of SANDBOX_REWRITES) {
    if (!fromEkyc && !/(aadhaar|aadhar)/i.test(match.source)) continue;
    if (match.test(raw)) return rewrite;
  }
  return raw;
}
