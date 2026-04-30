import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import storage from '@/utils/storage'
import { UpdateAgreementUrlInput } from '@/schema/appointment.schema'

// Create axios instance with default config
// Compute base URL from VITE_API_URL. If the env value is a host (e.g. http://localhost:3000)
// append `/api/v1`. If the env already contains `/api` or `/api/v1` we use it as-is.
const _envUrl = (import.meta.env.VITE_API_URL as string) || ''
let baseURL = '/api/v1'
if (_envUrl && _envUrl.length > 0) {
  const normalized = _envUrl.replace(/\/+$/g, '') // remove trailing slash(es)
  if (/\/api(\/v1)?$/.test(normalized)) {
    baseURL = normalized
  } else {
    baseURL = `${normalized}/api/v1`
  }
}

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = storage.getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors
// Token refresh handling: on 401, try to refresh using refresh token and retry once.
let isRefreshing = false
let refreshPromise: Promise<any> | null = null

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error.config
    const status = error.response?.status
    const respData = error.response?.data

    // Normalize error message: backend sometimes returns { error: { code, message } }
    let errMsg = ''
    if (respData) {
      if (typeof respData === 'string') errMsg = respData
      else if (typeof respData.error === 'string') errMsg = respData.error
      else if (respData.error && typeof respData.error.message === 'string') errMsg = respData.error.message
      else if (typeof respData.message === 'string') errMsg = respData.message
      else errMsg = JSON.stringify(respData)
    }

    // If the token is expired according to backend message, force logout and redirect to login
    if (errMsg && /jwt expired|token expired|TokenExpiredError/i.test(errMsg)) {
      try {
        useAuthStore.getState().logout()
      } catch (e) {
        // ignore
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login'
      }
      return Promise.reject(error)
    }

    if (!status || status !== 401) return Promise.reject(error)

    if (originalRequest && (originalRequest as any)._retry) {
      // already retried once -> force logout
      try { useAuthStore.getState().logout() } catch (e) { }
      if (typeof window !== 'undefined') window.location.href = '/auth/login'
      return Promise.reject(error)
    }

    const storedRefresh = storage.getRefreshToken()
    if (!storedRefresh) {
      try { useAuthStore.getState().logout() } catch (e) { }
      if (typeof window !== 'undefined') window.location.href = '/auth/login'
      return Promise.reject(error)
    }

    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = api
        .post('/auth/refresh', { refreshToken: storedRefresh })
        .then((res) => {
          const { accessToken, refreshToken } = res.data || {}
          if (accessToken) {
            storage.setAuthToken(accessToken)
            // update auth store token synchronously
            useAuthStore.setState({ token: accessToken, isAuthenticated: true })
            api.defaults.headers.common.Authorization = `Bearer ${accessToken}`
          }
          if (refreshToken) storage.setRefreshToken(refreshToken)
          return res
        })
        .catch((err) => {
          try { useAuthStore.getState().logout() } catch (e) { }
          if (typeof window !== 'undefined') window.location.href = '/auth/login'
          return Promise.reject(err)
        })
        .finally(() => {
          isRefreshing = false
        })
    }

    return refreshPromise!
      .then(() => {
        if (originalRequest) {
          ; (originalRequest as any)._retry = true
          const token = storage.getAuthToken()
          if (token) {
            originalRequest.headers = originalRequest.headers || {}
            originalRequest.headers.Authorization = `Bearer ${token}`
          }
        }
        return api(originalRequest)
      })
      .catch((err) => Promise.reject(err))
  }
)

export interface ApiResponse<T> {
  data: T
  total?: number
}

// API endpoints
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: { name: string; email: string; password: string; role: string; phone?: string }) =>
    api.post('/auth/register', data),
  // backend doesn't implement OTP verification; keep function for compatibility but it will 404
  // Backend expects { identifier, code }
  verifyOtp: (identifier: string, code: string) => api.post('/auth/verify-otp', { identifier, code }),
  requestOtp: (identifier: string) => api.post('/auth/request-otp', { identifier }),
  getMe: () => api.get('/auth/me'),
  restorePassword: (payload: { identifier: string; code: string; password: string }) => api.put('/auth/restore-password', payload),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
}

export const lawyersApi = {
  getAll: (params?: {
    q?: string
    specialization?: string
    city?: string
    state?: string
    clientPincode?: string
    latitude?: number
    longitude?: number
    radiusKm?: number
    minExperience?: number
    maxFee?: number
    languages?: string | string[]
    page?: number
    limit?: number
    sortBy?: string
    order?: 'asc' | 'desc'
  }) => api.get('/lawyers', { params }),
  getById: (id: string) => api.get(`/lawyers/${id}`),
  getProfile: (id: string) => api.get(`/lawyers/${id}/profile`),
}

export const appointmentsApi = {
  create: (data: { lawyerId: string; datetime: string; paymentId?: string }) =>
    api.post('/appointments', data),
  // Book endpoint: backend expects { lawyerId, scheduledAt, durationMins?, meetingType?, paymentMethod?, notes?, mediationId? }
  book: (payload: { lawyerId: string; scheduledAt: string; durationMins?: number; meetingType?: string; paymentMethod?: string; notes?: string; mediationId?: string }) =>
    api.post('/appointments/book', payload),
  // Confirm payment for an appointment
  confirmPayment: (appointmentId: string, body: { appointmentId: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    api.post(`/appointments/${appointmentId}/confirm-payment`, body),
  getAll: () => api.get('/appointments'),
  reschedule: (id: string, scheduledAt: string, durationMins?: number) =>
    api.put(`/appointments/${id}/reschedule`, { scheduledAt, ...(durationMins != null ? { durationMins } : {}) }),
  cancel: (id: string) => api.post(`/appointments/${id}/cancel`),
  updateStatus: (id: string, status: string) => api.patch(`/appointments/${id}`, { status }),
  attend: (id: string) => api.post(`/appointments/${id}/attend`),
  // availability: call backend availability endpoint. Browsers do not reliably send
  // a body with GET requests, so use POST here. The backend accepts POST as well.
  availability: (lawyerId: string, date: string, options?: any) =>
    api.post('/appointments/availability', { lawyerId, date, options }),
  updateAgreementUrl: (data: UpdateAgreementUrlInput) => {
    api.post('/appointments/update-agreement-url', data.body);
  }
}

export const casesApi = {
  getAll: () => api.get('/cases'),
  getById: (id: string) => api.get(`/cases/${id}`),
  create: (data: { title: string; lawyerId: string }) =>
    api.post('/cases', data),
  uploadDocument: (caseId: string, formData: FormData) =>
    api.post(`/cases/${caseId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  // Request a presigned upload URL for a case (backend returns { upload: { uploadUrl, fileUrl, method } })
  // Note: backend expects the file metadata in the request body even though the route is GET.
  // Axios `get` doesn't accept a body, so use `api.request` with method:'get' and `data`.
  getPresignedUrl: (userId: string, body?: { fileName?: string; mimeType?: string; size?: number; userId?: string }) =>
    api.request({ method: 'get', url: `/cases/${userId}/getpresignedUrl`, data: body }),
}

export const usersApi = {
  getMe: () => api.get('/users/me'),
  updateMe: (payload: { name?: string; phone?: string; avatarUrl?: string }) => api.put('/users/me', payload),
  getPresignedUrl: (userId: string, params?: { fileName?: string; mimeType?: string; size?: number }) =>
    api.get(`/cases/${userId}/getpresignedUrl`, { params }),
  // Cloudinary signed upload: returns { timestamp, signature, cloudName, apiKey, folder }
  getUploadSignature: () => api.get('/users/me/upload-signature'),
  // Client information (read & update)
  getClientInformation: () => api.get('/users/client-information'),
  postClientInformation: (payload: any) => api.post('/users/client-information', payload),
  // Lawyer information (read & update)
  getLawyerInformation: () => api.get('/users/lawyer-information'),
  postLawyerInformation: (payload: any) => api.post('/users/lawyer-information', payload),
}

export const chatApi = {
  createChat: (payload: { otherUserId: string; caseId?: string | null }) => api.post('/chat', payload),
  getMessages: (chatId: string, params?: { page?: number; limit?: number }) => api.get(`/chat/${chatId}/messages`, { params }),
  sendMessage: (chatId: string, data: { text?: string; attachments?: string[] }) =>
    // Backend validation expects a JSON body like { text?: string, attachments?: string[] }
    api.post(`/chat/${chatId}/messages`, { text: data.text, attachments: data.attachments }),
  getParticipants: (chatId: string) => api.get(`/chat/${chatId}/participants`),
  getOrCreateAppointmentChat: (appointmentId: string) => api.get(`/chat/appointment/${appointmentId}`),
}

export const notificationsApi = {
  getAll: (params?: { page?: number; limit?: number }) =>
    api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: string) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
}

export const walletApi = {
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (params?: { page?: number; limit?: number }) =>
    api.get('/wallet/transactions', { params }),
  addMoney: (payload: { amount: number }) =>
    api.post('/wallet/add-money', payload),
  confirmAddMoney: (payload: {
    paymentId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => api.post('/wallet/confirm-add-money', payload),
  withdraw: (payload: { amount: number; bankAccountId?: string }) =>
    api.post('/wallet/withdraw', payload),
  transfer: (payload: { toUserId: string; amount: number; description?: string }) =>
    api.post('/wallet/transfer', payload),
}

export const modelChatApi = {
  chatCompletion: (messages: { role: 'user' | 'assistant'; content: string }[]) =>
    api.post('/model/chat', { messages }),
}

export const agreementTemplatesApi = {
  getAll: (params?: { page?: number; limit?: number; category?: string }) =>
    api.get('/agreement-templates', { params }),
  getById: (id: string) => api.get(`/agreement-templates/${id}`),
  create: (data: { title: string; description?: string; content: string; category?: string }) =>
    api.post('/agreement-templates', data),
  update: (id: string, data: { title?: string; description?: string; content?: string; category?: string }) =>
    api.put(`/agreement-templates/${id}`, data),
  delete: (id: string) => api.delete(`/agreement-templates/${id}`),
}

export const adminApi = {
  getNotVerifiedClients: () => api.get('/admin/not-verified-client'),
  getNotVerifiedLawyers: () => api.get('/admin/not-verified-lawyers'),
  verifyClient: (id: string) => api.put(`/admin/${id}/verifyclient`),
  verifyLawyer: (id: string) => api.put(`/admin/${id}/verifylawyer`),
}

export const videoApi = {
  getMeeting: (appointmentId: string) => api.get(`/video/meeting/${appointmentId}`),
  getCallHistory: (params?: { page?: number; limit?: number }) =>
    api.get('/video/call-history', { params }),
}

export const storageApi = {
  getPresignedUrl: `${baseURL}/storage/presigned`,
}

export const teleLawApi = {
  getSchemeInfo: () => api.get('/tele-law/info'),
  checkEligibility: (data: { income?: number; caste?: string; gender?: string; state?: string; useProfile?: boolean }) =>
    api.post('/tele-law/check-eligibility', data),
}

export const apiEndpoints = {
  appointment: {
    getAll: `${baseURL}/appointments/getall`,
  },
  agreement: {
    updateAgreement: `${baseURL}/appointments/update-agreement-url`,
  },
  case: {
    createCaseByLawyer: `${baseURL}/cases/create/case/details/lawyer`,
    acceptCase: (id: string) => `${baseURL}/cases/accept/case/${id}`,
    getAllCases: `${baseURL}/cases/getall/cases`,
    getCaseDetails: (caseid: string) => `${baseURL}/cases/get/details/${caseid}`,
    addTimeLine: (caseid: string) => `${baseURL}/cases/add/timeline/event/${caseid}`,
    getTimeLineEvents: (caseid: string) => `${baseURL}/cases/timeline/events/${caseid}`,
    addHearing: (caseid: string) => `${baseURL}/cases/${caseid}/hearings`,
    getHearings: (caseid: string) => `${baseURL}/cases/hearings/${caseid}`,
    addDocument: (caseid: string) => `${baseURL}/cases/${caseid}/saveDocuments`,
    getDocuments: (caseid: string) => `${baseURL}/cases/${caseid}/documents`,
    extractDocument: (caseid: string, documentId: string) => `${baseURL}/cases/${caseid}/documents/${documentId}/extract`,
    summarizeDocument: (caseid: string, documentId: string) => `${baseURL}/cases/${caseid}/documents/${documentId}/summarize`,
    askDocument: (caseid: string, documentId: string) => `${baseURL}/cases/${caseid}/documents/${documentId}/ask`,
    updateResolutionMethod: (caseid: string) => `${baseURL}/cases/${caseid}/resolution-method`,
    closeCase: (caseid: string) => `${baseURL}/cases/${caseid}/close`,
  }
}

export const documentAiApi = {
  extract: (caseId: string, documentId: string) =>
    api.post(`/cases/${caseId}/documents/${documentId}/extract`),
  summarize: (caseId: string, documentId: string) =>
    api.post(`/cases/${caseId}/documents/${documentId}/summarize`),
  ask: (caseId: string, documentId: string, question: string) =>
    api.post(`/cases/${caseId}/documents/${documentId}/ask`, { question }),
}

export const mediationApi = {
  // Invites
  createInvite: (data: {
    respondentEmail: string
    respondentName?: string
    respondentPhone?: string
    disputeTitle: string
    disputeDescription: string
    initiatorLawyerId?: string
  }) => api.post('/mediations/invites', data),
  getInviteByToken: (token: string) => api.get(`/mediations/invites/public/${token}`),
  acceptInvite: (token: string) => api.post(`/mediations/invites/${token}/accept`),
  declineInvite: (token: string) => api.post(`/mediations/invites/${token}/decline`),

  // Mediator directory / profile
  listMediators: () => api.get('/mediations/mediators'),
  updateMediatorProfile: (data: {
    isMediator: boolean
    mediatorBio?: string
    mediationFee?: number
    mediationSpecializations?: string[]
  }) => api.put('/mediations/me/mediator-profile', data),

  // Mediation lifecycle
  list: () => api.get('/mediations'),
  getById: (id: string) => api.get(`/mediations/${id}`),
  attachRespondentLawyer: (id: string, lawyerId: string) =>
    api.post(`/mediations/${id}/respondent-lawyer`, { lawyerId }),
  pickMediator: (id: string, mediatorId: string) =>
    api.post(`/mediations/${id}/mediator-pick`, { mediatorId }),
  getRoom: (id: string) => api.get(`/mediations/${id}/room`),
  conclude: (id: string, data: { outcome: 'RESOLVED' | 'ESCALATED_TO_CASE'; settlementTerms?: string; closureNotes?: string }) =>
    api.post(`/mediations/${id}/conclude`, data),
}

export const courtAdminApi = {
  login: (email: string, password: string) => api.post('/court-admin/login', { email, password }),
  getCourtsByPincode: (pincode: string) => api.get(`/court-admin/public/courts/by-pincode/${pincode}`),
  getAdminsByPincode: (pincode: string) => api.get(`/court-admin/public/admins/by-pincode/${pincode}`),
  getMe: () => api.get('/court-admin/me'),
  updateMe: (data: { name?: string; email?: string; phone?: string; avatarUrl?: string; registrationNumber?: string }) =>
    api.put('/court-admin/me', data),
  updateMyCourt: (data: any) => api.put('/court-admin/me/court', data),

  // Lawyer actions
  requestVerification: (courtAdminId: string) => api.post('/court-admin/verifications/request', { courtAdminId }),
  getMyRequests: () => api.get('/court-admin/verifications/my-requests'),

  // Court Admin actions
  getPendingVerifications: () => api.get('/court-admin/verifications/pending'),
  getAllVerifications: () => api.get('/court-admin/verifications'),
  getVerificationDocuments: (lawyerId: string) => api.get(`/court-admin/verify/${lawyerId}/documents`),
  verifyLawyer: (lawyerId: string, status: 'APPROVED' | 'REJECTED', remarks?: string) =>
    api.post(`/court-admin/verify/${lawyerId}`, { status, remarks }),

  // Organization verification actions
  getPendingOrgVerifications: () => api.get('/court-admin/organization-verifications/pending'),
  getAllOrgVerifications: (params?: { statuses?: string; page?: number; limit?: number }) =>
    api.get('/court-admin/organization-verifications', { params }),
  verifyOrganization: (organizationId: string, status: 'APPROVED' | 'REJECTED', remarks?: string) =>
    api.post(`/court-admin/verify-organization/${organizationId}`, { status, remarks }),
}

// ── Organization (law-firm) API ───────────────────────────────────────

export interface OrgRegisterPayload {
  role: 'ORGANIZATION'
  name: string
  email: string
  phone: string
  password: string
  registrationNumber?: string
  pincode?: string
}

export interface OrgUpdatePayload {
  name?: string
  email?: string
  phone?: string
  avatarUrl?: string
  registrationNumber?: string | null
  registrationCertUrl?: string | null
  gstNumber?: string | null
  gstProofUrl?: string | null
  panNumber?: string | null
  about?: string | null
  website?: string | null
  practiceAreas?: string[]
  /** PAISE — frontend multiplies rupees by 100 before sending. */
  consultationFee?: number | null
  country?: string
  state?: string
  district?: string
  city?: string
  pincode?: string
  address?: string
  latitude?: number | null
  longitude?: number | null
}

export interface OrgAddLawyerPayload {
  name: string
  email: string
  phone: string
  password: string
  licenseNumber?: string
  barCouncilId?: string
  specializations?: string[]
  feePerConsultation?: number
  pincode?: string
  city?: string
  state?: string
  bio?: string
  experienceYears?: number
}

export const organizationsApi = {
  // Public listing & profile
  list: (params?: { pincode?: string; practiceArea?: string; verified?: boolean; page?: number; limit?: number }) =>
    api.get('/organizations', { params }),
  getById: (id: string) => api.get(`/organizations/${id}`),

  // Org-self (auth: ORGANIZATION)
  getMe: () => api.get('/organizations/me'),
  updateMe: (data: OrgUpdatePayload) => api.put('/organizations/me', data),
  getEligibleCourtAdmins: () => api.get('/organizations/me/eligible-court-admins'),
  requestVerification: (courtAdminId: string) =>
    api.post('/organizations/me/verification-request', { courtAdminId }),

  // Lawyers managed by org
  addLawyer: (data: OrgAddLawyerPayload) => api.post('/organizations/me/lawyers', data),
  listLawyers: (params?: { page?: number; limit?: number }) =>
    api.get('/organizations/me/lawyers', { params }),

  // Appointment requests received by org
  listAppointmentRequests: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get('/organizations/me/appointment-requests', { params }),
  assignAppointmentRequest: (
    id: string,
    body: { lawyerId: string; paymentMethod: 'razorpay' | 'wallet' }
  ) => api.post(`/organizations/me/appointment-requests/${id}/assign`, body),
  rejectAppointmentRequest: (id: string, reason: string) =>
    api.post(`/organizations/me/appointment-requests/${id}/reject`, { reason }),

  // Client-facing
  createAppointmentRequest: (
    organizationId: string,
    data: { scheduledAt: string; durationMins?: number; meetingType?: string; notes?: string }
  ) => api.post(`/organizations/${organizationId}/appointment-requests`, data),
  listMyRequests: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get('/organizations/clients/me/requests', { params }),
  cancelMyRequest: (id: string) =>
    api.post(`/organizations/clients/me/requests/${id}/cancel`),
}

export default api