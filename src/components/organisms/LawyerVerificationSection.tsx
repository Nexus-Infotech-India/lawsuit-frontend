import React, { useState, useEffect } from 'react';
import { courtAdminApi, usersApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useUserStore } from '@/stores/userStore';
import Button from '@/components/atoms/Button';
import { CheckCircle, AlertTriangle, Clock, Search, ShieldCheck, Loader2 } from 'lucide-react';

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
    // District-based search replaces the earlier pincode-only flow. The
    // lawyer's `district` / `state` live on the Lawyer row (filled via the
    // address section of the profile editor), NOT on the User row that
    // `useAuthStore` / `useUserStore` expose — so we have to hit
    // `/users/lawyer-information` on mount to read them. Once we have a
    // district we auto-trigger the search, so the user lands on a fully
    // populated court-admin list without typing anything.
    const [district, setDistrict] = useState('');
    const [stateName, setStateName] = useState('');
    const [profileLoading, setProfileLoading] = useState(true);
    const [hasProfileAddress, setHasProfileAddress] = useState(false);
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

    // Pull the saved lawyer-info address so we can auto-prefill (and
    // auto-trigger) the district search. The user can still adjust the
    // district/state and re-locate if they practice in a different
    // jurisdiction. We do NOT fall back to `lawyer.pincode` here because
    // a pincode covers a much narrower area than the district endpoint
    // expects.
    useEffect(() => {
        if (isVerified) return
        let cancelled = false
        ;(async () => {
            setProfileLoading(true)
            try {
                const res = await usersApi.getLawyerInformation()
                const data: any = (res as any).data ?? res
                const lawyerInfo = data?.lawyer ?? data?.data?.lawyer ?? data?.data ?? data ?? {}
                const d = String(lawyerInfo?.district || lawyerInfo?.city || '').trim()
                const s = String(lawyerInfo?.state || '').trim()
                if (cancelled) return
                setDistrict(d)
                setStateName(s)
                setHasProfileAddress(!!d)
                if (d) {
                    // Auto-trigger the search so the lawyer doesn't have
                    // to click "Locate" when their profile already has an
                    // address on file.
                    runSearch(d, s, { silentEmpty: true })
                }
            } catch {
                // Non-fatal — the user can still type a district manually.
            } finally {
                if (!cancelled) setProfileLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVerified])

    /**
     * Internal search helper. Separated from `handleSearch` so the
     * auto-trigger on mount can run with `silentEmpty: true` (no "no
     * results" error message — we just leave the picker empty so the
     * user can type a different district).
     */
    const runSearch = async (
        d: string,
        s: string,
        opts: { silentEmpty?: boolean } = {},
    ) => {
        setError('');
        setSearching(true);
        setAdmins([]);
        setSelectedAdminId('');
        try {
            const res = await courtAdminApi.getAdminsByDistrict(d, s || undefined);
            const data = (res as any).data ?? res
            const list = data.courtAdmins || data.admins || data.items || (data ?? [])
            const admins = Array.isArray(list) ? list : []
            setAdmins(admins);
            if (admins.length === 0 && !opts.silentEmpty) {
                setError('No Court Admins found for that district.');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.response?.data?.error || 'Failed to find court admins');
        } finally {
            setSearching(false);
        }
    }

    const handleSearch = async () => {
        const d = district.trim()
        if (!d) {
            setError('Please enter your district to locate Court Admins.')
            return;
        }
        await runSearch(d, stateName.trim())
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
            // Keep the district/state populated so a rejected re-submit
            // doesn't force the lawyer to retype their address.
        } catch (err: any) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit request');
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
                        <p className="text-sm text-gray-500 mb-4">
                            We use the district from your profile address to find court admins in
                            your jurisdiction. Pick one below to send your verification request.
                            {' '}
                            <span className="text-gray-400">
                                Practicing elsewhere? Edit the district and click <em>Locate</em>.
                            </span>
                        </p>

                        {/* Loading state for the address pre-fetch. Without
                            this the user briefly sees an empty form and
                            might start typing manually before the auto-fill
                            arrives. */}
                        {profileLoading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Reading your saved address…
                            </div>
                        ) : !hasProfileAddress ? (
                            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 mb-4">
                                Your profile doesn't have a district saved yet. Add your office
                                address in the section above, or type your district below.
                            </div>
                        ) : null}

                        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1.5fr_auto] gap-3 mb-6">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">District</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Berhampur"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm"
                                    value={district}
                                    onChange={(e) => setDistrict(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    State <span className="font-normal text-gray-400">(optional)</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Odisha"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm"
                                    value={stateName}
                                    onChange={(e) => setStateName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                            </div>
                            <div className="flex items-end">
                                <Button onClick={handleSearch} disabled={searching || !district.trim()}>
                                    {searching ? 'Searching…' : <><Search className="w-4 h-4 mr-2 inline" /> Locate</>}
                                </Button>
                            </div>
                        </div>

                        {searching && admins.length === 0 && !error && (
                            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Finding court admins in {district || 'your district'}…
                            </div>
                        )}

                        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

                        {!searching && admins.length === 0 && !error && hasProfileAddress && (
                            <p className="text-sm text-gray-500 mb-4">
                                No court admins found in {district}. Try adjusting your district
                                or state above and click <em>Locate</em> again.
                            </p>
                        )}

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
