import api, { apiEndpoints } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { 
    FileText, 
    Clock, 
    Scale, 
    MessageSquare, 
    FolderOpen, 
    CheckSquare,
    User,
    Mail,
    Phone,
    Loader2
} from "lucide-react";
import CaseInfo from "@/components/atoms/CaseInfo";
import CaseTimeline from "@/components/atoms/CaseTimeline";
import CaseHearings from "@/components/atoms/CaseHearings";
import ChatTab from "@/components/atoms/ChatTab";
import DocumentsTab from "@/components/atoms/DocumentsTab";
import TasksTab from "@/components/atoms/TasksTab";

interface getCaseDetailsResponse {
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
};

type MenuItem = 'case-info' | 'timeline' | 'hearings' | 'chat' | 'documents' | 'tasks';

export default function CaseDetailsClientPage() {
    const [activeMenu, setActiveMenu] = useState<MenuItem>('case-info');
    const { caseId } = useParams<{ caseId: string }>();
    
    if (!caseId) return <div>case id not found</div>;

    const getCaseDetailsQuery = useQuery({
        queryKey: ['caseDetailsClient', caseId],
        queryFn: async () => {
            const res = await api.get<getCaseDetailsResponse>(apiEndpoints.case.getCaseDetails(caseId));
            return res.data;
        },
        enabled: !!caseId,
    });

    const caseData = getCaseDetailsQuery.data?.data?.[0];
    const lawyer = caseData?.lawyer;

    const menuItems = [
        { id: 'case-info' as MenuItem, label: 'Case Info', icon: FileText },
        { id: 'timeline' as MenuItem, label: 'Timeline', icon: Clock },
        { id: 'hearings' as MenuItem, label: 'Hearings', icon: Scale },
        { id: 'chat' as MenuItem, label: 'Chat', icon: MessageSquare },
        { id: 'documents' as MenuItem, label: 'Documents', icon: FolderOpen },
        { id: 'tasks' as MenuItem, label: 'Tasks', icon: CheckSquare },
    ];

    if (getCaseDetailsQuery.isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-gray-600">Loading case details...</p>
                </div>
            </div>
        );
    }

    if (getCaseDetailsQuery.isError || !caseData) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <p className="text-red-600 font-medium">Failed to load case details</p>
                    <p className="text-gray-500 text-sm mt-2">Please try again later</p>
                </div>
            </div>
        );
    }

    const renderContent = () => {
        switch (activeMenu) {
            case 'case-info':
                return <CaseInfo caseId={caseData.id} />;
            case 'timeline':
                return <CaseTimeline caseId={caseData.id} />;
            case 'hearings':
                return <CaseHearings caseId={caseData.id} />;
            case 'chat':
                return <ChatTab caseId={caseData.id} />;
            case 'documents':
                return <DocumentsTab caseId={caseData.id} />;
            case 'tasks':
                return <TasksTab caseId={caseData.id} />;
            default:
                return <CaseInfo caseId={caseData.id} />;
        }
    };

    return (
        <div className="flex h-[calc(100vh-130px)] bg-gray-50">
            {/* Sidebar */}
            <aside className="w-80 bg-white border-r border-gray-200 flex flex-col">
                {/* Lawyer Info Section */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-br from-primary to-midnight">
                    <div className="flex flex-col items-center text-center">
                        {/* Avatar */}
                        <div className="w-20 h-20  bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4 overflow-hidden border-2 border-white/30">
                            {lawyer?.avatarUrl ? (
                                <img 
                                    src={lawyer.avatarUrl} 
                                    alt={lawyer.name} 
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <User className="w-10 h-10 text-white" />
                            )}
                        </div>
                        
                        {/* Lawyer Details */}
                        <div className="text-white">
                            <h2 className="text-xl font-semibold mb-1">
                                {lawyer?.name || 'Lawyer Not Assigned'}
                            </h2>
                            {lawyer && (
                                <>
                                    <div className="flex items-center justify-center gap-2 text-sm text-white/90 mb-1">
                                        <Mail className="w-3.5 h-3.5" />
                                        <span>{lawyer.email}</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-2 text-sm text-white/90">
                                        <Phone className="w-3.5 h-3.5" />
                                        <span>{lawyer.phone}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Navigation Menu */}
                <nav className="flex-1 overflow-y-auto py-4">
                    <ul className="space-y-1 px-3">
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeMenu === item.id;
                            
                            return (
                                <li key={item.id}>
                                    <button
                                        onClick={() => setActiveMenu(item.id)}
                                        className={`
                                            w-full flex items-center gap-3 px-4 py-3 rounded-lg
                                            transition-all duration-200 text-left
                                            ${isActive 
                                                ? 'bg-primary text-white' 
                                                : 'text-gray-700 hover:bg-gray-100'
                                            }
                                        `}
                                    >
                                        <Icon className="w-5 h-5 flex-shrink-0" />
                                        <span className="font-medium">{item.label}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Case Status Footer */}
                <div className="p-4 border-t ">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 font-medium">Status:</span>
                        <span className={`
                            px-3 py-1 rounded-full text-xs font-semibold
                            ${caseData.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : ''}
                            ${caseData.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-700' : ''}
                            ${caseData.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' : ''}
                            ${caseData.status === 'WON' ? 'bg-green-100 text-green-700' : ''}
                            ${caseData.status === 'LOST' ? 'bg-red-100 text-red-700' : ''}
                            ${caseData.status === 'SETTLED' ? 'bg-purple-100 text-purple-700' : ''}
                        `}>
                            {caseData.status.replace('_', ' ')}
                        </span>
                    </div>
                    {caseData.caseNumber && (
                        <div className="mt-2 text-xs text-gray-500">
                            Case #: {caseData.caseNumber}
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden flex flex-col">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 px-8 py-5">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-1">
                                {caseData.title}
                            </h1>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                                <span className="flex items-center gap-1.5">
                                    <FileText className="w-4 h-4" />
                                    {caseData.category}
                                </span>
                                {caseData.courtName && (
                                    <span className="flex items-center gap-1.5">
                                        <Scale className="w-4 h-4" />
                                        {caseData.courtName}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        {caseData.disputeResolutionMethod && (
                            <div className="bg-accent/10 text-accent px-4 py-2 rounded-lg">
                                <div className="text-xs font-medium">Resolution Method</div>
                                <div className="text-sm font-semibold">{caseData.disputeResolutionMethod}</div>
                            </div>
                        )}
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-gray-50">
                    <div className="h-full">
                        {renderContent()}
                    </div>
                </div>
            </main>
        </div>
    )
}