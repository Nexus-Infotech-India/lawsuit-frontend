import { FC, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { casesApi, usersApi, authApi } from '@/services/api'
import storage from '@/utils/storage'
import { useUserStore } from '@/stores/userStore'
import Button from '@/components/atoms/Button'
import ClientInfo from '@/components/molecules/ClientInfo'

const ProfilePage: FC = () => {
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const { user: storeUser, getUser, updateUser, requestVerification, verifyCode } = useUserStore((s) => ({
    user: s.user,
    getUser: s.getUser,
    updateUser: s.updateUser,
    requestVerification: s.requestVerification,
    verifyCode: s.verifyCode,
  }))

  const [user, setUser] = useState(storeUser || authUser)
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone ? String(user.phone) : '')
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user?.avatar || user?.avatarUrl)
  const [editingName, setEditingName] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load fresh user on mount via userStore
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        await getUser()
        const u = useUserStore.getState().user || useAuthStore.getState().user
        if (mounted && u) {
          setUser(u)
          setName(u.name || '')
          setPhone(u.phone ? String(u.phone) : '')
          setAvatarUrl(u.avatar || u.avatarUrl || undefined)
        }
      } catch (err) {
        // ignore
      }
    }
    load()
    return () => { mounted = false }
  }, [getUser])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    setFile(f)
  }

  const uploadAndSaveAvatar = async () => {
    if (!file) return setError('Please pick an image file')
    // upload file to presigned URL and set local avatarUrl (don't call updateMe here)

    setLoading(true)
    setError(null)
    try {
      // Request presigned URL (backend returns { upload: { uploadUrl, fileUrl, method } })
      const res = await usersApi.getPresignedUrl(user?.id , { fileName: file.name, mimeType: file.type, size: file.size })
      const upload = res.data?.upload || res.data
      if (!upload || !upload.uploadUrl) throw new Error('No upload URL returned')

      // Upload file via PUT to the presigned URL
      const uploadResp = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      })

      if (!uploadResp.ok) {
        throw new Error(`Upload failed with status ${uploadResp.status}`)
      }

      const fileUrl = upload.fileUrl || upload.fileURL || upload.file_url

      if (!fileUrl) {
        // try deriving from uploadUrl (not ideal)
        throw new Error('No file URL returned from presigned response')
      }

      // set local avatarUrl and keep file state; save will send both name and avatarUrl
      setAvatarUrl(fileUrl)
      setFile(null)
    } catch (err: any) {
      console.error('upload error', err)
      setError(err.message || 'Upload failed')
    } finally {
      setLoading(false)
      setSaving(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    setError(null)
    try {
      // Send name and avatarUrl to PUT /users/me per requested flow
      const payload: any = {}
      if (name) payload.name = name
      if (avatarUrl) payload.avatarUrl = avatarUrl

      await updateUser(payload)
      const refreshed = useUserStore.getState().user || useAuthStore.getState().user
      if (refreshed) {
        setUser(refreshed)
        setName(refreshed.name || '')
        setAvatarUrl(refreshed.avatar || refreshed.avatarUrl || avatarUrl)
      }
    } catch (err: any) {
      console.error('save profile error', err)
      setError(err.response?.data?.error || err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleRequestAndVerify = async (identifier: string) => {
    try {
      await requestVerification(identifier)
      const code = window.prompt(`Enter the verification code sent to ${identifier}`) || ''
      if (!code) return
      await verifyCode(identifier, code)
      // refresh local user
      const refreshed = useUserStore.getState().user || useAuthStore.getState().user
      if (refreshed) setUser(refreshed)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Verification failed')
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-12 px-4">
      <div className="bg-white rounded-t-lg  p-8 flex gap-8">
        {/* Left: Avatar & quick actions */}
        <div className="w-1/3 flex flex-col items-center">
          <div className="relative">
            <img
              src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&size=256`}
              alt={name}
              className="w-48 h-48 rounded-full object-cover border"
            />
            <div className="absolute bottom-0 right-0">
              <label className="cursor-pointer bg-primary text-white px-3 py-1 rounded text-sm">
                Edit
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
          </div>

          {file && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <div className="text-sm text-gray-600">{file.name}</div>
              <div className="flex gap-2">
                <Button onClick={uploadAndSaveAvatar} disabled={loading}>{loading ? 'Uploading...' : 'Upload'}</Button>
                <Button variant="secondary" onClick={() => setFile(null)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="mt-4 text-center">
            <div className="flex items-center gap-2 justify-center">
              <h2 className="text-xl font-semibold">{user?.name || 'Your Name'}</h2>
            </div>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>


          {/* <div className="mt-4 w-full flex gap-2">
            <Button onClick={uploadAndSaveAvatar} disabled={!file || !selectedCaseId || loading || saving}>
              {loading || saving ? 'Working...' : 'Upload & Save'}
            </Button>
            <Button variant="secondary" onClick={() => { setFile(null); setError(null) }}>
              Cancel
            </Button>
          </div> */}

          {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
        </div>

        {/* Right: Profile form */}
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-4">Profile</h3>

          <div className="space-y-4">
            <div >
              <label className="block text-sm text-gray-600 mb-1">Full name</label>
              <div className="flex gap-2 items-center">
                <input name="fullName" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded p-2" />
              <Button
                onClick={() => {
                  // focus name input in form
                  const el = document.querySelector('input[name="fullName"]') as HTMLInputElement | null
                  if (el) {
                    el.focus()
                    el.select()
                  }
                }}
              >
                Edit
              </Button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Phone</label>
              <div className="flex gap-2 items-center">
                <input value={phone} disabled className="flex-1 border rounded p-2" />
                {user?.phoneVerified ? (
                  <span className="text-green-600 text-sm">Verified</span>
                ) : (
                  <Button onClick={() => handleRequestAndVerify(phone)} disabled={!phone}>Verify</Button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Email</label>
              <div className="flex gap-2 items-center">
                <input value={user?.email || ''} disabled className="flex-1 border rounded p-2 bg-gray-50" />
                {user?.emailVerified ? (
                  <span className="text-green-600 text-sm">Verified</span>
                ) : (
                  <Button onClick={() => handleRequestAndVerify(user?.email)} disabled={!user?.email}>Verify</Button>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-8 ">
              <Button variant="secondary" onClick={handleSaveProfile} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
              {/* <Button variant="secondary" onClick={() => navigate(-1)}>Back</Button> */}
            </div>

            <div className="mt-6 ">
                {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : <div className=" text-sm text-gray-500">Tip: Use a square image for best results.</div> }
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
            <ClientInfo />
          </div>
        </div>
      </section>
      
    </div>
  )
}

export default ProfilePage
