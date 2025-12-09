import { addHearingSchema, AddHearingSchema } from "@/schema/case.schema"
import api, { apiEndpoints } from "@/services/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { 
    Plus, 
    X, 
    Calendar, 
    Scale, 
    User, 
    FileText, 
    Clock, 
    Gavel,
    MapPin,
    Loader2,
    CheckCircle2,
    AlertCircle
} from "lucide-react"

interface Hearing {
    id: string;
    date: Date;
    court: string | null;
    judge: string | null;
    purpose: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    caseId: string;
    outcome: string | null;
}

interface GetHearingResponse {
    data: Hearing[]
}

type HearingFormData = AddHearingSchema['body']

export default function CaseHearingsLawyer({caseId}: {caseId: string}) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const queryClient = useQueryClient()

    const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<HearingFormData>({
        resolver: zodResolver(addHearingSchema.shape.body),
        defaultValues: {
            date: '',
            court: '',
            judge: '',
            purpose: '',
            notes: ''
        }
    })

    const createHearingMutation = useMutation({
        mutationFn: async (data: HearingFormData) => {
            const res = await api.post(apiEndpoints.case.addHearing(caseId), data)
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['case-hearings', caseId] })
            setIsModalOpen(false)
            reset()
        },
        onError: (error: any) => {
            alert('Error creating hearing: ' + error.message)
        }
    })

    const getHearingQuery = useQuery({
        queryKey: ['case-hearings', caseId],
        queryFn: async () => {
            const res = await api.get<GetHearingResponse>(apiEndpoints.case.getHearings(caseId))
            return res.data
        }
    })

    const hearings = getHearingQuery.data?.data || []

    const onSubmit = (data: HearingFormData) => {
        createHearingMutation.mutate(data)
    }

    const getOutcomeStyle = (outcome: string | null) => {
        if (!outcome) return { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Pending' }
        switch (outcome.toLowerCase()) {
            case 'favorable':
            case 'won':
                return { bg: 'bg-green-50', text: 'text-green-700', label: outcome }
            case 'unfavorable':
            case 'lost':
                return { bg: 'bg-red-50', text: 'text-red-700', label: outcome }
            case 'adjourned':
            case 'postponed':
                return { bg: 'bg-amber-50', text: 'text-amber-700', label: outcome }
            default:
                return { bg: 'bg-blue-50', text: 'text-blue-700', label: outcome }
        }
    }

    const isUpcoming = (date: Date) => new Date(date) > new Date()

    return (
        <div className="p-6 bg-white rounded-lg shadow-sm">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Scale className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-midnight">Case Hearings</h2>
                        <p className="text-xs text-gray-500">{hearings.length} hearing{hearings.length !== 1 ? 's' : ''} scheduled</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                    <Plus className="w-4 h-4" />
                    Add Hearing
                </button>
            </div>

            {/* Hearings List */}
            <div className="space-y-4">
                {getHearingQuery.isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                        <p className="text-xs">Loading hearings...</p>
                    </div>
                ) : hearings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
                        <div className="p-3 bg-gray-100 rounded-full mb-3">
                            <Gavel className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="text-xs font-medium text-gray-600 mb-1">No hearings scheduled</p>
                        <p className="text-xs text-gray-400 mb-4">Add your first hearing to track court dates</p>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="text-xs text-primary font-medium hover:underline"
                        >
                            + Add first hearing
                        </button>
                    </div>
                ) : (
                    hearings.map((hearing) => {
                        const outcomeStyle = getOutcomeStyle(hearing.outcome)
                        const upcoming = isUpcoming(hearing.date)
                        
                        return (
                            <div 
                                key={hearing.id} 
                                className={`relative border rounded-lg p-4 transition-all duration-200 hover:shadow-md ${
                                    upcoming ? 'border-primary/30 bg-primary/5' : 'border-gray-200 bg-white'
                                }`}
                            >
                                {/* Upcoming Badge */}
                                {upcoming && (
                                    <div className="absolute -top-2 right-4">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary text-white text-xs font-medium rounded-full">
                                            <Clock className="w-3 h-3" />
                                            Upcoming
                                        </span>
                                    </div>
                                )}

                                {/* Main Content */}
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    {/* Left Section - Date */}
                                    <div className="flex items-start gap-4">
                                        <div className={`flex flex-col items-center p-3 rounded-lg ${upcoming ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}>
                                            <span className="text-xs font-medium uppercase">
                                                {format(new Date(hearing.date), 'MMM')}
                                            </span>
                                            <span className="text-sm font-bold">
                                                {format(new Date(hearing.date), 'dd')}
                                            </span>
                                            <span className="text-xs">
                                                {format(new Date(hearing.date), 'yyyy')}
                                            </span>
                                        </div>

                                        {/* Details */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h3 className="text-sm font-semibold text-midnight truncate">
                                                    {hearing.purpose || 'Court Hearing'}
                                                </h3>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {hearing.court && (
                                                    <div className="flex items-center gap-2 text-xs text-gray-600">
                                                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                                        <span className="truncate">{hearing.court}</span>
                                                    </div>
                                                )}
                                                {hearing.judge && (
                                                    <div className="flex items-center gap-2 text-xs text-gray-600">
                                                        <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                                        <span className="truncate">Hon. {hearing.judge}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                                    <span>{format(new Date(hearing.date), 'hh:mm a')}</span>
                                                </div>
                                            </div>

                                            {hearing.notes && (
                                                <div className="mt-3 p-2 bg-gray-50 rounded border-l-2 border-gray-300">
                                                    <div className="flex items-start gap-2">
                                                        <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                                                        <p className="text-xs text-gray-600 line-clamp-2">{hearing.notes}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Section - Outcome */}
                                    <div className="flex sm:flex-col items-center sm:items-end gap-2">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${outcomeStyle.bg} ${outcomeStyle.text}`}>
                                            {hearing.outcome ? (
                                                hearing.outcome.toLowerCase() === 'favorable' || hearing.outcome.toLowerCase() === 'won' ? (
                                                    <CheckCircle2 className="w-3 h-3" />
                                                ) : hearing.outcome.toLowerCase() === 'unfavorable' || hearing.outcome.toLowerCase() === 'lost' ? (
                                                    <AlertCircle className="w-3 h-3" />
                                                ) : (
                                                    <Clock className="w-3 h-3" />
                                                )
                                            ) : (
                                                <Clock className="w-3 h-3" />
                                            )}
                                            {outcomeStyle.label}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Add Hearing Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div 
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsModalOpen(false)}
                    />
                    
                    {/* Modal */}
                    <div className="relative bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-primary/5 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <Gavel className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-semibold text-midnight">Schedule Hearing</h2>
                                    <p className="text-xs text-gray-500">Add a new court hearing date</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
                            {/* Date & Time */}
                            <div>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                    Hearing Date & Time <span className="text-red-500">*</span>
                                </label>
                                <input
                                    {...register('date')}
                                    type="datetime-local"
                                    className="w-full px-3 py-2.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                />
                                {errors.date && (
                                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        {errors.date.message}
                                    </p>
                                )}
                            </div>

                            {/* Court */}
                            <div>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                    Court Name
                                </label>
                                <input
                                    {...register('court')}
                                    type="text"
                                    placeholder="e.g., Delhi High Court"
                                    className="w-full px-3 py-2.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-gray-400"
                                />
                            </div>

                            {/* Judge */}
                            <div>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1.5">
                                    <User className="w-3.5 h-3.5 text-gray-400" />
                                    Presiding Judge
                                </label>
                                <input
                                    {...register('judge')}
                                    type="text"
                                    placeholder="e.g., Justice R. Sharma"
                                    className="w-full px-3 py-2.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-gray-400"
                                />
                            </div>

                            {/* Purpose */}
                            <div>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1.5">
                                    <Scale className="w-3.5 h-3.5 text-gray-400" />
                                    Purpose of Hearing
                                </label>
                                <input
                                    {...register('purpose')}
                                    type="text"
                                    placeholder="e.g., Final arguments, Evidence submission"
                                    className="w-full px-3 py-2.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-gray-400"
                                />
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1.5">
                                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                                    Additional Notes
                                </label>
                                <textarea
                                    {...register('notes')}
                                    rows={3}
                                    placeholder="Any additional details or reminders..."
                                    className="w-full px-3 py-2.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none placeholder:text-gray-400"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createHearingMutation.isPending || isSubmitting}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {createHearingMutation.isPending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4" />
                                            Add Hearing
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}