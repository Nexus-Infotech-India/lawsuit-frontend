import { usersApi, storageApi } from '@/services/api'

/**
 * Pick the Cloudinary resource type for a given file.
 *
 * Why this matters: Cloudinary serves files differently per resource
 * type. `raw/upload` stores arbitrary binary blobs and serves them with
 * `Content-Type: application/octet-stream` — which means browsers can't
 * render the file inline (the built-in PDF viewer rejects anything that
 * isn't `application/pdf`).
 *
 * The right routing:
 *   • Images → `image` (auto-served as `image/jpeg`, `image/png`, etc.)
 *   • PDFs → `image` (Cloudinary treats PDF as a multi-page image type
 *     and serves it as `application/pdf`, which is what browsers need
 *     for inline preview). This is the documented behaviour.
 *   • Everything else (DOCX, XLSX, PPTX, TXT, ZIP, …) → `raw`. These
 *     wouldn't preview inline in a browser anyway; they download.
 *
 * Without the PDF special-case here, every uploaded PDF on the platform
 * (license proofs, GST certs, appointment supporting docs, chat
 * attachments) returned "Failed to load PDF document" when opened. This
 * single function keeps every upload site honest.
 */
export function pickCloudinaryResourceType(mime?: string | null): 'image' | 'raw' {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf') return 'image'
  return 'raw'
}

/**
 * Upload a file to Cloudinary using a backend-signed signature.
 *
 * Folder selection: callers can override via the optional second arg.
 * Defaults to the `users` upload-signature endpoint (profile pictures).
 * Pass `'documents'` / `'lawyer-applications'` / `'chat-attachments'` etc.
 * to scope the upload appropriately — the server accepts arbitrary
 * folder strings.
 */
export async function uploadToCloudinary(
  file: File,
  options: {
    folder?: 'documents' | 'profiles' | 'lawyer-applications' | 'chat-attachments' | 'appointment-docs'
  } = {},
): Promise<string> {
  // Pick the signature endpoint based on whether a folder was requested.
  // Profile uploads use `usersApi.getUploadSignature()` (the original
  // contract used by avatars); document/file uploads use the generic
  // `/storage/sign?folder=…` endpoint exposed via `storageApi`.
  const sigRes = options.folder
    ? await storageApi.getSignature(options.folder)
    : await usersApi.getUploadSignature()
  const { timestamp, signature, cloudName, apiKey, folder } = (sigRes as any).data || {}

  if (!cloudName || !signature) {
    throw new Error('Failed to get upload signature from server')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('timestamp', String(timestamp))
  formData.append('signature', signature)
  formData.append('api_key', apiKey)
  formData.append('folder', folder || options.folder || 'profiles')

  const resourceType = pickCloudinaryResourceType(file.type)
  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    { method: 'POST', body: formData },
  )

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text()
    throw new Error(`Cloudinary upload failed: ${errBody}`)
  }

  const uploadData = await uploadRes.json()
  if (!uploadData.secure_url) {
    throw new Error('No file URL returned from Cloudinary')
  }
  return uploadData.secure_url as string
}
