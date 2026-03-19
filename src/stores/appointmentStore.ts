import { create } from 'zustand'
import type { Appointment } from '@/types'
import { appointmentsApi } from '@/services/api'

interface AppointmentStore {
  appointments: Appointment[]
  loading: boolean
  error: string | null
  fetchAppointments: () => Promise<void>
  bookAppointment: (payload: { lawyerId: string; datetime: string; paymentId?: string }) => Promise<void>
  rescheduleAppointment: (id: string, scheduledAt: string, durationMins?: number) => Promise<void>
  cancelAppointment: (id: string) => Promise<void>
}

export const useAppointmentStore = create<AppointmentStore>((set, get) => ({
  appointments: [],
  loading: false,
  error: null,

  fetchAppointments: async () => {
    set({ loading: true, error: null })
    try {
      const response = await appointmentsApi.getAll()
      const data = response.data
      // normalize response shape: API may return { data: [...] } or the array directly
      const list = (data && ((data as any).data ?? data)) || []
      set({ appointments: Array.isArray(list) ? (list as Appointment[]) : [], loading: false })
    } catch (error) {
      set({ error: 'Failed to fetch appointments', loading: false })
    }
  },

  bookAppointment: async (payload) => {
    set({ loading: true, error: null })
    try {
      const response = await appointmentsApi.book({
        lawyerId: payload.lawyerId,
        scheduledAt: payload.datetime,
      })
      const data = response.data
      // API may return { data: appt } or the appt itself
      const appt = (data && ((data as any).data ?? data)) as Appointment
      set((state) => ({
        appointments: [...state.appointments, appt],
        loading: false
      }))
    } catch (error) {
      set({ error: 'Failed to book appointment', loading: false })
    }
  },

  rescheduleAppointment: async (id, scheduledAt, durationMins) => {
    set({ loading: true, error: null })
    try {
      await appointmentsApi.reschedule(id, scheduledAt, durationMins)

      const appointments = get().appointments.map(apt =>
        apt.id === id ? { ...apt, scheduledAt, status: 'CONFIRMED' } : apt
      )
      set({ appointments: appointments as Appointment[], loading: false })
    } catch (error) {
      set({ error: 'Failed to reschedule appointment', loading: false })
    }
  },

  cancelAppointment: async (id) => {
    set({ loading: true, error: null })
    try {
      await appointmentsApi.cancel(id)

      const appointments = get().appointments.map(apt =>
        apt.id === id ? { ...apt, status: 'cancelled' } : apt
      )
      set({ appointments: appointments as Appointment[], loading: false })
    } catch (error) {
      set({ error: 'Failed to cancel appointment', loading: false })
    }
  }
}))