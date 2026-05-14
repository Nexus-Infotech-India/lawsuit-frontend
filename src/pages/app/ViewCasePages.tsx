import { FC, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { apiEndpoints } from "@/services/api"
import { useQuery } from "@tanstack/react-query"
import {
    Scale,
    Handshake,
    Gavel,
    User,
    Calendar,
    Briefcase,
    FileText,
    Clock,
    Building2,
    MessageSquare,
    CheckCircle2,
    XCircle,
    AlertCircle
} from 'lucide-react'

interface getAllCasesResponse {
    data: {
        title: string;
        description: string;
        category: string;
        id: string;
        status: "OPEN" | "IN_PROGRESS" | "CLOSED" | "PENDING_DOCUMENTS" | "UNDER_REVIEW" | "HEARING_SCHEDULED" | "WON" | "LOST" | "SETTLED";
        caseNumber: string | null;
        courtName: string | null;
        isAccepted: boolean;
        startedAt: Date | null;
        closedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        disputeResolutionMethod: "TRIAL" | "MEDIATION" | "ARBITRATION" | null;
        client: {
            id: string;
            name: string;
            email: string;
            phone: string;
            avatarUrl: string | null;
        };
        lawyer: {
            id: string;
            name: string;
            email: string;
            phone: string;
            avatarUrl: string | null;
        } | null;
        appointment: {
            id: string;
            status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
            notes: string | null;
            scheduledAt: Date;
            durationMins: number;
            meetingLink: string | null;
        } | null;
    }[]

}

type TabType = 'all' | 'trial' | 'mediation' | 'arbitration'

const ViewCasePages: FC = () => {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<TabType>('all')

    const getAllCasesQuery = useQuery({
        queryKey: ['getAllCases'],
        queryFn: async () => {
            const res = await api.get<getAllCasesResponse>(apiEndpoints.case.getAllCases);
            return res.data;
        }
    })

    const cases = getAllCasesQuery.data?.data || []

    const categorizedCases = useMemo(() => {
        return {
            all: cases,
            trial: cases.filter(c => c.disputeResolutionMethod === 'TRIAL'),
            mediation: cases.filter(c => c.disputeResolutionMethod === 'MEDIATION'),
            arbitration: cases.filter(c => c.disputeResolutionMethod === 'ARBITRATION')
        }
    }, [cases])

    const formatDate = (dateString: Date | null) => {
        if (!dateString) return 'Not set'
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'OPEN':
                return 'text-blue-600'
            case 'IN_PROGRESS':
                return 'text-yellow-600'
            case 'CLOSED':
                return 'text-gray-600'
            case 'PENDING_DOCUMENTS':
                return 'text-orange-600'
            case 'UNDER_REVIEW':
                return 'text-purple-600'
            case 'HEARING_SCHEDULED':
                return 'text-indigo-600'
            case 'WON':
                return 'text-green-600'
            case 'LOST':
                return 'text-red-600'
            case 'SETTLED':
                return 'text-teal-600'
            default:
                return 'text-gray-600'
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'WON':
            case 'SETTLED':
                return <CheckCircle2 className="w-4 h-4" />
            case 'LOST':
            case 'CLOSED':
                return <XCircle className="w-4 h-4" />
            case 'PENDING_DOCUMENTS':
            case 'UNDER_REVIEW':
                return <AlertCircle className="w-4 h-4" />
            default:
                return <Clock className="w-4 h-4" />
        }
    }

    const getResolutionMethodIcon = (method: string | null) => {
        switch (method) {
            case 'TRIAL':
                return <Gavel className="w-4 h-4" />
            case 'MEDIATION':
                return <Handshake className="w-4 h-4" />
            case 'ARBITRATION':
                return <Scale className="w-4 h-4" />
            default:
                return <FileText className="w-4 h-4" />
        }
    }

    const handleViewDetails = (caseId: string) => {
        navigate(`/app/case/${caseId}`)
    }

    // Open the unified WhatsApp-style chat page. We pass `with=<lawyerId>`
    // so the page can lazily materialize the chat for this case; if the
    // case has no lawyer assigned yet we fall back to the chat list.
    const handleDiscuss = (caseItem: getAllCasesResponse['data'][0]) => {
        if (caseItem.lawyer?.id) {
            navigate(`/app/chats?with=${caseItem.lawyer.id}&caseId=${caseItem.id}`)
        } else {
            navigate('/app/chats')
        }
    }

    const renderCaseCard = (caseItem: getAllCasesResponse['data'][0]) => {
        return (
            <div
                key={caseItem.id}
                className="border border-gray-200 bg-white p-4 sm:p-6 mb-4 rounded-lg sm:rounded-none hover:border-primary transition-colors"
            >
                {/* Title + Status */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base sm:text-lg font-semibold text-primary mb-1 break-words">
                            {caseItem.title}
                        </h3>
                        {caseItem.caseNumber && (
                            <p className="text-sm text-secondary">
                                Case No: {caseItem.caseNumber}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`flex items-center gap-1.5 text-sm font-medium ${getStatusColor(caseItem.status)}`}>
                            {getStatusIcon(caseItem.status)}
                            {caseItem.status.replace(/_/g, ' ')}
                        </span>
                    </div>
                </div>

                <p className="text-sm text-secondary mb-4 line-clamp-2">
                    {caseItem.description}
                </p>

                {/* Case metadata grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-4">
                    <div className="flex items-center gap-2 text-sm text-secondary">
                        <Briefcase className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium">Category:</span>
                        <span className="truncate">{caseItem.category}</span>
                    </div>

                    {caseItem.disputeResolutionMethod && (
                        <div className="flex items-center gap-2 text-sm text-secondary">
                            {getResolutionMethodIcon(caseItem.disputeResolutionMethod)}
                            <span className="font-medium">Method:</span>
                            <span>{caseItem.disputeResolutionMethod}</span>
                        </div>
                    )}

                    {caseItem.courtName && (
                        <div className="flex items-center gap-2 text-sm text-secondary">
                            <Building2 className="w-4 h-4 flex-shrink-0" />
                            <span className="font-medium">Court:</span>
                            <span className="truncate">{caseItem.courtName}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-2 text-sm text-secondary">
                        <Calendar className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium">Created:</span>
                        <span>{formatDate(caseItem.createdAt)}</span>
                    </div>

                    {caseItem.startedAt && (
                        <div className="flex items-center gap-2 text-sm text-secondary">
                            <Clock className="w-4 h-4 flex-shrink-0" />
                            <span className="font-medium">Started:</span>
                            <span>{formatDate(caseItem.startedAt)}</span>
                        </div>
                    )}

                    {caseItem.closedAt && (
                        <div className="flex items-center gap-2 text-sm text-secondary">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            <span className="font-medium">Closed:</span>
                            <span>{formatDate(caseItem.closedAt)}</span>
                        </div>
                    )}
                </div>

                {/* Client and Lawyer Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            {caseItem.client.avatarUrl ? (
                                <img
                                    src={caseItem.client.avatarUrl}
                                    alt={caseItem.client.name}
                                    className="w-10 h-10 rounded-full object-cover"
                                />
                            ) : (
                                <User className="w-5 h-5 text-gray-400" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-secondary">Client</p>
                            <p className="text-sm font-medium text-primary truncate">{caseItem.client.name}</p>
                            <p className="text-xs text-secondary truncate">{caseItem.client.email}</p>
                        </div>
                    </div>

                    {caseItem.lawyer && (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                {caseItem.lawyer.avatarUrl ? (
                                    <img
                                        src={caseItem.lawyer.avatarUrl}
                                        alt={caseItem.lawyer.name}
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                ) : (
                                    <User className="w-5 h-5 text-gray-400" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs text-secondary">Lawyer</p>
                                <p className="text-sm font-medium text-primary truncate">{caseItem.lawyer.name}</p>
                                <p className="text-xs text-secondary truncate">{caseItem.lawyer.email}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 sm:gap-3 pt-4 border-t border-gray-100 mt-4">
                    <button
                        onClick={() => handleViewDetails(caseItem.id)}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary/90 rounded-md transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        View Details
                    </button>
                    <button
                        onClick={() => handleDiscuss(caseItem)}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white rounded-md transition-colors"
                    >
                        <MessageSquare className="w-4 h-4" />
                        Discuss
                    </button>
                </div>
            </div>
        )
    }

    const tabs: { key: TabType; label: string; icon: JSX.Element; count: number }[] = [
        { key: 'all', label: 'All Cases', icon: <FileText className="w-4 h-4" />, count: categorizedCases.all.length },
        { key: 'trial', label: 'Trial', icon: <Gavel className="w-4 h-4" />, count: categorizedCases.trial.length },
        { key: 'mediation', label: 'Mediation', icon: <Handshake className="w-4 h-4" />, count: categorizedCases.mediation.length },
        { key: 'arbitration', label: 'Arbitration', icon: <Scale className="w-4 h-4" />, count: categorizedCases.arbitration.length }
    ]

    return (
        <div className="min-h-screen bg-gray-50 px-3 py-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6 sm:mb-8">
                    <h1 className="text-2xl sm:text-3xl font-semibold text-primary mb-1 sm:mb-2">Cases</h1>
                    <p className="text-sm sm:text-base text-secondary">View and manage all your legal cases</p>
                </div>

                {/* Tabs — horizontal scroll on mobile */}
                <div className="bg-white border-b border-gray-200 mb-4 sm:mb-6 -mx-3 sm:mx-0 overflow-x-auto">
                    <div className="flex min-w-max sm:min-w-0">
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === tab.key
                                        ? 'text-primary'
                                        : 'text-secondary hover:text-primary'
                                    }`}
                            >
                                <span className="flex items-center gap-1.5 sm:gap-2">
                                    {tab.icon}
                                    <span className="hidden sm:inline">{tab.label}</span>
                                    <span className="sm:hidden">{tab.label.replace('All Cases', 'All')}</span>
                                    <span className={`px-1.5 sm:px-2 py-0.5 text-xs rounded-full ${activeTab === tab.key
                                            ? 'bg-primary text-white'
                                            : 'bg-gray-100 text-gray-600'
                                        }`}>
                                        {tab.count}
                                    </span>
                                </span>
                                {activeTab === tab.key && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="bg-gray-50">
                    {getAllCasesQuery.isLoading ? (
                        <div className="text-center py-12">
                            <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="mt-4 text-secondary">Loading cases...</p>
                        </div>
                    ) : getAllCasesQuery.isError ? (
                        <div className="text-center py-12">
                            <p className="text-red-600">Failed to load cases</p>
                        </div>
                    ) : categorizedCases[activeTab].length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-secondary">No cases found in this category</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {categorizedCases[activeTab].map(caseItem =>
                                renderCaseCard(caseItem)
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default ViewCasePages