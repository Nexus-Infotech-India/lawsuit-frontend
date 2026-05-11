import { FC, useEffect, useMemo, useState } from 'react'
import {
  Sparkles,
  Loader2,
  FileText,
  RefreshCw,
  ListFilter,
  AlertCircle,
  Send,
  Bot,
  User as UserIcon,
  CheckCircle2,
  ScrollText,
  Plus,
  X,
  ShieldCheck,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import api, { apiEndpoints, casesApi, documentAiApi } from '@/services/api'
import { unwrapList, unwrapObject } from '@/utils/unwrap'
import { friendlyError } from '@/utils/errors'
import UploadInput from '@/components/atoms/UploadButton'
import Modal from '@/components/atoms/Modal'

interface CaseRow {
  id: string
  title?: string
  status?: string
  createdAt?: string
  documents?: DocumentRow[]
}

interface DocumentRow {
  id: string
  filename?: string
  mimeType?: string
  size?: number
  url?: string
  uploadedAt?: string
  extractedText?: string | null
  extractionStatus?: 'NOT_STARTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  summary?: string | null
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  ts: number
}

const fmtSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n = n / 1024
    i++
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/**
 * Standalone Document AI page — mirrors the mobile app's DocumentAiScreen.
 *
 * Workflow:
 *  1. List the user's cases (the same `casesApi.getAll` returns whichever set
 *     the JWT has access to — clients see theirs, lawyers see theirs).
 *  2. Pick a case → fetch its documents via `casesApi.getById` (which already
 *     includes `documents`).
 *  3. Pick a document → run any of: Extract text · Summarize · Ask Q&A.
 *
 * The same component is mounted at `/app/document-ai` (Client) and
 * `/lawyer/document-ai` (Lawyer) — there is no role-specific behaviour, the
 * server scopes every read by token.
 */
const DocumentAiPage: FC = () => {
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loadingCases, setLoadingCases] = useState(true)
  const [casesError, setCasesError] = useState<string | null>(null)

  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [activeCase, setActiveCase] = useState<CaseRow | null>(null)
  const [loadingCase, setLoadingCase] = useState(false)

  const [activeDocId, setActiveDocId] = useState<string | null>(null)

  // Inline upload — matches the mobile app's convenience of doing
  // upload + summarize in one place instead of bouncing to case detail.
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [uploadFileName, setUploadFileName] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const loadCases = async () => {
    setLoadingCases(true)
    setCasesError(null)
    try {
      const res = await casesApi.getAll()
      const list = unwrapList<CaseRow>(res.data)
      setCases(list)
      // Auto-select the first case so the user lands on something useful.
      if (list[0] && !activeCaseId) setActiveCaseId(list[0].id)
    } catch (err) {
      setCasesError(friendlyError(err, "We couldn't load your cases."))
    } finally {
      setLoadingCases(false)
    }
  }

  useEffect(() => {
    loadCases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh the chosen case's documents whenever activeCaseId changes.
  useEffect(() => {
    if (!activeCaseId) {
      setActiveCase(null)
      setActiveDocId(null)
      return
    }
    let cancelled = false
    setLoadingCase(true)
    casesApi
      .getById(activeCaseId)
      .then((res) => {
        if (cancelled) return
        const data =
          unwrapObject<CaseRow>(res.data, 'case') ??
          unwrapObject<CaseRow>(res.data, 'data') ??
          (res.data as CaseRow)
        setActiveCase(data ?? null)
        // Auto-pick the first document so a single-doc case is one click.
        const firstDocId = data?.documents?.[0]?.id
        setActiveDocId(firstDocId ?? null)
      })
      .catch(() => {
        if (cancelled) return
        setActiveCase(null)
        setActiveDocId(null)
      })
      .finally(() => !cancelled && setLoadingCase(false))
    return () => {
      cancelled = true
    }
  }, [activeCaseId])

  const activeDoc = useMemo(
    () => activeCase?.documents?.find((d) => d.id === activeDocId) ?? null,
    [activeCase, activeDocId],
  )

  const refreshActiveCase = async () => {
    if (!activeCaseId) return
    try {
      const res = await casesApi.getById(activeCaseId)
      const data =
        unwrapObject<CaseRow>(res.data, 'case') ??
        unwrapObject<CaseRow>(res.data, 'data') ??
        (res.data as CaseRow)
      setActiveCase(data ?? null)
    } catch {
      /* keep stale state */
    }
  }

  const closeUploadModal = () => {
    setUploadOpen(false)
    setUploadUrl(null)
    setUploadFileName('')
    setUploadError(null)
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

  const saveUploadedDocument = async () => {
    if (!activeCaseId || !uploadUrl) return
    setSaving(true)
    setUploadError(null)
    try {
      const filename = uploadFileName || uploadUrl.split('/').pop() || 'document'
      const res = await api.post(apiEndpoints.case.addDocument(activeCaseId), {
        fileurl: uploadUrl,
        fileName: filename,
        mimeType: mimeFromName(filename),
      })
      const newDoc =
        unwrapObject<DocumentRow>(res.data, 'document') ??
        unwrapObject<DocumentRow>(res.data, 'data') ??
        (res.data as DocumentRow | undefined)
      closeUploadModal()
      await refreshActiveCase()
      if (newDoc?.id) {
        setActiveDocId(newDoc.id)
        // Kick off extraction in the background so the summary is ready by
        // the time the user notices the new doc. The backend's /extract now
        // auto-summarizes, so a single call populates both fields.
        documentAiApi
          .extract(activeCaseId, newDoc.id)
          .then(() => refreshActiveCase())
          .catch(() => {
            /* extraction can be retried manually from the workspace */
          })
      }
    } catch (err) {
      setUploadError(friendlyError(err, "We couldn't save this document."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-4 sm:px-0">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-fuchsia-50 flex-shrink-0">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-fuchsia-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Document AI</h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Extract, summarize, or chat with any case document — powered by your case AI.
            </p>
          </div>
        </div>
        <button
          onClick={loadCases}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loadingCases ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      {casesError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {casesError}
        </div>
      )}

      {loadingCases ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-fuchsia-600" />
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          title="You don't have any cases yet"
          description="Document AI works on case files. Create or join a case first, then come back here to upload documents and generate summaries."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Case picker */}
          <aside className="lg:col-span-3 space-y-3">
            <SectionHeader icon={ListFilter} text="Cases" />
            <ul className="bg-white border border-gray-100 rounded-xl shadow-sm divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
              {cases.map((c) => {
                const active = c.id === activeCaseId
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setActiveCaseId(c.id)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        active ? 'bg-fuchsia-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div
                        className={`text-sm font-medium truncate ${active ? 'text-fuchsia-800' : 'text-gray-900'}`}
                      >
                        {c.title || 'Untitled case'}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
                        <span className="truncate">{c.status || '—'}</span>
                        {c.documents && (
                          <span className="text-gray-400">
                            · {c.documents.length} doc{c.documents.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {/* Document picker */}
          <section className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <SectionHeader icon={FileText} text="Documents" />
              <div className="flex items-center gap-2">
                {loadingCase && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                <button
                  onClick={() => setUploadOpen(true)}
                  disabled={!activeCaseId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-fuchsia-600 text-white text-xs font-medium hover:bg-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!activeCaseId ? 'Pick a case first' : 'Upload a new document'}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Upload
                </button>
              </div>
            </div>
            {!activeCase ? (
              <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-sm text-gray-500">
                Pick a case to see its documents.
              </div>
            ) : (activeCase.documents ?? []).length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-6 text-center">
                <FileText className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-700 font-medium">No documents on this case</p>
                <p className="text-xs text-gray-500 mt-1">
                  Click <span className="font-medium text-fuchsia-700">Upload</span> to add a PDF, Word doc, or image — we'll extract the text and generate a summary automatically.
                </p>
              </div>
            ) : (
              <ul className="bg-white border border-gray-100 rounded-xl shadow-sm divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
                {activeCase.documents!.map((d) => {
                  const active = d.id === activeDocId
                  return (
                    <li key={d.id}>
                      <button
                        onClick={() => setActiveDocId(d.id)}
                        className={`w-full text-left px-3 py-2.5 transition-colors ${
                          active ? 'bg-fuchsia-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div
                          className={`text-sm font-medium truncate ${active ? 'text-fuchsia-800' : 'text-gray-900'}`}
                        >
                          {d.filename || 'Untitled file'}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{(d.mimeType || '').split('/').pop() || 'file'}</span>
                          {d.size != null && <span>· {fmtSize(d.size)}</span>}
                          <span className="text-gray-400">· {fmtDate(d.uploadedAt)}</span>
                          <ExtractionPill status={d.extractionStatus} />
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* AI workspace */}
          <section className="lg:col-span-5 space-y-3 min-w-0">
            <SectionHeader icon={Bot} text="AI workspace" />
            {!activeDoc ? (
              <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-sm text-gray-500">
                Pick a document to extract, summarize, or ask questions about it.
              </div>
            ) : (
              <DocumentWorkspace
                key={activeDoc.id}
                caseId={activeCaseId!}
                doc={activeDoc}
                onChanged={refreshActiveCase}
              />
            )}
          </section>
        </div>
      )}

      {/* Inline upload — case selected required */}
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
                <p className="font-semibold text-gray-800 mb-0.5">Uploading to case</p>
                <p className="truncate">{activeCase?.title || 'Selected case'}</p>
                <p className="mt-1">Supported: PDF, DOCX, and common image types (JPG, PNG). After saving, we'll extract the text and generate a summary automatically.</p>
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
              onClick={saveUploadedDocument}
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

const ExtractionPill: FC<{ status?: string | null }> = ({ status }) => {
  if (!status || status === 'NOT_STARTED') return null
  const cls =
    status === 'COMPLETED'
      ? 'bg-green-50 text-green-700 border-green-100'
      : status === 'PROCESSING'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : 'bg-red-50 text-red-700 border-red-100'
  const label =
    status === 'COMPLETED'
      ? 'Extracted'
      : status === 'PROCESSING'
        ? 'Processing'
        : 'Failed'
  return (
    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Workspace — three actions on the picked doc
// ──────────────────────────────────────────────────────────────────────────
const DocumentWorkspace: FC<{
  caseId: string
  doc: DocumentRow
  onChanged: () => void
}> = ({ caseId, doc, onChanged }) => {
  const [tab, setTab] = useState<'summary' | 'extract' | 'ask'>('summary')

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-fuchsia-600 flex-shrink-0" />
          <span className="font-medium text-gray-900 truncate">{doc.filename || 'Document'}</span>
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{doc.mimeType || ''}</span>
          {doc.size != null && <span>· {fmtSize(doc.size)}</span>}
          <span className="text-gray-400">· uploaded {fmtDate(doc.uploadedAt)}</span>
          {doc.url && (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-fuchsia-700 hover:text-fuchsia-800 underline"
            >
              Open file ↗
            </a>
          )}
        </div>
      </header>

      <nav className="flex border-b border-gray-100 px-2 sm:px-4 overflow-x-auto">
        {([
          { id: 'summary', label: 'Summary', icon: ScrollText },
          { id: 'extract', label: 'Extracted text', icon: FileText },
          { id: 'ask', label: 'Ask AI', icon: Bot },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              tab === t.id
                ? 'border-fuchsia-600 text-fuchsia-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </nav>

      <div className="p-4">
        {tab === 'summary' && <SummaryTab caseId={caseId} doc={doc} onChanged={onChanged} />}
        {tab === 'extract' && <ExtractTab caseId={caseId} doc={doc} onChanged={onChanged} />}
        {tab === 'ask' && <AskTab caseId={caseId} doc={doc} />}
      </div>
    </div>
  )
}

// ─── Summary tab ─────────────────────────────────────────────────────────
const SummaryTab: FC<{ caseId: string; doc: DocumentRow; onChanged: () => void }> = ({
  caseId,
  doc,
  onChanged,
}) => {
  const [summary, setSummary] = useState(doc.summary || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Backend's /extract now auto-populates `summary`. Sync from prop so the
  // user sees it here without an extra click after extraction finishes.
  useEffect(() => {
    setSummary(doc.summary || '')
  }, [doc.summary, doc.id])

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await documentAiApi.summarize(caseId, doc.id)
      const next =
        (res.data as any)?.summary ||
        (res.data as any)?.data?.summary ||
        ''
      setSummary(next)
      onChanged()
    } catch (err) {
      setError(friendlyError(err, "We couldn't generate a summary."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          A structured summary of what's in this document.
        </p>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-600 text-white text-xs font-medium hover:bg-fuchsia-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {summary ? 'Regenerate' : 'Generate summary'}
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {summary ? (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-800 leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-gray-900 [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-800 [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_hr]:my-2 [&_hr]:border-gray-200 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
          <ReactMarkdown>{summary}</ReactMarkdown>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No summary yet. Extracting text will auto-generate one, or click <strong>Generate summary</strong> to create it now.
        </div>
      )}
    </div>
  )
}

// ─── Extract tab ─────────────────────────────────────────────────────────
const ExtractTab: FC<{ caseId: string; doc: DocumentRow; onChanged: () => void }> = ({
  caseId,
  doc,
  onChanged,
}) => {
  const [text, setText] = useState(doc.extractedText || '')
  const [status, setStatus] = useState(doc.extractionStatus || 'NOT_STARTED')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(doc.extractedText || '')
    setStatus(doc.extractionStatus || 'NOT_STARTED')
  }, [doc.extractedText, doc.extractionStatus, doc.id])

  const extract = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await documentAiApi.extract(caseId, doc.id)
      const payload = (res.data as any)?.document ?? (res.data as any)?.data?.document ?? (res.data as any)
      const next = payload?.extractedText || ''
      setText(next)
      setStatus(payload?.extractionStatus || 'COMPLETED')
      onChanged()
    } catch (err) {
      setError(friendlyError(err, "We couldn't extract text from this document."))
      setStatus('FAILED')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-gray-500 flex items-center gap-2">
          {status === 'COMPLETED' ? (
            <span className="inline-flex items-center gap-1 text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Text extracted
            </span>
          ) : status === 'PROCESSING' ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing
            </span>
          ) : (
            <span>Run text extraction (OCR / parse) to enable Q&amp;A.</span>
          )}
        </div>
        <button
          onClick={extract}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-600 text-white text-xs font-medium hover:bg-fuchsia-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {text ? 'Re-extract' : 'Extract text'}
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {text ? (
        <pre className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-800 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto font-sans">
          {text}
        </pre>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          No extracted text yet.
        </div>
      )}
    </div>
  )
}

// ─── Ask tab ─────────────────────────────────────────────────────────────
const AskTab: FC<{ caseId: string; doc: DocumentRow }> = ({ caseId, doc }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = question.trim()
    if (!q || busy) return
    setError(null)
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: q, ts: Date.now() }
    setMessages((m) => [...m, userMsg])
    setQuestion('')
    setBusy(true)
    try {
      const res = await documentAiApi.ask(caseId, doc.id, q)
      const answer =
        (res.data as any)?.answer ||
        (res.data as any)?.data?.answer ||
        (res.data as any)?.response ||
        '(no answer returned)'
      const reply: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: String(answer),
        ts: Date.now(),
      }
      setMessages((m) => [...m, reply])
    } catch (err) {
      setError(friendlyError(err, "We couldn't get an answer."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-100 bg-gray-50/40 p-3 space-y-3 max-h-[55vh] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-gray-500 py-6">
            <Bot className="w-6 h-6 text-gray-300 mx-auto mb-1" />
            Ask anything about this document — e.g. <em>"What's the deadline mentioned?"</em>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                  m.role === 'user'
                    ? 'bg-fuchsia-600 text-white rounded-br-md'
                    : 'bg-white border border-gray-100 text-gray-800 rounded-bl-md'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="px-3 py-2 rounded-2xl bg-white border border-gray-100 text-sm text-gray-500 inline-flex items-center gap-1.5 rounded-bl-md">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-fuchsia-200"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-fuchsia-600 text-white text-sm font-medium hover:bg-fuchsia-700 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Ask</span>
        </button>
      </form>
    </div>
  )
}

// ─── Tiny shared atoms ───────────────────────────────────────────────────
const SectionHeader: FC<{ icon: React.ComponentType<{ className?: string }>; text: string }> = ({
  icon: Icon,
  text,
}) => (
  <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5">
    <Icon className="w-3.5 h-3.5" /> {text}
  </div>
)

const EmptyState: FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
    <Sparkles className="w-12 h-12 mx-auto text-gray-300" />
    <p className="mt-3 text-gray-700 font-medium">{title}</p>
    <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">{description}</p>
  </div>
)

export default DocumentAiPage
