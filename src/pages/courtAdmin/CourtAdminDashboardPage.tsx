import { FC, useEffect, useState } from 'react';
import { useCourtAdminStore, VerificationRequest } from '../../stores/courtAdminStore';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const CourtAdminDashboardPage: FC = () => {
    const { pendingVerifications, allVerifications, fetchPendingVerifications, fetchAllVerifications, isLoading } = useCourtAdminStore();
    const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
    const navigate = useNavigate();

    useEffect(() => {
        fetchPendingVerifications();
        fetchAllVerifications();
    }, [fetchPendingVerifications, fetchAllVerifications]);

    const historyVerifications = allVerifications.filter(v => v.status !== 'PENDING');

    const displayedList = activeTab === 'PENDING' ? pendingVerifications : historyVerifications;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Lawyer Verifications</h1>

                {/* Stats */}
                <div className="flex bg-white rounded-lg shadow-sm border border-gray-100 p-2 gap-4">
                    <div className="px-4 py-2 text-center border-r border-gray-100">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Pending</p>
                        <p className="text-2xl font-bold text-indigo-600">{pendingVerifications.length}</p>
                    </div>
                    <div className="px-4 py-2 text-center border-r border-gray-100">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Processed</p>
                        <p className="text-2xl font-bold text-green-600">
                            {historyVerifications.filter(v => v.status === 'APPROVED').length}
                        </p>
                    </div>
                    <div className="px-4 py-2 text-center">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total</p>
                        <p className="text-2xl font-bold text-gray-700">{allVerifications.length}</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('PENDING')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'PENDING'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        Action Required
                        <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs ${activeTab === 'PENDING' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'}`}>
                            {pendingVerifications.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('HISTORY')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'HISTORY'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        Verification History
                    </button>
                </nav>
            </div>

            {/* List */}
            <div className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden">
                {isLoading && displayedList.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">Loading verifications...</div>
                ) : displayedList.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center">
                        <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <h3 className="text-lg font-medium text-gray-900">No requests found</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {activeTab === 'PENDING' ? 'You have no pending lawyer verifications to review.' : 'No verification history available.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lawyer</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bar Council ID</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Submitted</th>
                                    {activeTab === 'HISTORY' && (
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    )}
                                    <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {displayedList.map((req: VerificationRequest) => (
                                    <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="flex-shrink-0 h-10 w-10">
                                                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                                        {req.lawyer?.name ? req.lawyer.name.charAt(0) : 'L'}
                                                    </div>
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900">{req.lawyer?.name || 'Unknown Lawyer'}</div>
                                                    <div className="text-sm text-gray-500">{req.lawyer?.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{req.lawyer?.barCouncilId || '-'}</div>
                                            <div className="text-sm text-gray-500 text-xs">Lic: {req.lawyer?.licenseNumber || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {format(new Date(req.createdAt), 'MMM dd, yyyy')}
                                        </td>
                                        {activeTab === 'HISTORY' && (
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${req.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {req.status}
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => navigate(`/court-admin/verify/${req.lawyerId}`)}
                                                className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
                                            >
                                                {activeTab === 'PENDING' ? 'Review & Verify' : 'View Details'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CourtAdminDashboardPage;
