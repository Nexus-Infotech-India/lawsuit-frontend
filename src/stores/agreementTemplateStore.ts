import { create } from 'zustand'
import { agreementTemplatesApi } from '@/services/api'
import { AgreementTemplate } from '@/types'
import { friendlyError } from '@/utils/errors'

interface AgreementTemplateState {
    templates: AgreementTemplate[]
    loading: boolean
    error: string | null

    fetchTemplates: () => Promise<void>
    createTemplate: (data: { title: string; description?: string; content: string; category?: string }) => Promise<AgreementTemplate>
    updateTemplate: (id: string, data: { title?: string; description?: string; content?: string; category?: string }) => Promise<AgreementTemplate>
    deleteTemplate: (id: string) => Promise<void>
}

export const useAgreementTemplateStore = create<AgreementTemplateState>((set, get) => ({
    templates: [],
    loading: false,
    error: null,

    fetchTemplates: async () => {
        set({ loading: true, error: null })
        try {
            const res = await agreementTemplatesApi.getAll()
            const data = res.data?.data ?? res.data ?? []
            set({ templates: Array.isArray(data) ? data : [], loading: false })
        } catch (err: any) {
            const msg = friendlyError(err, "We couldn't load your agreement templates.")
            set({ error: msg, loading: false })
            throw err
        }
    },

    createTemplate: async (data) => {
        set({ loading: true, error: null })
        try {
            const res = await agreementTemplatesApi.create(data)
            const template = res.data?.data ?? res.data
            set((state) => ({ templates: [template, ...state.templates], loading: false }))
            return template
        } catch (err: any) {
            const msg = friendlyError(err, "We couldn't create that template.")
            set({ error: msg, loading: false })
            throw err
        }
    },

    updateTemplate: async (id, data) => {
        set({ loading: true, error: null })
        try {
            const res = await agreementTemplatesApi.update(id, data)
            const updated = res.data?.data ?? res.data
            set((state) => ({
                templates: state.templates.map((t) => (t.id === id ? { ...t, ...updated } : t)),
                loading: false,
            }))
            return updated
        } catch (err: any) {
            const msg = friendlyError(err, "We couldn't save those changes.")
            set({ error: msg, loading: false })
            throw err
        }
    },

    deleteTemplate: async (id) => {
        set({ loading: true, error: null })
        try {
            await agreementTemplatesApi.delete(id)
            set((state) => ({
                templates: state.templates.filter((t) => t.id !== id),
                loading: false,
            }))
        } catch (err: any) {
            const msg = friendlyError(err, "We couldn't delete that template.")
            set({ error: msg, loading: false })
            throw err
        }
    },
}))
