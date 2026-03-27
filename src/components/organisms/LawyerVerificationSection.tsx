import React, { useState, useEffect } from 'react';
import { courtAdminApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useUserStore } from '@/stores/userStore';
import Button from '@/components/atoms/Button';
import { CheckCircle, AlertTriangle, Clock, Search, ShieldCheck } from 'lucide-react';

interface CourtAdmin {
    id: string;
    name: string;
    court: {
        id: string;
        name: string;
        city: string;
        state: string;
        pincodes: string[];
    };
}

const LawyerVerificationSection: React.FC = () => {
    const authUser = useAuthStore((s) => s.user);
    const { user: storeUser } = useUserStore();
    const lawyer = storeUser || authUser;

    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<any[]>([]);
    const [pincode, setPincode] = useState('');
    const [admins, setAdmins] = useState<CourtAdmin[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedAdminId, setSelectedAdminId] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Determine if the lawyer is fully verified
    const isVerified = (lawyer as any)?.isVerified === true;

    const fetchMyRequests = async () => {
        try {
            setLoading(true);
            const res = await courtAdminApi.getMyRequests();
            setRequests(res.data.items || []);
        } catch (err: any) {
            console.error('Failed to fetch verification requests:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isVerified) {
            fetchMyRequests();
        } else {
            setLoading(false);
        }
    }, [isVerified]);

    const handleSearch = async () => {
        if (!pincode || pincode.length < 6) {
            setError('Please enter a valid 6-digit pincode');
            return;
        }

        setError('');
        setSearching(true);
        setAdmins([]);
        setSelectedAdminId('');

        try {
            const res = await courtAdminApi.getAdminsByPincode(pincode);
            setAdmins(res.data.courtAdmins || []);
            if (res.data.courtAdmins?.length === 0) {
                setError('No Court Admins found for this pincode.');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to find court admins');
        } finally {
            setSearching(false);
        }
    };

    const handleSubmitRequest = async () => {
        if (!selectedAdminId) {
            setError('Please select a Court Admin to review your request.');
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            await courtAdminApi.requestVerification(selectedAdminId);
            setSuccess('Verification request submitted successfully!');
            fetchMyRequests(); // Refresh the list
            setAdmins([]);
            setPincode('');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex animate-pulse space-x-4 p-6 bg-white rounded-lg border border-gray-100 shadow-sm">
                <div className="flex-1 space-y-4 py-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="space-y-2">
                        <div className="h-4 bg-gray-200 rounded"></div>
                        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
        );
    }

    // If fully verified
    if (isVerified) {
        return (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 flex flex-col sm:flex-row items-center gap-4 shadow-sm">
                <div className="flex-shrink-0 bg-green-100 p-3 rounded-full">
                    <ShieldCheck className="h-8 w-8 text-green-600" />
                </div>
                <div>
                    <h3 className="text-lg font-medium text-green-800">Verified Professional</h3>
                    <p className="mt-1 text-sm text-green-700">
                        Your Bar Council License and details have been reviewed and verified by a Court Admin.
                        You now have a verified badge on your public profile.
                    </p>
                </div>
            </div>
        );
    }

    // Check if there is an active pending request
    const pendingRequest = requests.find(r => r.status === 'PENDING');
    const rejectedRequests = requests.filter(r => r.status === 'REJECTED');

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
                <ShieldCheck className="w-6 h-6 text-indigo-600" />
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Profile Verification</h2>
                    <p className="text-sm text-gray-500">Get verified to build trust with potential clients</p>
                </div>
            </div>

            {pendingRequest ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex flex-col sm:flex-row gap-4">
                    <div className="flex-shrink-0 bg-yellow-100 p-3 rounded-full h-fit">
                        <Clock className="h-6 w-6 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-md font-medium text-yellow-800">Verification Pending</h3>
                        <p className="mt-1 text-sm text-yellow-700">
                            Your verification request is currently under review by a Court Admin at <strong>{pendingRequest.courtAdmin?.court?.name}</strong>.
                        </p>
                        <div className="mt-4 text-xs text-yellow-600 bg-yellow-100/50 inline-block px-3 py-1.5 rounded-md border border-yellow-200">
                            Submitted on: {new Date(pendingRequest.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {rejectedRequests.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
                            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                            <div>
                                <h4 className="text-sm font-medium text-red-800">Previous Request Rejected</h4>
                                <p className="text-sm text-red-700 mt-1">
                                    Your last verification request was rejected. Details: {rejectedRequests[0].remarks || 'No remarks provided.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg text-sm flex gap-2 items-center">
                            <CheckCircle className="h-5 w-5" />
                            {success}
                        </div>
                    )}

                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-6">
                        <h3 className="text-sm font-medium text-gray-900 mb-2">Request Verification</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            To get verified, you need to submit your profile to a Court Admin from your local jurisdiction. Enter your pincode below to find nearby Court Admins.
                        </p>

                        <div className="flex gap-3 mb-6">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Enter 6-digit Pincode"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                                    value={pincode}
                                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                            </div>
                            <Button onClick={handleSearch} disabled={searching || pincode.length !== 6}>
                                {searching ? 'Search...' : <><Search className="w-4 h-4 mr-2 inline" /> Locate</>}
                            </Button>
                        </div>

                        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

                        {admins.length > 0 && (
                            <div className="space-y-4 border-t border-gray-200 pt-6">
                                <h4 className="text-sm font-medium text-gray-700 mb-3">Select a Court Admin:</h4>
                                <div className="grid grid-cols-1 gap-4">
                                    {admins.map((admin) => (
                                        <label
                                            key={admin.id}
                                            className={`relative flex cursor-pointer rounded-lg border bg-white p-4 shadow-sm focus:outline-none ${selectedAdminId === admin.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="courtAdmin"
                                                value={admin.id}
                                                className="sr-only"
                                                checked={selectedAdminId === admin.id}
                                                onChange={(e) => setSelectedAdminId(e.target.value)}
                                            />
                                            <span className="flex flex-1">
                                                <span className="flex flex-col">
                                                    <span className="block text-sm font-medium text-gray-900">{admin.court?.name || 'Unknown Court'}</span>
                                                    <span className="mt-1 flex items-center text-sm text-gray-500">
                                                        {admin.name} • {admin.court?.city}, {admin.court?.state}
                                                    </span>
                                                </span>
                                            </span>
                                            {selectedAdminId === admin.id && (
                                                <CheckCircle className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                                            )}
                                        </label>
                                    ))}
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <Button
                                        variant="primary"
                                        onClick={handleSubmitRequest}
                                        disabled={!selectedAdminId || submitting}
                                    >
                                        {submitting ? 'Submitting...' : 'Submit Request'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LawyerVerificationSection;
