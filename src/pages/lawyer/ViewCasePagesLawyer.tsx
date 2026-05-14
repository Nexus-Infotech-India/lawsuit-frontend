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

const ViewCasePagesLawyer: FC = () => {
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
        navigate(`/lawyer/case/${caseId}`)
    }

    // Open the unified WhatsApp-style chat page pre-opened on the client for
    // this case. Falls back to the chat list if there's no client (shouldn't
    // happen — a case must have a client — but guards against partial data).
    const handleDiscuss = (caseItem: getAllCasesResponse['data'][0]) => {
        if (caseItem.client?.id) {
            navigate(`/lawyer/chats?with=${caseItem.client.id}&caseId=${caseItem.id}`)
        } else {
            navigate('/lawyer/chats')
        }
    }

    const renderCaseCard = (caseItem: getAllCasesResponse['data'][0]) => {
        return (
            <div 
                key={caseItem.id}
                className="border border-gray-200 bg-white p-6 mb-4 hover:border-primary transition-colors"
            >
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-primary mb-1">
                                    {caseItem.title}
                                </h3>
                                {caseItem.caseNumber && (
                                    <p className="text-sm text-secondary mb-2">
                                        Case No: {caseItem.caseNumber}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                                <span className={`flex items-center gap-1.5 text-sm font-medium ${getStatusColor(caseItem.status)}`}>
                                    {getStatusIcon(caseItem.status)}
                                    {caseItem.status.replace(/_/g, ' ')}
                                </span>
                            </div>
                        </div>

                        <p className="text-sm text-secondary mb-4 line-clamp-2">
                            {caseItem.description}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                            <div className="flex items-center gap-2 text-sm text-secondary">
                                <Briefcase className="w-4 h-4" />
                                <span className="font-medium">Category:</span>
                                <span>{caseItem.category}</span>
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
                                    <Building2 className="w-4 h-4" />
                                    <span className="font-medium">Court:</span>
                                    <span className="truncate">{caseItem.courtName}</span>
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-sm text-secondary">
                                <Calendar className="w-4 h-4" />
                                <span className="font-medium">Created:</span>
                                <span>{formatDate(caseItem.createdAt)}</span>
                            </div>

                            {caseItem.startedAt && (
                                <div className="flex items-center gap-2 text-sm text-secondary">
                                    <Clock className="w-4 h-4" />
                                    <span className="font-medium">Started:</span>
                                    <span>{formatDate(caseItem.startedAt)}</span>
                                </div>
                            )}

                            {caseItem.closedAt && (
                                <div className="flex items-center gap-2 text-sm text-secondary">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span className="font-medium">Closed:</span>
                                    <span>{formatDate(caseItem.closedAt)}</span>
                                </div>
                            )}
                        </div>

                        {/* Client and Lawyer Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
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
                                <div>
                                    <p className="text-xs text-secondary">Client</p>
                                    <p className="text-sm font-medium text-primary">{caseItem.client.name}</p>
                                    <p className="text-xs text-secondary">{caseItem.client.email}</p>
                                </div>
                            </div>

                            {caseItem.lawyer && (
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
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
                                    <div>
                                        <p className="text-xs text-secondary">Lawyer</p>
                                        <p className="text-sm font-medium text-primary">{caseItem.lawyer.name}</p>
                                        <p className="text-xs text-secondary">{caseItem.lawyer.email}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <button
                        onClick={() => handleViewDetails(caseItem.id)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        View Details
                    </button>
                    <button
                        onClick={() => handleDiscuss(caseItem)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
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
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-semibold text-primary mb-2">Cases</h1>
                    <p className="text-secondary">View and manage all your legal cases</p>
                </div>

                {/* Tabs */}
                <div className="bg-white border-b border-gray-200 mb-6">
                    <div className="flex gap-0">
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                                    activeTab === tab.key
                                        ? 'text-primary'
                                        : 'text-secondary hover:text-primary'
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    {tab.icon}
                                    {tab.label}
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                                        activeTab === tab.key
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
                        <div>
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

export default ViewCasePagesLawyer