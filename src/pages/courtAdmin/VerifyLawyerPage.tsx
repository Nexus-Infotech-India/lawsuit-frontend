import { FC, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCourtAdminStore, VerificationRequest } from '../../stores/courtAdminStore';
import { format } from 'date-fns';
import { previewHref } from '@/utils/openDocument';

const VerifyLawyerPage: FC = () => {
    const { lawyerId } = useParams<{ lawyerId: string }>();
    const navigate = useNavigate();
    const {
        pendingVerifications,
        allVerifications,
        verifyLawyer,
        isLoading,
        fetchPendingVerifications,
        fetchAllVerifications,
    } = useCourtAdminStore();

    const [remarks, setRemarks] = useState('');
    const [request, setRequest] = useState<VerificationRequest | null>(null);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        // Try to find the request in pending, then all
        if (lawyerId) {
            const found = pendingVerifications.find(v => v.lawyerId === lawyerId)
                || allVerifications.find(v => v.lawyerId === lawyerId);
            setRequest(found || null);
        }
    }, [lawyerId, pendingVerifications, allVerifications]);

    // If the user landed here via a direct link (notification, refresh, etc.)
    // the store may be empty — populate both pending + all lists so the
    // lookup above can find the request. Previously this page rendered
    // "Verification Request Not Found" on direct-load because it only read
    // from in-memory state populated by the dashboard.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                await Promise.all([
                    fetchPendingVerifications().catch(() => {}),
                    fetchAllVerifications().catch(() => {}),
                ])
            } finally {
                if (!cancelled) setFetching(false)
            }
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (fetching && !request) {
        return (
            <div className="max-w-3xl mx-auto py-12 text-center">
                <div className="inline-block w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="mt-3 text-gray-500">Loading verification request…</p>
            </div>
        );
    }

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
                        {/* The server returns `lawyer.licenseProofUrl` and
                            `lawyer.barCouncilProofUrl` on the verification
                            request payload (see `getPendingLawyerVerifications`
                            in court-admin.service.ts). The previous build
                            ignored both fields and rendered a hardcoded
                            "No documents found" empty state, which is why
                            court admins couldn't see what the lawyer
                            uploaded. Now we render each proof as a card
                            with a preview / open-in-new-tab affordance. */}
                        <ProofDocsList
                            licenseUrl={request.lawyer.licenseProofUrl}
                            barCouncilUrl={request.lawyer.barCouncilProofUrl}
                        />
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

// ─── Proof documents renderer ────────────────────────────────────────
//
// Renders the lawyer's `licenseProofUrl` + `barCouncilProofUrl` as cards.
// Detects image vs PDF/other from the URL extension and:
//   • for images → inline `<img>` thumbnail
//   • for PDFs / others → file icon + filename
// Both have an "Open in new tab" CTA so the court admin can review the
// full content. The browser handles PDF rendering natively from the
// Cloudinary URL — no extra viewer dependency needed.
const ProofDocsList: React.FC<{
    licenseUrl?: string | null;
    barCouncilUrl?: string | null;
}> = ({ licenseUrl, barCouncilUrl }) => {
    const docs: { label: string; url: string }[] = [];
    if (licenseUrl) docs.push({ label: 'Practice License', url: licenseUrl });
    if (barCouncilUrl) docs.push({ label: 'Bar Council ID', url: barCouncilUrl });

    if (docs.length === 0) {
        return (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No documents uploaded</h3>
                <p className="mt-1 text-sm text-gray-500">The lawyer hasn't attached license or bar-council proofs yet.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {docs.map((d) => (
                <ProofDocCard key={d.label} label={d.label} url={d.url} />
            ))}
        </div>
    );
};

const ProofDocCard: React.FC<{ label: string; url: string }> = ({ label, url }) => {
    // Pull the file extension from the URL so we can decide whether to
    // render an inline preview or just a file chip. Cloudinary URLs end
    // with a clean extension (`…/document.pdf`).
    const clean = url.split('?')[0];
    const ext = (clean.split('.').pop() || '').toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext);
    const isPdf = ext === 'pdf';
    const filename = decodeURIComponent(clean.split('/').pop() || label);

    return (
        <div className="rounded-lg border border-gray-200 overflow-hidden flex flex-col bg-white">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {label}
            </div>
            <div className="flex-1 flex items-center justify-center bg-gray-50 min-h-[140px]">
                {isImage ? (
                    <img src={url} alt={label} className="max-h-48 max-w-full object-contain" />
                ) : isPdf ? (
                    // `<embed type="application/pdf">` instead of `<iframe>` —
                    // iframe respects HTTP Content-Type strictly and would
                    // refuse to render Cloudinary `raw/upload/` PDFs (served
                    // as octet-stream). The embed's type-hint invokes the
                    // browser's PDF plugin directly, which parses based on
                    // file content. Works for both raw-uploaded (legacy)
                    // and image-uploaded PDFs.
                    <embed
                        src={url}
                        type="application/pdf"
                        className="w-full h-48"
                    />
                ) : (
                    <div className="text-center text-gray-500 text-xs p-4">
                        <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="truncate max-w-[200px] mx-auto">{filename}</div>
                    </div>
                )}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs border-t border-gray-100 bg-white">
                <span className="truncate text-gray-500" title={filename}>{filename}</span>
                <a
                    // Route through the in-app preview so PDFs render via
                    // <embed> regardless of HTTP Content-Type. The previous
                    // raw URL open landed on Chrome's strict PDF viewer
                    // which rejected `octet-stream` responses with "Failed
                    // to load PDF document".
                    href={previewHref({ url, filename })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700 flex-shrink-0"
                >
                    Open
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M14 3h7v7M10 14L21 3M21 14v7H3V3h7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </a>
            </div>
        </div>
    );
};

export default VerifyLawyerPage;
