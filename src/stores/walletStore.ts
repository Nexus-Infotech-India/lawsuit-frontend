import { create } from 'zustand'
import type { WalletTransaction } from '@/types'
import { walletApi } from '@/services/api'
import { friendlyError } from '@/utils/errors'

interface WalletState {
  balance: number
  transactions: WalletTransaction[]
  totalTransactions: number
  currentPage: number
  loading: boolean
  error: string | null

  fetchBalance: () => Promise<void>
  fetchTransactions: (page?: number, limit?: number) => Promise<void>
  addMoney: (amount: number) => Promise<{ paymentId: string; orderId: string; amount: number; currency: string }>
  confirmAddMoney: (payload: {
    paymentId: string
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
  }) => Promise<{ success: boolean; balance: number }>
  withdraw: (amount: number, bankAccountId?: string) => Promise<{ success: boolean; message?: string }>
  transfer: (toUserId: string, amount: number, description?: string) => Promise<{ success: boolean; balance?: number; message?: string }>
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: 0,
  transactions: [],
  totalTransactions: 0,
  currentPage: 1,
  loading: false,
  error: null,

  fetchBalance: async () => {
    try {
      const res = await walletApi.getBalance()
      const data = res.data?.data ?? res.data ?? res
      set({ balance: data.balance ?? 0 })
    } catch {
      // ignore — wallet may not be created yet
    }
  },

  fetchTransactions: async (page = 1, limit = 20) => {
    set({ loading: true, error: null })
    try {
      const res = await walletApi.getTransactions({ page, limit })
      const data = res.data?.data ?? res.data ?? res
      set({
        transactions: data.items ?? [],
        totalTransactions: data.total ?? 0,
        currentPage: data.page ?? page,
      })
    } catch {
      set({ error: 'Failed to load transactions' })
    } finally {
      set({ loading: false })
    }
  },

  addMoney: async (amount: number) => {
    set({ loading: true, error: null })
    try {
      const res = await walletApi.addMoney({ amount })
      // Return the response body directly — avoid over-unwrapping that can lose fields
      return res.data
    } catch (err: any) {
      const msg = friendlyError(err, "We couldn't start the top-up. Please try again.")
      set({ error: msg })
      throw new Error(msg)
    } finally {
      set({ loading: false })
    }
  },

  confirmAddMoney: async (payload) => {
    set({ loading: true, error: null })
    try {
      const res = await walletApi.confirmAddMoney(payload)
      const data = res.data?.data ?? res.data ?? res
      if (data.balance != null) {
        set({ balance: data.balance })
      }
      return data
    } catch (err: any) {
      const msg = friendlyError(err, "Your payment went through but we couldn't confirm it. Please contact support.")
      set({ error: msg })
      throw new Error(msg)
    } finally {
      set({ loading: false })
    }
  },

  withdraw: async (amount: number, bankAccountId?: string) => {
    set({ loading: true, error: null })
    try {
      const res = await walletApi.withdraw({ amount, bankAccountId })
      const data = res.data?.data ?? res.data ?? res
      const newBalance = data.wallet?.balance
      if (newBalance != null) {
        set({ balance: newBalance })
      }
      // Refresh transactions
      get().fetchTransactions(1)
      return { success: true }
    } catch (err: any) {
      const msg = friendlyError(err, "We couldn't process your withdrawal right now.")
      set({ error: msg })
      return { success: false, message: msg }
    } finally {
      set({ loading: false })
    }
  },

  transfer: async (toUserId: string, amount: number, description?: string) => {
    set({ loading: true, error: null })
    try {
      const res = await walletApi.transfer({ toUserId, amount, description })
      const data = res.data?.data ?? res.data ?? res
      if (data.balance != null) {
        set({ balance: data.balance })
      }
      // Refresh transactions
      get().fetchTransactions(1)
      return { success: true, balance: data.balance }
    } catch (err: any) {
      const msg = friendlyError(err, "We couldn't complete that transfer.")
      set({ error: msg })
      return { success: false, message: msg }
    } finally {
      set({ loading: false })
    }
  },
}))

export default useWalletStore
