import { createTimelineEventSchema, CreateTimelineEventSchema } from "@/schema/case.schema"
import api, { apiEndpoints } from "@/services/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Plus, X, Calendar, FileText, CheckCircle2, AlertCircle, Clock } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"

interface TimelineEvent {
    type: string;
    title: string;
    description: string | null;
    eventDate: Date;
    createdAt: Date;
}

interface TimeLineEventResponse {
    data: TimelineEvent[]
}

export default function CaseTimelineLawyer({caseId}: {caseId: string}) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const queryClient = useQueryClient()

    const { register, handleSubmit, formState: { errors }, reset } = useForm<CreateTimelineEventSchema>({
        resolver: zodResolver(createTimelineEventSchema),
        defaultValues: {
            type: 'general'
        }
    })

    const createTimelineEventMutation = useMutation({
        mutationFn: async (data: CreateTimelineEventSchema) => {
            const res = await api.post(apiEndpoints.case.addTimeLine(caseId), data)
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['timelineEvents', caseId] })
            setIsModalOpen(false)
            reset()
            alert('Timeline event added successfully');
        },
        onError: (error: any) => {
            alert(`Error adding timeline event: ${error.message}`);
        }
    })

    const { data: timelineResponse, isLoading } = useQuery({
        queryKey: ['timelineEvents', caseId],
        queryFn: async () => {
            const res = await api.get<TimeLineEventResponse>(apiEndpoints.case.getTimeLineEvents(caseId));
            return res.data;
        }
    })

    const timelineEvents = timelineResponse?.data

    const onSubmit = (data: CreateTimelineEventSchema) => {
        console.log('Submitting timeline event:', data);
        createTimelineEventMutation.mutate(data)
    }

    const getEventIcon = (type: string) => {
        switch (type.toLowerCase()) {
            case 'filing':
                return <FileText className="w-5 h-5" />
            case 'hearing':
                return <Calendar className="w-5 h-5" />
            case 'decision':
                return <CheckCircle2 className="w-5 h-5" />
            case 'alert':
                return <AlertCircle className="w-5 h-5" />
            default:
                return <Clock className="w-5 h-5" />
        }
    }

    const getEventColor = (type: string) => {
        switch (type.toLowerCase()) {
            case 'filing':
                return 'bg-blue-500'
            case 'hearing':
                return 'bg-purple-500'
            case 'decision':
                return 'bg-green-500'
            case 'alert':
                return 'bg-red-500'
            default:
                return 'bg-gray-500'
        }
    }

    return (
        <div className="p-6 bg-white rounded-lg shadow-sm">
            {/* Add Event Button at Top */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800">Case Timeline</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Event
                </button>
            </div>

            {/* Timeline */}
            <div className="relative">
                {isLoading ? (
                    <div className="text-center py-8 text-gray-500">Loading timeline...</div>
                ) : !timelineEvents || timelineEvents.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No timeline events yet. Add your first event!</div>
                ) : (
                    <div className="space-y-6">
                        {/* Vertical line */}
                        <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-gray-200" />
                        
                        {timelineEvents.map((event, index) => (
                            <div key={`${event.title}-${index}`} className="relative pl-12">
                                {/* Icon */}
                                <div className={`absolute left-0 ${getEventColor(event.type)} text-white rounded-full p-3 shadow-md z-10`}>
                                    {getEventIcon(event.type)}
                                </div>

                                {/* Content Card */}
                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-gray-800 text-lg">{event.title}</h3>
                                        <span className="text-xs px-2 py-1 bg-white rounded-full text-gray-600 border border-gray-200">
                                            {event.type}
                                        </span>
                                    </div>
                                    
                                    {event.description && (
                                        <p className="text-gray-600 mb-3 text-sm">{event.description}</p>
                                    )}
                                    
                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            <span>{format(new Date(event.eventDate), 'MMM dd, yyyy')}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <span>Added {format(new Date(event.createdAt), 'MMM dd, yyyy')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Event Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <div 
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setIsModalOpen(false)}
                    />
                    
                    {/* Modal */}
                    <div className="relative bg-white w-full max-w-lg m-4 rounded-lg shadow-xl">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-800">Add Timeline Event</h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Title <span className="text-red-500">*</span>
                                </label>
                                <input
                                    {...register('title')}
                                    type="text"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                    placeholder="Enter event title"
                                />
                                {errors.title && (
                                    <p className="mt-1 text-sm text-red-500">{errors.title.message}</p>
                                )}
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Description
                                </label>
                                <textarea
                                    {...register('description')}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                                    placeholder="Enter event description (optional)"
                                />
                                {errors.description && (
                                    <p className="mt-1 text-sm text-red-500">{errors.description.message}</p>
                                )}
                            </div>

                            {/* Event Date */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Event Date <span className="text-red-500">*</span>
                                </label>
                                <input
                                    {...register('eventDate')}
                                    type="date"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                />
                                {errors.eventDate && (
                                    <p className="mt-1 text-sm text-red-500">{errors.eventDate.message}</p>
                                )}
                            </div>

                            {/* Type */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Event Type <span className="text-red-500">*</span>
                                </label>
                                <select
                                    {...register('type')}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                >
                                    <option value="general">General</option>
                                    <option value="filing">Filing</option>
                                    <option value="hearing">Hearing</option>
                                    <option value="decision">Decision</option>
                                    <option value="alert">Alert</option>
                                </select>
                                {errors.type && (
                                    <p className="mt-1 text-sm text-red-500">{errors.type.message}</p>
                                )}
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createTimelineEventMutation.isPending}
                                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {createTimelineEventMutation.isPending ? 'Adding...' : 'Add Event'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}