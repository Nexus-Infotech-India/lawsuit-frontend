import { FC, useEffect, useState } from 'react'
import { Plus, Loader2, X, ShieldCheck, AlertCircle, FileText, Sparkles, RefreshCw, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { appointmentsApi, documentAiApi } from '@/services/api'
import { friendlyError } from '@/utils/errors'
import UploadInput from '@/components/atoms/UploadButton'
import Modal from '@/components/atoms/Modal'

interface AppointmentDoc {
  id: string
  filename: string
  mimeType: string
  size: number
  url: string
  uploadedAt: string
  extractedText?: string | null
  extractionStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null
  extractedAt?: string | null
  summary?: string | null
}

interface AppointmentDocumentsPanelProps {
  appointmentId: string
}

const mimeFromName = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    txt: 'text/plain',
  }
  return map[ext] || 'application/octet-stream'
}

const SUMMARY_PROSE_CLASSES =
  '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-gray-900 [&_h1]:mt-3 [&_h1]:mb-1 ' +
  '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:mt-3 [&_h2]:mb-1 ' +
  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-800 [&_h3]:mt-2 [&_h3]:mb-1 ' +
  '[&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 ' +
  '[&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_hr]:my-2 [&_hr]:border-gray-200 ' +
  '[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs'

const AppointmentDocumentsPanel: FC<AppointmentDocumentsPanelProps> = ({ appointmentId }) => {
  const [docs, setDocs] = useState<AppointmentDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [uploadFileName, setUploadFileName] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [openDocIds, setOpenDocIds] = useState<Record<string, boolean>>({})
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({})
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null)

  const fetchDocs = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await appointmentsApi.listDocuments(appointmentId)
      const list =
        (res.data as any)?.documents ??
        (res.data as any)?.data ??
        (res.data as any) ??
        []
      setDocs(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(friendlyError(err, "We couldn't load your documents for this appointment."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId])

  const closeUploadModal = () => {
    setUploadOpen(false)
    setUploadUrl(null)
    setUploadFileName('')
    setUploadError(null)
  }

  const saveDocument = async () => {
    if (!uploadUrl) return
    setSaving(true)
    setUploadError(null)
    try {
      const filename = uploadFileName || uploadUrl.split('/').pop() || 'document'
      const res = await appointmentsApi.addDocument(appointmentId, {
        fileurl: uploadUrl,
        fileName: filename,
        mimeType: mimeFromName(filename),
      })
      const newDoc: AppointmentDoc | undefined =
        (res.data as any)?.document ?? (res.data as any)?.data ?? (res.data as any)
      closeUploadModal()
      await fetchDocs()
      if (newDoc?.id) {
        setOpenDocIds((m) => ({ ...m, [newDoc.id]: true }))
        // Fire-and-forget extract; backend auto-summarizes.
        documentAiApi
          .extractById(newDoc.id)
          .then(() => fetchDocs())
          .catch(() => {
            /* retry available via Regenerate */
          })
      }
    } catch (err) {
      setUploadError(friendlyError(err, "We couldn't save this document."))
    } finally {
      setSaving(false)
    }
  }

  const regenerateSummary = async (doc: AppointmentDoc) => {
    setRegenerating((m) => ({ ...m, [doc.id]: true }))
    try {
      // Force a fresh summary even if one exists.
      await documentAiApi.summarizeById(doc.id).catch(async () => {
        // Fallback: re-extract (auto-summarizes on success).
        await documentAiApi.extractById(doc.id)
      })
      await fetchDocs()
    } catch {
      /* surfaced via the next refresh */
    } finally {
      setRegenerating((m) => ({ ...m, [doc.id]: false }))
    }
  }

  const handleCopy = async (text: string, docId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedDocId(docId)
      setTimeout(() => setCopiedDocId(null), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-fuchsia-600" />
          <span className="text-sm font-semibold text-gray-800">Documents & AI summaries</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDocs}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-fuchsia-600 text-white text-xs font-medium hover:bg-fuchsia-700"
          >
            <Plus className="w-3.5 h-3.5" />
            Upload
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2 mb-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && docs.length === 0 ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-fuchsia-500" />
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-xs text-gray-500">
          No documents yet. Upload a PDF, Word doc, or image — we'll extract the text and generate a structured AI summary automatically.
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => {
            const isOpen = !!openDocIds[doc.id]
            const isProcessing = doc.extractionStatus === 'PROCESSING'
            const hasSummary = !!doc.summary
            return (
              <li key={doc.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <button
                  onClick={() => setOpenDocIds((m) => ({ ...m, [doc.id]: !isOpen }))}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-900 truncate" title={doc.filename}>
                      {doc.filename}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isProcessing && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Processing
                      </span>
                    )}
                    {doc.extractionStatus === 'COMPLETED' && hasSummary && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded">
                        <Sparkles className="w-2.5 h-2.5" /> Summary ready
                      </span>
                    )}
                    {doc.extractionStatus === 'FAILED' && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">
                        Extract failed
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">
                      {isOpen ? '▼' : '▶'}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-3 py-3 border-t border-gray-100 bg-gray-50 space-y-2">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-fuchsia-700 hover:underline"
                      >
                        View file ↗
                      </a>
                      <button
                        onClick={() => regenerateSummary(doc)}
                        disabled={regenerating[doc.id]}
                        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-fuchsia-700 disabled:opacity-50"
                        title={hasSummary ? 'Regenerate summary' : 'Generate summary'}
                      >
                        {regenerating[doc.id] ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        {hasSummary ? 'Regenerate' : 'Summarize'}
                      </button>
                      {hasSummary && (
                        <button
                          onClick={() => handleCopy(doc.summary || '', doc.id)}
                          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-fuchsia-700"
                        >
                          {copiedDocId === doc.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedDocId === doc.id ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>

                    {hasSummary ? (
                      <div
                        className={`rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-800 leading-relaxed max-h-80 overflow-auto ${SUMMARY_PROSE_CLASSES}`}
                      >
                        <ReactMarkdown>{doc.summary || ''}</ReactMarkdown>
                      </div>
                    ) : isProcessing || regenerating[doc.id] ? (
                      <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating your summary…
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 px-2 py-3 text-center">
                        No summary yet. Click <strong>Summarize</strong> above to generate one.
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Upload modal */}
      <Modal open={uploadOpen}>
        <div className="w-[500px] max-w-[90vw]">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Upload document</h2>
            <button
              onClick={closeUploadModal}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-fuchsia-50 border border-fuchsia-100">
              <ShieldCheck className="w-5 h-5 text-fuchsia-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-gray-700 leading-relaxed">
                <p className="font-semibold text-gray-800 mb-0.5">Attach for this appointment</p>
                <p>
                  Files are stored encrypted and shared only with your assigned lawyer. We'll extract the text and generate a structured summary automatically. Supported: PDF, DOCX, JPG, PNG.
                </p>
              </div>
            </div>

            <UploadInput
              imageUrl={uploadUrl}
              setImageUrl={(url) => {
                if (typeof url === 'function') {
                  setUploadUrl(url)
                } else {
                  setUploadUrl(url)
                  if (url) {
                    const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '')
                    setUploadFileName(name)
                  }
                }
              }}
              width="full"
            />

            {uploadError && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {uploadError}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
            <button
              onClick={closeUploadModal}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveDocument}
              disabled={!uploadUrl || saving}
              className="px-4 py-2 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm inline-flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save document'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default AppointmentDocumentsPanel
