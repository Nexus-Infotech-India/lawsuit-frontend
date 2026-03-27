import { FC } from 'react';
import { useCourtAdminStore } from '../../stores/courtAdminStore';

const CourtAdminProfilePage: FC = () => {
    const { user, logout } = useCourtAdminStore();

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
                <button
                    onClick={() => logout()}
                    className="text-sm text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md transition-colors"
                >
                    Sign Out
                </button>
            </div>

            <div className="bg-white shadow border border-gray-100 rounded-lg overflow-hidden">
                <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Admin Information</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">Personal details and current role.</p>
                </div>
                <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                    <dl className="sm:divide-y sm:divide-gray-200">
                        <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Role</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {user?.role === 'COURT_ADMIN' ? 'Court Admin' : user?.role || 'Unknown'}
                                </span>
                            </dd>
                        </div>
                        {/* Note: In a complete implementation, we would query the backend for full court details using `/api/court-admin/me` */}
                        <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">User ID</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-mono">
                                {user?.id || '—'}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            <div className="bg-white shadow border border-gray-100 rounded-lg overflow-hidden p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">Settings Coming Soon</h3>
                <p className="mt-1 text-sm text-gray-500">Options to update your court's jurisdiction details and preferences will be available here.</p>
            </div>
        </div>
    );
};

export default CourtAdminProfilePage;
