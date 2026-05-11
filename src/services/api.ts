import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import storage from '@/utils/storage'
import { UpdateAgreementUrlInput } from '@/schema/appointment.schema'
import { normalizeApiBase } from '@/utils/apiUrl'

// Compute base URL from VITE_API_URL. Accepts naked hosts (`api.nyayax.com`)
// as well as full URLs (`http://localhost:4000/api/v1`) — see normalizeApiBase
// for the full normalisation rules. Falls back to a same-origin `/api/v1`
// when the env var is empty.
const baseURL = normalizeApiBase(import.meta.env.VITE_API_URL as string) || '/api/v1'

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

// ─────────────────────────────────────────────────────────────────────────
// Auth-error interceptor with single-flight token refresh.
//
// Flow:
//   1. Any 401 from the API (other than the refresh / login endpoints
//      themselves) triggers a refresh attempt via /auth/refresh.
//   2. Concurrent 401s share the same in-flight refresh promise, so we
//      never spam the refresh endpoint or double-rotate the refresh token.
//   3. On success we retry the original request with the new access token.
//   4. Only when the *refresh* itself fails (refresh token expired, revoked,
//      or no refresh token in storage) do we bounce the user to login.
//
// Previously this interceptor short-circuited on any response body matching
// /jwt expired/ — that defeated the whole purpose of refresh tokens, because
// an expired access token (the common case) would force re-login instead of
// silently rotating. With the server's default 7-day access token TTL, that
// meant users seeing "session expired" anytime they came back after a few
// hours, even though the refresh token was still valid for 30 days.
// ─────────────────────────────────────────────────────────────────────────

let isRefreshing = false
let refreshPromise: Promise<any> | null = null

// URLs we must NOT auto-refresh on — refreshing on /auth/refresh itself
// would infinite-loop, and refreshing on /auth/login etc. would obscure
// a legitimate "wrong password" 401 by trying to use a stale refresh token.
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/request-otp', '/auth/verify-otp']

const isAuthEndpoint = (url: string | undefined) => {
  if (!url) return false
  return NO_REFRESH_PATHS.some((p) => url.includes(p))
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error.config
    const status = error.response?.status

    // Helper: when we have to bounce the user back to login because their
    // session can't be refreshed, append `?session=expired` so the login page
    // can show a friendly "Your session expired, please sign in again" hint
    // instead of dumping them at a blank form with no context.
    const bounceToLogin = () => {
      try { useAuthStore.getState().logout() } catch (e) { /* noop */ }
      if (typeof window !== 'undefined') {
        const cur = window.location.pathname
        // Skip the bounce if we're already on a public auth page — no need to
        // loop the user back through login from the login screen itself.
        if (!cur.startsWith('/auth/')) {
          window.location.href = '/auth/login?session=expired'
        }
      }
    }

    // Not a 401? Not our problem — let the caller handle it.
    if (!status || status !== 401) return Promise.reject(error)

    // 401 on /auth/refresh or login endpoints — don't try to recover; that
    // would loop. Login failures shouldn't try to refresh either.
    if (isAuthEndpoint(originalRequest?.url)) {
      // If it's specifically the refresh endpoint that 401'd, the refresh
      // token is dead — bounce. Other auth endpoints (login etc.) just reject
      // so the caller can show "wrong password" inline without redirecting.
      if (originalRequest?.url?.includes('/auth/refresh')) bounceToLogin()
      return Promise.reject(error)
    }

    if (originalRequest && (originalRequest as any)._retry) {
      // already retried once after a refresh -> the refresh succeeded but the
      // server still rejects us. Bounce so the user can re-authenticate fresh.
      bounceToLogin()
      return Promise.reject(error)
    }

    const storedRefresh = storage.getRefreshToken()
    if (!storedRefresh) {
      bounceToLogin()
      return Promise.reject(error)
    }

    if (!isRefreshing) {
      isRefreshing = true
      // Use a bare axios instance for the refresh call so this same response
      // interceptor doesn't intercept its own refresh and recurse. (Previously
      // this used `api.post('/auth/refresh', ...)` which sent the expired
      // Authorization header on the refresh call too — fine functionally, but
      // wasteful and confusing in logs.)
      refreshPromise = axios
        .create({ baseURL, headers: { 'Content-Type': 'application/json' } })
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
          bounceToLogin()
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
  // Authenticated change-password — also clears server-side
  // `mustChangePassword` flag, unblocking the forced-rotation guard.
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
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
  /**
   * Returns Cloudinary signed-upload params (timestamp, signature, cloudName,
   * apiKey, folder='lawyer-applications') for direct client → Cloudinary upload
   * of license / bar council proof during onboarding.
   */
  apply: (payload?: {
    userId?: string
    name?: string
    email?: string
    phone?: string
    licenseNumber?: string
    fileName?: string
    fileType?: string
  }) => api.post('/lawyers/apply', payload || {}),
  update: (id: string, payload: any) => api.put(`/lawyers/${id}`, payload),
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
  },
  // Attach a document to an appointment. Backend wraps OCR + auto-summary.
  addDocument: (
    appointmentId: string,
    body: { fileurl: string; fileName: string; mimeType: string; size?: number },
  ) => api.post(`/appointments/${appointmentId}/documents`, body),
  listDocuments: (appointmentId: string) =>
    api.get(`/appointments/${appointmentId}/documents`),
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
  deleteMe: () => api.delete('/users/me'),
  /** General user lookup — server resolves across CLIENT/LAWYER/ORG/COURT_ADMIN tables. */
  getById: (id: string) => api.get(`/users/${id}`),
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
  // Returns the user's WhatsApp-style conversation list — one row per
  // counterpart, with last message and unread count rolled up server-side.
  // Backed by `GET /chat` → `chat.controller.listChats`.
  listChats: () => api.get('/chat'),
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
  // Existing
  getNotVerifiedClients: () => api.get('/admin/not-verified-client'),
  getNotVerifiedLawyers: () => api.get('/admin/not-verified-lawyers'),
  verifyClient: (id: string) => api.put(`/admin/${id}/verifyclient`),
  verifyLawyer: (id: string) => api.put(`/admin/${id}/verifylawyer`),

  // Dashboard
  getDashboard: () => api.get('/admin/dashboard'),

  // User browsing (USERS permission)
  getAllUsers: (params?: { role?: string; q?: string; page?: number; limit?: number }) =>
    api.get('/admin/users', { params }),
  getUserById: (id: string) => api.get(`/admin/users/${id}`),
  toggleUserVerification: (id: string, payload: { isVerified: boolean; reason?: string }) =>
    api.put(`/admin/users/${id}/verification`, payload),

  // Admin team management (SUPER_ADMIN)
  listAdmins: (params?: { page?: number; limit?: number; q?: string }) =>
    api.get('/admin/admins', { params }),
  createAdmin: (payload: { name: string; email: string; phone: string; password: string; level?: 'SUPER_ADMIN' | 'ADMIN'; permissions?: string[] }) =>
    api.post('/admin/admins', payload),
  getAdmin: (id: string) => api.get(`/admin/admins/${id}`),
  updateAdmin: (id: string, payload: any) => api.put(`/admin/admins/${id}`, payload),
  deleteAdmin: (id: string) => api.delete(`/admin/admins/${id}`),

  // Monthly activity / performance logs (SUPER_ADMIN). Each returns headline
  // metrics + a detailed activity timeline + the auto-computed salary breakdown
  // for the selected cycle. Used by the /admin/{role}/:id/activity pages.
  getLawyerMonthlyActivity: (id: string, params: { month: number; year: number }) =>
    api.get(`/admin/performance/lawyer/${id}`, { params }),
  getOrganizationMonthlyActivity: (id: string, params: { month: number; year: number }) =>
    api.get(`/admin/performance/organization/${id}`, { params }),
  getCourtAdminMonthlyActivity: (id: string, params: { month: number; year: number }) =>
    api.get(`/admin/performance/court-admin/${id}`, { params }),

  // Payouts (SUPER_ADMIN)
  listPayouts: (params?: {
    payoutStatus?: 'HELD_BY_PLATFORM' | 'PAYABLE' | 'PAID_OUT' | 'REFUNDED'
    beneficiaryType?: 'LAWYER' | 'ORGANIZATION'
    page?: number
    limit?: number
  }) => api.get('/admin/payouts', { params }),
  getPayoutSummary: () => api.get('/admin/payouts/summary'),
  getEscrowLedger: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/payouts/escrow-ledger', { params }),
  listPayoutHistory: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/payouts/history', { params }),
  reconcileLedger: () => api.get('/admin/payouts/reconcile'),
  disbursePayout: (id: string) => api.post(`/admin/payouts/${id}/disburse`),
  refundPayout: (id: string, reason?: string) => api.post(`/admin/payouts/${id}/refund`, { reason }),
  openDispute: (id: string, reason?: string) => api.post(`/admin/payouts/${id}/dispute`, { reason }),
  resolveDispute: (id: string, payload: { resolution: 'REFUND' | 'RELEASE'; notes?: string }) =>
    api.post(`/admin/payouts/${id}/dispute/resolve`, payload),

  // Court admin authorization (SUPER_ADMIN)
  listPendingCourtAdmins: (params?: {
    page?: number
    limit?: number
    verificationStatus?: 'PENDING_SUPER_ADMIN_APPROVAL' | 'APPROVED' | 'REJECTED'
  }) => api.get('/admin/court-admins/pending', { params }),
  getCourtAdminDetail: (id: string) => api.get(`/admin/court-admins/${id}`),
  approveCourtAdmin: (id: string, remarks?: string) =>
    api.post(`/admin/court-admins/${id}/approve`, { remarks }),
  rejectCourtAdmin: (id: string, reason: string) =>
    api.post(`/admin/court-admins/${id}/reject`, { reason }),

  // KYC override (SUPER_ADMIN)
  overrideLawyerKyc: (id: string, payload: { isVerified: boolean; reason: string }) =>
    api.post(`/admin/lawyers/${id}/kyc-override`, payload),
  overrideOrgKyc: (id: string, payload: { isVerified: boolean; reason: string }) =>
    api.post(`/admin/organizations/${id}/kyc-override`, payload),

  // User control (SUPER_ADMIN)
  banUser: (role: string, id: string, reason: string) =>
    api.post(`/admin/users/${role}/${id}/ban`, { reason }),
  unbanUser: (role: string, id: string) =>
    api.post(`/admin/users/${role}/${id}/unban`),
  softDeleteUser: (role: string, id: string, reason?: string) =>
    api.post(`/admin/users/${role}/${id}/soft-delete`, { reason }),
  forcePasswordReset: (role: string, id: string) =>
    api.post(`/admin/users/${role}/${id}/force-password-reset`),

  // Platform config (SUPER_ADMIN)
  listConfig: () => api.get('/admin/config'),
  upsertConfig: (key: string, value: any) => api.put(`/admin/config/${key}`, { value }),

  // Audit log (SUPER_ADMIN)
  getAuditLog: (params?: { page?: number; limit?: number; actorId?: string; action?: string }) =>
    api.get('/admin/audit-log', { params }),

  // Reports moderation (REPORTS permission)
  listReports: (params?: { status?: string; q?: string; page?: number; limit?: number }) =>
    api.get('/admin/reports', { params }),
  updateReportStatus: (id: string, status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED') =>
    api.patch(`/admin/reports/${id}`, { status }),

  // Legal updates publishing (LEGAL_UPDATES permission)
  createLegalUpdate: (payload: { title: string; content: string; category: string; publishedAt?: string }) =>
    api.post('/admin/legal-updates', payload),
  updateLegalUpdate: (id: string, payload: any) =>
    api.put(`/admin/legal-updates/${id}`, payload),
  deleteLegalUpdate: (id: string) => api.delete(`/admin/legal-updates/${id}`),

  // Announcements (SUPER_ADMIN)
  broadcast: (payload: { title: string; message: string; roles?: string[] }) =>
    api.post('/admin/announcements', payload),

  // Legacy financial monitoring
  getAllPayments: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/payments', { params }),
  getAllWallets: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/wallets', { params }),
  getWithdrawals: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/wallets/withdrawals', { params }),
  reverseWithdrawal: (id: string) =>
    api.put(`/admin/wallets/withdrawals/${id}/reverse`),
}

// ── Admin Court Admin salary (separate routes from entity salary) ──────
export const adminCourtAdminSalaryApi = {
  // Cycle queues
  listPayable: () => api.get('/admin/salary-cycles/current'),
  // History across all court admins
  cyclesHistory: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/salary-cycles/history', { params }),
  // Per-court-admin
  getConfig: (id: string) => api.get(`/admin/court-admins/${id}/salary`),
  setBaseSalary: (id: string, payload: { baseSalary?: number; notes?: string }) =>
    api.put(`/admin/court-admins/${id}/salary`, payload),
  hold: (id: string, reason: string) =>
    api.post(`/admin/court-admins/${id}/salary/hold`, { reason }),
  release: (id: string, notes?: string) =>
    api.post(`/admin/court-admins/${id}/salary/release`, { notes }),
  pay: (id: string, payload?: { notes?: string }) =>
    api.post(`/admin/court-admins/${id}/salary/pay`, payload || {}),
  history: (id: string) => api.get(`/admin/court-admins/${id}/salary/history`),
  performance: (id: string) => api.get(`/admin/court-admins/${id}/performance`),
}

// ── Admin entity salary management (LAWYER + ORGANIZATION) ────────────
// Server mounts the same handlers under /admin/lawyers/:id/salary/*
// and /admin/organizations/:id/salary/* via mountEntitySalaryRoutes().
type SalarySubject = 'lawyers' | 'organizations'

export const adminSalaryApi = {
  // Cycle-level queues (no :id)
  listPayableLawyers: () => api.get('/admin/lawyer-salary-cycles/current'),
  listPayableOrganizations: () => api.get('/admin/org-salary-cycles/current'),

  // Per-entity config + lifecycle
  getConfig: (subject: SalarySubject, id: string) =>
    api.get(`/admin/${subject}/${id}/salary`),
  setConfig: (subject: SalarySubject, id: string, payload: { baseSalary?: number; bonusPct?: number; notes?: string }) =>
    api.put(`/admin/${subject}/${id}/salary`, payload),
  hold: (subject: SalarySubject, id: string, reason: string) =>
    api.post(`/admin/${subject}/${id}/salary/hold`, { reason }),
  release: (subject: SalarySubject, id: string, notes?: string) =>
    api.post(`/admin/${subject}/${id}/salary/release`, { notes }),
  preview: (subject: SalarySubject, id: string) =>
    api.get(`/admin/${subject}/${id}/salary/preview`),
  pay: (subject: SalarySubject, id: string, payload?: { notes?: string }) =>
    api.post(`/admin/${subject}/${id}/salary/pay`, payload || {}),
  adjustmentHistory: (subject: SalarySubject, id: string) =>
    api.get(`/admin/${subject}/${id}/salary/history`),
  payoutHistory: (subject: SalarySubject, id: string) =>
    api.get(`/admin/${subject}/${id}/salary/payouts`),
  getBankAccounts: (subject: SalarySubject, id: string) =>
    api.get(`/admin/${subject}/${id}/bank-accounts`),
}

// ── Admin court CRUD + court-admin team mgmt (mounted under /court-admin) ──
export const adminCourtApi = {
  // Court CRUD
  createCourt: (payload: any) => api.post('/court-admin/courts', payload),
  listCourts: (params?: { page?: number; limit?: number; q?: string }) =>
    api.get('/court-admin/courts', { params }),
  getCourt: (id: string) => api.get(`/court-admin/courts/${id}`),
  updateCourt: (id: string, payload: any) => api.put(`/court-admin/courts/${id}`, payload),
  deleteCourt: (id: string) => api.delete(`/court-admin/courts/${id}`),

  // Court Admin team
  createCourtAdmin: (payload: any) => api.post('/court-admin/admins', payload),
  listCourtAdmins: (params?: { page?: number; limit?: number; q?: string }) =>
    api.get('/court-admin/admins', { params }),
  getCourtAdmin: (id: string) => api.get(`/court-admin/admins/${id}`),
  toggleCourtAdminStatus: (id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') =>
    api.put(`/court-admin/admins/${id}/status`, { status }),
}

// ── Lawyer salary (LAWYER self) ────────────────────────────────────────
export const lawyerSalaryApi = {
  getMine: () => api.get('/lawyers/me/salary'),
  apply: (payload: any) => api.post('/lawyers/apply', payload),
  update: (id: string, payload: any) => api.put(`/lawyers/${id}`, payload),
}

// ── Court Admin extensions ─────────────────────────────────────────────
export const courtAdminExtApi = {
  selfRegister: (payload: any) => api.post('/court-admin/register', payload),
  getMyAuthorization: () => api.get('/court-admin/me/authorization'),
  reapply: (payload?: { remarks?: string }) =>
    api.post('/court-admin/me/reapply', payload || {}),
  getMySalary: () => api.get('/court-admin/me/salary'),
}

// ── Document AI (case-scoped) ──────────────────────────────────────────
// `documentAiApi` already exists above with extract/summarize/ask.

// ── Address ────────────────────────────────────────────────────────────
export const addressApi = {
  getStates: () => api.get('/address/states'),
  getDistricts: (state: string) => api.get(`/address/districts/${encodeURIComponent(state)}`),
  getPincode: (pincode: string) => api.get(`/address/pincode/${pincode}`),
}

// ── FCM Tokens (push notifications) ────────────────────────────────────
export const fcmApi = {
  register: (token: string, deviceId?: string) =>
    api.post('/users/fcm-token', { token, deviceId }),
  remove: (token: string) =>
    api.delete('/users/fcm-token', { data: { token } }),
}

// ── Payments — refund ──────────────────────────────────────────────────
export const paymentsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get('/payments', { params }),
  getById: (id: string) => api.get(`/payments/${id}`),
  requestRefund: (id: string, reason?: string) =>
    api.post(`/payments/${id}/refund`, { reason }),
}

// ── Appointments — lifecycle actions, dashboards ───────────────────────
export const appointmentsExtApi = {
  accept: (id: string) => api.post(`/appointments/${id}/accept`),
  reject: (id: string, reason?: string) =>
    api.post(`/appointments/${id}/reject`, { reason }),
  complete: (id: string) => api.post(`/appointments/${id}/complete`),
  lawyerDashboard: () => api.get('/appointments/dashboard/lawyer'),
  clientDashboard: () => api.get('/appointments/dashboard/client'),
  getById: (id: string) => api.get(`/appointments/${id}`),
}

// ── Cases — tasks, hearings, timeline ──────────────────────────────────
export const casesExtApi = {
  // Tasks
  listTasks: (caseId: string) => api.get(`/cases/${caseId}/tasks`),
  createTask: (caseId: string, payload: { title: string; description?: string; assigneeRole?: 'CLIENT' | 'LAWYER'; dueDate?: string }) =>
    api.post(`/cases/${caseId}/tasks`, payload),
  updateTask: (taskId: string, payload: { status?: string; title?: string; description?: string; dueDate?: string }) =>
    api.put(`/cases/tasks/${taskId}`, payload),
  // Timeline
  addTimeline: (caseId: string, payload: { event: string; description?: string; timestamp?: string }) =>
    api.post(`/cases/${caseId}/timeline`, payload),
  // Hearings
  addHearing: (caseId: string, payload: { date: string; court?: string; judge?: string; purpose?: string; outcome?: string; notes?: string }) =>
    api.post(`/cases/${caseId}/hearings`, payload),
  // Resolution & closure
  updateResolutionMethod: (caseId: string, method: 'TRIAL' | 'MEDIATION' | 'ARBITRATION') =>
    api.put(`/cases/${caseId}/resolution-method`, { resolutionMethod: method }),
  closeCase: (caseId: string, payload: { settlementAmount?: number; settlementTerms?: string; closureNotes?: string; status?: string }) =>
    api.post(`/cases/${caseId}/close`, payload),
}

export const videoApi = {
  getMeeting: (appointmentId: string) => api.get(`/video/meeting/${appointmentId}`),
  /** Manually provision a Daily.co room for an appointment (fallback when the
   *  auto-create on appointment-confirm didn't fire). */
  createMeeting: (appointmentId: string) =>
    api.post('/video/meeting', { appointmentId }),
  /** End an in-progress meeting. The lawyer (host) calls this on leave so the
   *  server can release escrow / mark the consultation completed. */
  endMeeting: (appointmentId: string) =>
    api.post(`/video/meeting/${appointmentId}/end`),
  getCallHistory: (params?: { page?: number; limit?: number }) =>
    api.get('/video/call-history', { params }),
}

// ── eKYC (Aadhaar OTP-based, CLIENT only) ──────────────────────────────
// Server: /api/v1/ekyc — Sandbox.co.in-backed. Heavily rate-limited:
//   POST /aadhaar/initiate    → 5/hour  (each call costs ~₹2-4)
//   POST /aadhaar/submit-otp  → 10/15min
// Both throw 429 with `{ error: 'Too many ... attempts ...' }` past the cap.
export const ekycApi = {
  getStatus: () => api.get('/ekyc/status'),
  initiateAadhaar: (aadhaar: string) =>
    api.post('/ekyc/aadhaar/initiate', { aadhaar }),
  submitOtp: (submissionId: string, otp: string) =>
    api.post('/ekyc/aadhaar/submit-otp', { submissionId, otp }),

  // Temporary email-OTP fallback while the Aadhaar provider key is
  // unavailable. Server sends a 6-digit OTP to the registered email and
  // flips ekycVerified=true on success with ekycVerifiedVia='EMAIL_OTP'.
  initiateEmailOtp: () => api.post('/ekyc/email-otp/initiate', {}),
  submitEmailOtp: (submissionId: string, otp: string) =>
    api.post('/ekyc/email-otp/submit', { submissionId, otp }),
}

export const storageApi = {
  getPresignedUrl: `${baseURL}/storage/presigned`,
  // GET /storage/sign?folder=documents|profiles|lawyer-applications
  // Returns Cloudinary signed upload params: { timestamp, signature, cloudName, apiKey, folder }
  getSignature: (folder: 'documents' | 'profiles' | 'lawyer-applications' = 'lawyer-applications') =>
    api.get('/storage/sign', { params: { folder } }),
}

export const teleLawApi = {
  getSchemeInfo: () => api.get('/tele-law/info'),
  checkEligibility: (data: { income?: number; caste?: string; gender?: string; state?: string; useProfile?: boolean }) =>
    api.post('/tele-law/check-eligibility', data),
}

// ── Referral ───────────────────────────────────────────────────────────
export const referralApi = {
  getCode: () => api.get('/referral/code'),
  apply: (code: string) => api.post('/referral/apply', { code }),
  getInfo: () => api.get('/referral/info'),
}

// ── Subscription ───────────────────────────────────────────────────────
export const subscriptionApi = {
  get: () => api.get('/subscription'),
  subscribe: () => api.post('/subscription/subscribe'),
  confirm: (payload: {
    paymentId: string
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
  }) => api.post('/subscription/confirm', payload),
  subscribeFromWallet: () => api.post('/subscription/subscribe-wallet'),
  cancel: () => api.post('/subscription/cancel'),
}

// ── Bank Accounts ──────────────────────────────────────────────────────
export interface BankAccountPayload {
  type: 'BANK' | 'UPI'
  accountHolderName?: string
  accountNumber?: string
  ifscCode?: string
  bankName?: string
  upiId?: string
  label?: string
  isDefault?: boolean
}

export const bankAccountApi = {
  list: () => api.get('/bank-accounts'),
  getById: (id: string) => api.get(`/bank-accounts/${id}`),
  create: (data: BankAccountPayload) => api.post('/bank-accounts', data),
  update: (id: string, data: Partial<BankAccountPayload>) =>
    api.put(`/bank-accounts/${id}`, data),
  delete: (id: string) => api.delete(`/bank-accounts/${id}`),
  verifyUpi: (upiId: string) => api.post('/bank-accounts/verify-upi', { upiId }),
  ifscLookup: (code: string) => api.get(`/bank-accounts/ifsc/${code}`),
}

// ── Reports / Issue Tracking ───────────────────────────────────────────
export const reportApi = {
  create: (payload: { title: string; description: string; screenshotUrl?: string }) =>
    api.post('/report', payload),
  list: () => api.get('/report'),
}

// ── Legal Updates ──────────────────────────────────────────────────────
export const legalUpdatesApi = {
  list: (params?: { category?: string; search?: string }) =>
    api.get('/legal-updates', { params }),
}

// ── Reviews ────────────────────────────────────────────────────────────
export const reviewsApi = {
  list: (lawyerId: string, params?: { page?: number; limit?: number }) =>
    api.get(`/lawyers/${lawyerId}/reviews`, { params }),
  create: (lawyerId: string, payload: { rating: number; comment?: string; appointmentId?: string }) =>
    api.post(`/lawyers/${lawyerId}/reviews`, payload),
  getEligibility: (lawyerId: string, appointmentId?: string) =>
    api.get(`/lawyers/${lawyerId}/review-eligibility`, {
      params: appointmentId ? { appointmentId } : undefined,
    }),
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
  // Generic per-document endpoints — work for any parent (case, appointment, etc.)
  extractById: (documentId: string) =>
    api.post(`/documents/${documentId}/extract`),
  summarizeById: (documentId: string) =>
    api.post(`/documents/${documentId}/summarize`),
  askById: (documentId: string, question: string) =>
    api.post(`/documents/${documentId}/ask`, { question }),
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
  // Pure task assignment — the client paid at booking time, so the body
  // only carries the lawyer id. The server materialises the appointment,
  // repoints the existing pre-paid Payment to it, and notifies everyone.
  assignAppointmentRequest: (
    id: string,
    body: { lawyerId: string }
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

  // ─── Org-head salary management for lawyers under the org ────────────
  // Backed by `/organizations/me/lawyers/:id/salary*` (auth: ORGANIZATION).
  // Server enforces ownership via assertLawyerInOrg.
  getLawyerSalaryConfig: (lawyerId: string) =>
    api.get(`/organizations/me/lawyers/${lawyerId}/salary`),
  setLawyerSalaryConfig: (
    lawyerId: string,
    payload: {
      baseSalary?: number
      bonusPerConsultation?: number
      bonusPerCaseClosed?: number
      bonusPerWonCase?: number
      reason?: string
    }
  ) => api.put(`/organizations/me/lawyers/${lawyerId}/salary`, payload),
  holdLawyerSalary: (lawyerId: string, reason: string) =>
    api.post(`/organizations/me/lawyers/${lawyerId}/salary/hold`, { reason }),
  releaseLawyerSalary: (lawyerId: string, reason?: string) =>
    api.post(`/organizations/me/lawyers/${lawyerId}/salary/release`, { reason }),
  previewLawyerSalary: (
    lawyerId: string,
    params: { cycleMonth: number; cycleYear: number }
  ) => api.get(`/organizations/me/lawyers/${lawyerId}/salary/preview`, { params }),
  payLawyerSalary: (
    lawyerId: string,
    payload: {
      cycleMonth?: number
      cycleYear?: number
      bonusAmount?: number
      deductionAmount?: number
      notes?: string
      providerPayoutId?: string
    }
  ) => api.post(`/organizations/me/lawyers/${lawyerId}/salary/pay`, payload),
  getLawyerSalaryAdjustmentHistory: (lawyerId: string, params?: { limit?: number }) =>
    api.get(`/organizations/me/lawyers/${lawyerId}/salary/history`, { params }),
  getLawyerSalaryPayoutHistory: (lawyerId: string, params?: { limit?: number }) =>
    api.get(`/organizations/me/lawyers/${lawyerId}/salary/payouts`, { params }),
  getLawyerBankAccounts: (lawyerId: string) =>
    api.get(`/organizations/me/lawyers/${lawyerId}/bank-accounts`),
  // The org's own performance salary view (paid by the platform, not by us).
  getMyOrganizationSalary: () => api.get('/organizations/me/salary'),
}

export default api