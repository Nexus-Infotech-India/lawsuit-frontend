import { create } from 'zustand'
import { organizationsApi, courtAdminApi } from '@/services/api'
import type {
  Organization,
  OrgAppointmentRequest,
  OrgAppointmentRequestStatus,
  OrgVerificationRequest,
  VerifiedLawyer,
} from '@/types'

interface OrganizationState {
  // Org-self
  me: Organization | null
  loadingMe: boolean
  errorMe: string | null

  // Lawyers under the org
  lawyers: VerifiedLawyer[]
  loadingLawyers: boolean

  // Eligible court admins for verification
  eligibleCourtAdmins: any[]
  loadingCourtAdmins: boolean

  // Appointment requests received by the org
  requests: OrgAppointmentRequest[]
  requestsTotal: number
  loadingRequests: boolean

  // Client-side: requests I've sent to organizations
  myRequests: OrgAppointmentRequest[]
  myRequestsTotal: number
  loadingMyRequests: boolean

  // Court-admin-side: org verifications
  pendingOrgVerifications: OrgVerificationRequest[]
  allOrgVerifications: OrgVerificationRequest[]
  loadingOrgVerifications: boolean

  // Public discovery
  publicOrgs: Organization[]
  publicOrgsTotal: number
  loadingPublicOrgs: boolean

  // Actions — org-self
  fetchMe: () => Promise<void>
  updateMe: (data: any) => Promise<void>
  fetchEligibleCourtAdmins: () => Promise<void>
  requestVerification: (courtAdminId: string) => Promise<void>

  fetchLawyers: (params?: { page?: number; limit?: number }) => Promise<void>
  addLawyer: (data: any) => Promise<any>

  fetchRequests: (params?: { status?: OrgAppointmentRequestStatus; page?: number; limit?: number }) => Promise<void>
  assignRequest: (id: string, body: { lawyerId: string; paymentMethod: 'razorpay' | 'wallet' }) => Promise<any>
  rejectRequest: (id: string, reason: string) => Promise<void>

  // Actions — client
  fetchMyRequests: (params?: { status?: OrgAppointmentRequestStatus; page?: number; limit?: number }) => Promise<void>
  cancelMyRequest: (id: string) => Promise<void>
  createRequest: (organizationId: string, data: { scheduledAt: string; durationMins?: number; meetingType?: string; notes?: string }) => Promise<any>

  // Actions — court admin
  fetchPendingOrgVerifications: () => Promise<void>
  fetchAllOrgVerifications: (params?: { statuses?: string; page?: number; limit?: number }) => Promise<void>
  verifyOrganization: (organizationId: string, status: 'APPROVED' | 'REJECTED', remarks?: string) => Promise<void>

  // Actions — public discovery
  fetchPublicOrgs: (params?: { pincode?: string; practiceArea?: string; page?: number; limit?: number }) => Promise<void>
  fetchPublicOrgById: (id: string) => Promise<{ organization: Organization & { lawyers: VerifiedLawyer[] } } | null>

  reset: () => void
}

const initialState = {
  me: null,
  loadingMe: false,
  errorMe: null,
  lawyers: [],
  loadingLawyers: false,
  eligibleCourtAdmins: [],
  loadingCourtAdmins: false,
  requests: [],
  requestsTotal: 0,
  loadingRequests: false,
  myRequests: [],
  myRequestsTotal: 0,
  loadingMyRequests: false,
  pendingOrgVerifications: [],
  allOrgVerifications: [],
  loadingOrgVerifications: false,
  publicOrgs: [],
  publicOrgsTotal: 0,
  loadingPublicOrgs: false,
}

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  ...initialState,

  fetchMe: async () => {
    set({ loadingMe: true, errorMe: null })
    try {
      const res = await organizationsApi.getMe()
      const org: Organization = res.data?.organization || res.data
      set({ me: org })
    } catch (err: any) {
      set({ errorMe: err?.response?.data?.message || 'Failed to load organization profile' })
    } finally {
      set({ loadingMe: false })
    }
  },

  updateMe: async (data: any) => {
    set({ loadingMe: true, errorMe: null })
    try {
      const res = await organizationsApi.updateMe(data)
      const org: Organization = res.data?.organization || res.data
      set({ me: org })
    } catch (err: any) {
      set({ errorMe: err?.response?.data?.message || err?.response?.data?.error || 'Failed to update profile' })
      throw err
    } finally {
      set({ loadingMe: false })
    }
  },

  fetchEligibleCourtAdmins: async () => {
    set({ loadingCourtAdmins: true })
    try {
      const res = await organizationsApi.getEligibleCourtAdmins()
      // Backend returns { courtAdmins: [...] }. Without this, the bare `res.data`
      // fallback assigns the whole object and downstream `.map` blanks the page.
      const list = res.data?.courtAdmins ?? res.data?.items ?? (Array.isArray(res.data) ? res.data : [])
      set({ eligibleCourtAdmins: list })
    } catch {
      set({ eligibleCourtAdmins: [] })
    } finally {
      set({ loadingCourtAdmins: false })
    }
  },

  requestVerification: async (courtAdminId: string) => {
    await organizationsApi.requestVerification(courtAdminId)
  },

  fetchLawyers: async (params) => {
    set({ loadingLawyers: true })
    try {
      const res = await organizationsApi.listLawyers(params)
      set({ lawyers: res.data?.items || res.data || [] })
    } catch {
      set({ lawyers: [] })
    } finally {
      set({ loadingLawyers: false })
    }
  },

  addLawyer: async (data: any) => {
    const res = await organizationsApi.addLawyer(data)
    // Refresh list
    await get().fetchLawyers()
    return res.data
  },

  fetchRequests: async (params) => {
    set({ loadingRequests: true })
    try {
      const res = await organizationsApi.listAppointmentRequests(params)
      set({
        requests: res.data?.items || [],
        requestsTotal: res.data?.total || 0,
      })
    } catch {
      set({ requests: [], requestsTotal: 0 })
    } finally {
      set({ loadingRequests: false })
    }
  },

  assignRequest: async (id: string, body) => {
    const res = await organizationsApi.assignAppointmentRequest(id, body)
    // Refresh list
    await get().fetchRequests({ status: 'PENDING' })
    return res.data
  },

  rejectRequest: async (id: string, reason: string) => {
    await organizationsApi.rejectAppointmentRequest(id, reason)
    await get().fetchRequests({ status: 'PENDING' })
  },

  fetchMyRequests: async (params) => {
    set({ loadingMyRequests: true })
    try {
      const res = await organizationsApi.listMyRequests(params)
      set({
        myRequests: res.data?.items || [],
        myRequestsTotal: res.data?.total || 0,
      })
    } catch {
      set({ myRequests: [], myRequestsTotal: 0 })
    } finally {
      set({ loadingMyRequests: false })
    }
  },

  cancelMyRequest: async (id: string) => {
    await organizationsApi.cancelMyRequest(id)
    await get().fetchMyRequests()
  },

  createRequest: async (organizationId, data) => {
    const res = await organizationsApi.createAppointmentRequest(organizationId, data)
    return res.data
  },

  fetchPendingOrgVerifications: async () => {
    set({ loadingOrgVerifications: true })
    try {
      const res = await courtAdminApi.getPendingOrgVerifications()
      set({ pendingOrgVerifications: res.data?.items || res.data || [] })
    } catch {
      set({ pendingOrgVerifications: [] })
    } finally {
      set({ loadingOrgVerifications: false })
    }
  },

  fetchAllOrgVerifications: async (params) => {
    set({ loadingOrgVerifications: true })
    try {
      const res = await courtAdminApi.getAllOrgVerifications(params)
      set({ allOrgVerifications: res.data?.items || res.data || [] })
    } catch {
      set({ allOrgVerifications: [] })
    } finally {
      set({ loadingOrgVerifications: false })
    }
  },

  verifyOrganization: async (organizationId, status, remarks) => {
    await courtAdminApi.verifyOrganization(organizationId, status, remarks)
    // Refresh both lists
    await Promise.all([
      get().fetchPendingOrgVerifications(),
      get().fetchAllOrgVerifications(),
    ])
  },

  fetchPublicOrgs: async (params) => {
    set({ loadingPublicOrgs: true })
    try {
      const res = await organizationsApi.list({ verified: true, ...params })
      set({
        publicOrgs: res.data?.items || [],
        publicOrgsTotal: res.data?.total || 0,
      })
    } catch {
      set({ publicOrgs: [], publicOrgsTotal: 0 })
    } finally {
      set({ loadingPublicOrgs: false })
    }
  },

  fetchPublicOrgById: async (id: string) => {
    try {
      const res = await organizationsApi.getById(id)
      return res.data
    } catch {
      return null
    }
  },

  reset: () => set(initialState),
}))

export default useOrganizationStore
