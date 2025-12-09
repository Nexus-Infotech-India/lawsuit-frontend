import api, { apiEndpoints } from '@/services/api';
import { useQuery } from '@tanstack/react-query';
import { FC } from 'react'
import { 
  FileText, 
  Calendar, 
  Scale, 
  User, 
  Phone, 
  Mail, 
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface CaseInfoProps {
  caseId: string
}

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

const CaseInfo: FC<CaseInfoProps> = ({ caseId }) => {
   const getCaseDetailsQuery = useQuery({
        queryKey: ['caseDetailsClient', caseId],
        queryFn: async () => {
            const res = await api.get<getCaseDetailsResponse>(apiEndpoints.case.getCaseDetails(caseId));
            return res.data;
        },
        enabled: !!caseId,
    });

    const caseData = getCaseDetailsQuery.data?.data?.[0];

    if (getCaseDetailsQuery.isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (getCaseDetailsQuery.isError || !caseData) {
        return (
            <div className="flex items-center justify-center h-64 text-red-600">
                <AlertCircle className="w-6 h-6 mr-2" />
                <span>Failed to load case information</span>
            </div>
        );
    }

    const formatDate = (date: Date | null) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    };

  return (
    <div className="p-6 space-y-6">
      {/* Case Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Case Details</h3>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Case ID</div>
                  <div className="text-sm font-medium text-gray-900">{caseData.id}</div>
                </div>
              </div>

              {caseData.caseNumber && (
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">Case Number</div>
                    <div className="text-sm font-medium text-gray-900">{caseData.caseNumber}</div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Category</div>
                  <div className="text-sm font-medium text-gray-900">{caseData.category}</div>
                </div>
              </div>

              {caseData.courtName && (
                <div className="flex items-start gap-3">
                  <Scale className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">Court Name</div>
                    <div className="text-sm font-medium text-gray-900">{caseData.courtName}</div>
                  </div>
                </div>
              )}

              {caseData.disputeResolutionMethod && (
                <div className="flex items-start gap-3">
                  <Scale className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">Resolution Method</div>
                    <div className="text-sm font-medium text-gray-900">{caseData.disputeResolutionMethod}</div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Status</div>
                  <div className={`
                    inline-block mt-1 px-3 py-1 rounded-full text-xs font-semibold
                    ${caseData.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : ''}
                    ${caseData.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-700' : ''}
                    ${caseData.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' : ''}
                    ${caseData.status === 'PENDING_DOCUMENTS' ? 'bg-orange-100 text-orange-700' : ''}
                    ${caseData.status === 'UNDER_REVIEW' ? 'bg-purple-100 text-purple-700' : ''}
                    ${caseData.status === 'HEARING_SCHEDULED' ? 'bg-indigo-100 text-indigo-700' : ''}
                    ${caseData.status === 'WON' ? 'bg-green-100 text-green-700' : ''}
                    ${caseData.status === 'LOST' ? 'bg-red-100 text-red-700' : ''}
                    ${caseData.status === 'SETTLED' ? 'bg-teal-100 text-teal-700' : ''}
                  `}>
                    {caseData.status.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Accepted by Lawyer</div>
                  <div className="text-sm font-medium text-gray-900">
                    {caseData.isAccepted ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Timeline</h3>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Created</div>
                  <div className="text-sm font-medium text-gray-900">{formatDate(caseData.createdAt)}</div>
                </div>
              </div>

              {caseData.startedAt && (
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">Started</div>
                    <div className="text-sm font-medium text-gray-900">{formatDate(caseData.startedAt)}</div>
                  </div>
                </div>
              )}

              {caseData.closedAt && (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">Closed</div>
                    <div className="text-sm font-medium text-gray-900">{formatDate(caseData.closedAt)}</div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Last Updated</div>
                  <div className="text-sm font-medium text-gray-900">{formatDate(caseData.updatedAt)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Client Information */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Client Information</h3>
            
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {caseData.client.avatarUrl ? (
                  <img 
                    src={caseData.client.avatarUrl} 
                    alt={caseData.client.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-6 h-6 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900 mb-1">{caseData.client.name}</div>
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                  <Mail className="w-3.5 h-3.5" />
                  <span>{caseData.client.email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{caseData.client.phone}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lawyer Information */}
          {caseData.lawyer && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Lawyer Information</h3>
              
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {caseData.lawyer.avatarUrl ? (
                    <img 
                      src={caseData.lawyer.avatarUrl} 
                      alt={caseData.lawyer.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900 mb-1">{caseData.lawyer.name}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{caseData.lawyer.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{caseData.lawyer.phone}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Appointment Information */}
          {caseData.appointment && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Appointment Details</h3>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">Scheduled At</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatDate(caseData.appointment.scheduledAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">Duration</div>
                    <div className="text-sm font-medium text-gray-900">
                      {caseData.appointment.durationMins} minutes
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">Status</div>
                    <div className={`
                      inline-block mt-1 px-3 py-1 rounded-full text-xs font-semibold
                      ${caseData.appointment.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : ''}
                      ${caseData.appointment.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' : ''}
                      ${caseData.appointment.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' : ''}
                      ${caseData.appointment.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : ''}
                      ${caseData.appointment.status === 'RESCHEDULED' ? 'bg-purple-100 text-purple-700' : ''}
                    `}>
                      {caseData.appointment.status}
                    </div>
                  </div>
                </div>

                {caseData.appointment.meetingLink && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <a 
                      href={caseData.appointment.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Join Meeting
                    </a>
                  </div>
                )}

                {caseData.appointment.notes && (
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-xs text-gray-500">Notes</div>
                      <div className="text-sm text-gray-700 mt-1">{caseData.appointment.notes}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CaseInfo
