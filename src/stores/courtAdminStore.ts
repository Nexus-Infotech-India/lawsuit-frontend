import { create } from 'zustand';
import { courtAdminApi } from '@/services/api';
import storage from '@/utils/storage';
import { friendlyError } from '@/utils/errors';
import type { User } from '@/types';

export interface VerificationRequest {
    id: string;
    lawyerId: string;
    courtAdminId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    remarks?: string;
    verifiedAt?: string;
    createdAt: string;
    lawyer: {
        id: string;
        name: string;
        email: string;
        phone: string;
        licenseNumber: string;
        barCouncilId: string;
    };
}

interface CourtAdminState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    pendingVerifications: VerificationRequest[];
    allVerifications: VerificationRequest[];

    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    fetchPendingVerifications: () => Promise<void>;
    fetchAllVerifications: () => Promise<void>;
    verifyLawyer: (lawyerId: string, status: 'APPROVED' | 'REJECTED', remarks?: string) => Promise<void>;
    clearError: () => void;
}

export const useCourtAdminStore = create<CourtAdminState>((set, get) => ({
    user: storage.getUserData(),
    token: storage.getAuthToken(),
    isAuthenticated: !!storage.getAuthToken() && (storage.getUserData() as User | null)?.role === 'COURT_ADMIN',
    isLoading: false,
    error: null,
    pendingVerifications: [],
    allVerifications: [],

    login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
            const response = await courtAdminApi.login(email, password);
            // Backend returns { courtAdmin, accessToken, refreshToken }
            const { courtAdmin, accessToken, refreshToken } = response.data;
            if (!courtAdmin) {
                throw new Error('Invalid response from server.');
            }

            // Re-shape to match the general internal User type
            const user = { ...courtAdmin, role: 'COURT_ADMIN' };

            storage.setUserData(user);
            if (accessToken) storage.setAuthToken(accessToken);
            if (refreshToken) storage.setRefreshToken(refreshToken);
            set({ user, token: accessToken ?? null, isAuthenticated: true });
        } catch (error: any) {
            set({ error: friendlyError(error, "We couldn't sign you in. Please check your details and try again.") });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    logout: () => {
        storage.clear();
        set({ user: null, token: null, isAuthenticated: false, pendingVerifications: [], allVerifications: [] });
    },

    fetchPendingVerifications: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await courtAdminApi.getPendingVerifications();
            set({ pendingVerifications: response.data.items || [] });
        } catch (error: any) {
            set({ error: friendlyError(error, "We couldn't load pending verification requests.") });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    fetchAllVerifications: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await courtAdminApi.getAllVerifications();
            set({ allVerifications: response.data.items || [] });
        } catch (error: any) {
            set({ error: friendlyError(error, "We couldn't load verification history.") });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    verifyLawyer: async (lawyerId: string, status: 'APPROVED' | 'REJECTED', remarks?: string) => {
        set({ isLoading: true, error: null });
        try {
            await courtAdminApi.verifyLawyer(lawyerId, status, remarks);
            // Remove from pending list after action
            const newPending = get().pendingVerifications.filter(v => v.lawyerId !== lawyerId);
            set({ pendingVerifications: newPending });
            // Refresh all verifications to reflect new status
            get().fetchAllVerifications();
        } catch (error: any) {
            set({ error: friendlyError(error, "We couldn't update this verification. Please try again.") });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    clearError: () => set({ error: null }),
}));
