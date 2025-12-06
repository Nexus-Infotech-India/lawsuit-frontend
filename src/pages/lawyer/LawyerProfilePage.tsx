// src/pages/ProfilePage.tsx  (or wherever you keep it)
import { FC, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Loader2, AlertCircle, Edit } from 'lucide-react'

import { useAuthStore } from '@/stores/authStore'
import { useUserStore } from '@/stores/userStore'
import { usersApi } from '@/services/api'
import Button from '@/components/atoms/Button'
import LawyerInfo from '@/components/molecules/LawyerInfo'

const LawyerProfilePage: FC = () => {
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const { user: storeUser, getUser, updateUser, requestVerification, verifyCode } = useUserStore()

  const [user, setUser] = useState(storeUser || authUser)
  const [name, setName] = useState(user?.name || '')
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user?.avatar || user?.avatarUrl)

  const [isUploading, setIsUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unsavedChanges, setUnsavedChanges] = useState(false)

  // Load fresh user data
  useEffect(() => {
    getUser()
  }, [getUser])

  useEffect(() => {
    const latestUser = useUserStore.getState().user || authUser
    if (latestUser) {
      setUser(latestUser)
      setName(latestUser.name || '')
      setAvatarUrl(latestUser.avatar || latestUser.avatarUrl || undefined)
    }
  }, [storeUser, authUser])

  // Upload avatar immediately when file is selected
  const handleFileSelect = async (file: File) => {
    if (!file) return

    setIsUploading(true)
    setError(null)

    try {
      const res = await usersApi.getPresignedUrl(user?.id || '', {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      })

      const upload = res.data?.upload || res.data
      if (!upload?.uploadUrl) throw new Error('No upload URL received')

      // Upload directly to S3 / storage
      const uploadResp = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })

      if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status}`)

      const fileUrl = upload.fileUrl || upload.fileURL || upload.file_url
      if (!fileUrl) throw new Error('No file URL returned')

      // Success → update preview + mark unsaved
      setAvatarUrl(fileUrl)
      setUnsavedChanges(true)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to upload image. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const payload: any = {}
      if (name !== (user?.name || '')) payload.name = name
      if (avatarUrl !== (user?.avatar || user?.avatarUrl)) payload.avatarUrl = avatarUrl

      if (Object.keys(payload).length > 0) {
        await updateUser(payload)
        setUnsavedChanges(false)
        // Refresh user state
        await getUser()
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleVerify = async (identifier: string) => {
    if (!identifier) return
    try {
      await requestVerification(identifier)
      const code = window.prompt(`Enter the verification code sent to ${identifier}`)
      if (code) {
        await verifyCode(identifier, code)
        await getUser()
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed')
    }
  }

  const displayName = name || user?.name || 'User'
  const displayAvatar = avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&size=256&background=random`

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-8 lg:p-12">
          <div className="grid lg:grid-cols-3 gap-12">
            {/* Left: Avatar + Header */}
            <div className="lg:col-span-1 flex flex-col items-center">
              {/* Avatar with upload overlay */}
              <div className="relative inline-block">
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="w-48 h-48 rounded-full object-cover border-4 border-gray-200 shadow-lg"
                />

                {/* Uploading spinner */}
                {isUploading && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-white animate-spin" />
                  </div>
                )}

                {/* Change photo button */}
                <label className="absolute bottom-4 right-4 cursor-pointer">
                  <div className="bg-primary text-white p-3 rounded-full shadow-lg hover:bg-primary/90 transition">
                    <Upload className="w-5 h-5" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    disabled={isUploading}
                  />
                </label>
              </div>

              <div className="mt-6 text-center">
                <h2 className="text-2xl font-bold text-gray-900">{displayName}</h2>
                <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
              </div>
            </div>

            {/* Right: Form */}
            <div className="lg:col-span-2">
              <h3 className="text-2xl font-bold text-gray-900 mb-8">Edit Profile</h3>

              {/* Error message */}
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  {error}
                </div>
              )}

              {/* Form fields */}
              <div className="space-y-6">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setUnsavedChanges(true)
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Your name"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={user?.phone ? String(user.phone) : ''}
                      disabled
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                    {user?.phoneVerified ? (
                      <span className="text-green-600 text-sm font-medium">Verified</span>
                    ) : (
                      <Button size="sm" onClick={() => handleVerify(String(user?.phone))}>
                        Verify
                      </Button>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                    {user?.emailVerified ? (
                      <span className="text-green-600 text-sm font-medium">Verified</span>
                    ) : (
                      <Button size="sm" onClick={() => handleVerify(user?.email || '')}>
                        Verify
                      </Button>
                    )}
                  </div>
                </div>

                {/* Save button */}
                <div className="pt-4">
                  <Button variant='secondary' onClick={handleSave} disabled={saving || isUploading} size="lg">
                    {saving ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>

                {/* Tip */}
                <p className="text-xs text-gray-500">
                  Tip: Use a square image for the best avatar display.
                </p>
              </div>

              {/* Unsaved changes banner */}
              {unsavedChanges && !saving && (
                <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-800">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-medium">
                    You have unsaved changes. Click "Save changes" to apply them.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* additional info */}
      <section>
        <div className="bg-white rounded-b-lg p-8 gap-8 "> 
          <hr className='mx-12'/>
          <div className="mt-6">
            <h1 className=" flex justify-center text-lg font-semibold text-midnight mb-2">Additional Information</h1>
            <LawyerInfo />
          </div>
        </div>
      </section>
    </div>
  )
}

export default LawyerProfilePage