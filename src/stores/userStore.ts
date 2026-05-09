import { create } from 'zustand'
import { usersApi, authApi } from '@/services/api'
import storage from '@/utils/storage'
import { useAuthStore } from '@/stores/authStore'
import { friendlyError } from '@/utils/errors'

interface UserStore {
  user: any | null
  loading: boolean
  error: string | null
  getUser: () => Promise<void>
  updateUser: (payload: { name?: string; phone?: string; avatarUrl?: string }) => Promise<void>
  requestVerification: (identifier: string) => Promise<void>
  verifyCode: (identifier: string, code: string) => Promise<void>
}

export const useUserStore = create<UserStore>((set) => ({
  user: storage.getUserData() || null,
  loading: false,
  error: null,

  getUser: async () => {
    set({ loading: true, error: null })
    try {
      const res = await usersApi.getMe()
      const u = res.data?.user || res.data
      if (u) {
        storage.setUserData(u)
        useAuthStore.setState({ user: u })
        set({ user: u })
      }
    } catch (err: any) {
      set({ error: friendlyError(err, "We couldn't load your profile. Please try again.") })
    } finally {
      set({ loading: false })
    }
  },

  updateUser: async (payload) => {
    set({ loading: true, error: null })
    try {
      const res = await usersApi.updateMe(payload)
      const u = res.data?.user || res.data
      if (u) {
        storage.setUserData(u)
        useAuthStore.setState({ user: u })
        set({ user: u })
      }
    } catch (err: any) {
      set({ error: friendlyError(err, "We couldn't save your profile changes.") })
      throw err
    } finally {
      set({ loading: false })
    }
  },

  requestVerification: async (identifier) => {
    set({ loading: true, error: null })
    try {
      await authApi.requestOtp(identifier)
    } catch (err: any) {
      set({ error: friendlyError(err, "We couldn't send a verification code right now.") })
      throw err
    } finally {
      set({ loading: false })
    }
  },

  verifyCode: async (identifier, code) => {
    set({ loading: true, error: null })
    try {
      await authApi.verifyOtp(identifier, code)
      // refresh user after verification
      const res = await usersApi.getMe()
      const u = res.data?.user || res.data
      if (u) {
        storage.setUserData(u)
        useAuthStore.setState({ user: u })
        set({ user: u })
      }
    } catch (err: any) {
      set({ error: friendlyError(err, "That code didn't work. Double-check and try again.") })
      throw err
    } finally {
      set({ loading: false })
    }
  },
}))

export default useUserStore
