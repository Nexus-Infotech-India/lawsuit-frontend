import { usersApi } from '@/services/api'

/**
 * Upload a file to Cloudinary using a backend-signed signature.
 *
 * Mirrors the pattern used in LawyerProfilePage:
 * 1. Ask backend for a signature.
 * 2. POST the file directly to Cloudinary.
 * 3. Return the secure_url so the caller can save it on their record.
 */
export async function uploadToCloudinary(file: File): Promise<string> {
  const sigRes = await usersApi.getUploadSignature()
  const { timestamp, signature, cloudName, apiKey, folder } = sigRes.data || {}

  if (!cloudName || !signature) {
    throw new Error('Failed to get upload signature from server')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('timestamp', String(timestamp))
  formData.append('signature', signature)
  formData.append('api_key', apiKey)
  formData.append('folder', folder || 'profiles')

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData },
  )

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text()
    throw new Error(`Cloudinary upload failed: ${errBody}`)
  }

  const uploadData = await uploadRes.json()
  if (!uploadData.secure_url) {
    throw new Error('No image URL returned from Cloudinary')
  }
  return uploadData.secure_url as string
}
