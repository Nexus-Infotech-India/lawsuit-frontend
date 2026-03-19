import { FC, useState } from 'react'
import { X, RefreshCw, Calendar, Clock, Loader2 } from 'lucide-react'

interface RescheduleModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (scheduledAt: string, durationMins?: number) => Promise<void>
    otherPartyName: string
    currentScheduledAt: string
    currentDurationMins: number
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120]

const RescheduleModal: FC<RescheduleModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    otherPartyName,
    currentScheduledAt,
    currentDurationMins,
}) => {
    const [date, setDate] = useState(() => {
        const d = new Date(currentScheduledAt)
        return d.toISOString().slice(0, 10)
    })
    const [time, setTime] = useState(() => {
        const d = new Date(currentScheduledAt)
        return d.toTimeString().slice(0, 5)
    })
    const [durationMins, setDurationMins] = useState(currentDurationMins || 30)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!isOpen) return null

    const handleSubmit = async () => {
        setError(null)

        const scheduledAt = new Date(`${date}T${time}`)
        if (isNaN(scheduledAt.getTime())) {
            setError('Please enter a valid date and time.')
            return
        }

        if (scheduledAt.getTime() <= Date.now()) {
            setError('Rescheduled time must be in the future.')
            return
        }

        setSubmitting(true)
        try {
            await onConfirm(scheduledAt.toISOString(), durationMins)
            onClose()
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to reschedule appointment.')
        } finally {
            setSubmitting(false)
        }
    }

    // Calculate minimum date (today)
    const minDate = new Date().toISOString().slice(0, 10)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-auto border border-gray-200 animate-in fade-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <RefreshCw className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold text-gray-900">Reschedule Appointment</h3>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">
                    <p className="text-sm text-gray-600">
                        Reschedule your appointment with <span className="font-medium text-gray-900">{otherPartyName}</span>.
                    </p>

                    {/* Date */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                            <Calendar className="w-4 h-4" />
                            Date
                        </label>
                        <input
                            type="date"
                            value={date}
                            min={minDate}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>

                    {/* Time */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                            <Clock className="w-4 h-4" />
                            Time
                        </label>
                        <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>

                    {/* Duration */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Duration (minutes)
                        </label>
                        <select
                            value={durationMins}
                            onChange={(e) => setDurationMins(Number(e.target.value))}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                        >
                            {DURATION_OPTIONS.map((d) => (
                                <option key={d} value={d}>
                                    {d} minutes
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 px-4 py-2.5 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-gray-300 transition-colors duration-200 text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex-1 px-4 py-2.5 bg-primary text-white hover:bg-primary/90 disabled:bg-primary/30 disabled:cursor-not-allowed rounded-lg transition-colors duration-200 text-sm font-medium flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Rescheduling...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="w-4 h-4" />
                                Confirm Reschedule
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default RescheduleModal
