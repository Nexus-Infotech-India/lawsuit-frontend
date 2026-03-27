import { FC, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCourtAdminStore, VerificationRequest } from '../../stores/courtAdminStore';
import { format } from 'date-fns';

const VerifyLawyerPage: FC = () => {
    const { lawyerId } = useParams<{ lawyerId: string }>();
    const navigate = useNavigate();
    const { pendingVerifications, allVerifications, verifyLawyer, isLoading } = useCourtAdminStore();

    const [remarks, setRemarks] = useState('');
    const [request, setRequest] = useState<VerificationRequest | null>(null);

    useEffect(() => {
        // Try to find the request in pending, then all
        if (lawyerId) {
            const found = pendingVerifications.find(v => v.lawyerId === lawyerId)
                || allVerifications.find(v => v.lawyerId === lawyerId);
            setRequest(found || null);
        }
    }, [lawyerId, pendingVerifications, allVerifications]);

    if (!request) {
        return (
            <div className="max-w-3xl mx-auto py-12 text-center">
                <h2 className="text-xl font-medium text-gray-900">Verification Request Not Found</h2>
                <p className="mt-2 text-gray-500">The requested lawyer verification could not be found.</p>
                <button
                    onClick={() => navigate('/court-admin/dashboard')}
                    className="mt-6 text-indigo-600 hover:text-indigo-800"
                >
                    &larr; Back to Dashboard
                </button>
            </div>
        );
    }

    const handleAction = async (status: 'APPROVED' | 'REJECTED') => {
        if (!lawyerId) return;
        try {
            await verifyLawyer(lawyerId, status, remarks);
            navigate('/court-admin/dashboard');
        } catch (error) {
            console.error('Failed to verify lawyer:', error);
            alert('Action failed. Please try again.');
        }
    };

    const isPending = request.status === 'PENDING';

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/court-admin/dashboard')}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <h1 className="text-2xl font-bold text-gray-900">Lawyer Details</h1>
                {!isPending && (
                    <span className={`ml-auto px-3 py-1 text-sm font-semibold rounded-full ${request.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                        {request.status}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white shadow-sm border border-gray-100 rounded-xl p-6">
                        <h2 className="text-lg font-medium text-gray-900 mb-4 border-b border-gray-100 pb-2">Professional Information</h2>
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                            <div className="sm:col-span-1">
                                <dt className="text-sm font-medium text-gray-500">Full Name</dt>
                                <dd className="mt-1 text-sm text-gray-900 font-semibold">{request.lawyer.name}</dd>
                            </div>
                            <div className="sm:col-span-1">
                                <dt className="text-sm font-medium text-gray-500">Email Address</dt>
                                <dd className="mt-1 text-sm text-gray-900">{request.lawyer.email}</dd>
                            </div>
                            <div className="sm:col-span-1">
                                <dt className="text-sm font-medium text-gray-500">Phone Number</dt>
                                <dd className="mt-1 text-sm text-gray-900">{request.lawyer.phone}</dd>
                            </div>
                            <div className="sm:col-span-1">
                                <dt className="text-sm font-medium text-gray-500">Bar Council ID</dt>
                                <dd className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded inline-block">{request.lawyer.barCouncilId}</dd>
                            </div>
                            <div className="sm:col-span-2">
                                <dt className="text-sm font-medium text-gray-500">License Number</dt>
                                <dd className="mt-1 text-sm text-gray-900">{request.lawyer.licenseNumber || 'Not provided'}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="bg-white shadow-sm border border-gray-100 rounded-xl p-6">
                        <h2 className="text-lg font-medium text-gray-900 mb-4 border-b border-gray-100 pb-2">Submitted Documents</h2>
                        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No documents found</h3>
                            <p className="mt-1 text-sm text-gray-500">The lawyer hasn't uploaded any verification documents yet.</p>
                        </div>
                        {/* Note: Document fetching logic would go here when implemented on backend */}
                    </div>
                </div>

                <div className="md:col-span-1">
                    <div className="bg-white shadow-sm border border-gray-100 rounded-xl p-6 sticky top-6">
                        <h2 className="text-lg font-medium text-gray-900 mb-4">Request Details</h2>

                        <div className="space-y-4 mb-6 text-sm">
                            <div>
                                <span className="text-gray-500 block mb-1">Submitted On</span>
                                <span className="font-medium text-gray-900">{format(new Date(request.createdAt), 'PPP p')}</span>
                            </div>
                            {!isPending && request.verifiedAt && (
                                <div>
                                    <span className="text-gray-500 block mb-1">Processed On</span>
                                    <span className="font-medium text-gray-900">{format(new Date(request.verifiedAt), 'PPP p')}</span>
                                </div>
                            )}
                        </div>

                        {isPending ? (
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="remarks" className="block text-sm font-medium text-gray-700 mb-1">
                                        Remarks (optional)
                                    </label>
                                    <textarea
                                        id="remarks"
                                        rows={3}
                                        className="shadow-sm block w-full focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border border-gray-300 rounded-md p-2"
                                        placeholder="Enter notes about this decision..."
                                        value={remarks}
                                        onChange={(e) => setRemarks(e.target.value)}
                                    />
                                </div>

                                <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
                                    <button
                                        onClick={() => handleAction('APPROVED')}
                                        disabled={isLoading}
                                        className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Processing...' : 'Approve Request'}
                                    </button>
                                    <button
                                        onClick={() => handleAction('REJECTED')}
                                        disabled={isLoading}
                                        className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Processing...' : 'Reject Request'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                <h3 className="text-sm font-medium text-gray-700 mb-2">Decision Remarks</h3>
                                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                                    {request.remarks || <span className="italic text-gray-400">No remarks provided.</span>}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VerifyLawyerPage;
