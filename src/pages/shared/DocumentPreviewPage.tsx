import { FC } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Download } from 'lucide-react'
import DocumentPreview from '@/components/atoms/DocumentPreview'

/**
 * Fullscreen wrapper around `DocumentPreview`.
 *
 * Mounted at `/preview` (under every role layout so any signed-in user
 * can reach it). Reads `?url=…&name=…&mime=…` from the query string and
 * delegates to the shared preview component.
 *
 * Why this exists: the original UX was `<a href={url} target="_blank">`
 * which made the browser open the raw Cloudinary URL. For PDFs uploaded
 * to `/raw/upload/` Cloudinary serves them with `Content-Type:
 * application/octet-stream`, so Chrome's built-in PDF viewer rejected
 * them ("Failed to load PDF document"). Routing through this page lets
 * us use `<embed type="application/pdf">` which bypasses the strict
 * Content-Type check by invoking the browser's PDF plugin directly.
 *
 * Anchors / window.open calls across the platform now point at
 * `/preview?url=…` so every "open file in new tab" flow works for both
 * legacy raw-uploaded files and newer image-uploaded files.
 */
const DocumentPreviewPage: FC = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const url = params.get('url') || ''
  const name = params.get('name') || ''
  const mime = params.get('mime') || ''

  if (!url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Nothing to preview</h1>
          <p className="text-sm text-gray-500">No document URL was provided.</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-sm hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4" /> Go back
          </button>
        </div>
      </div>
    )
  }

  const displayName = name || decodeURIComponent(url.split('?')[0].split('/').pop() || 'Document')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600 flex-shrink-0"
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-medium text-gray-900 truncate" title={displayName}>
            {displayName}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-100"
            title="Open the original Cloudinary URL"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Original
          </a>
          <a
            href={url}
            download={displayName}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        </div>
      </header>
      <main className="flex-1 p-4">
        <DocumentPreview url={url} filename={displayName} mimeType={mime} className="h-[calc(100vh-100px)]" />
      </main>
    </div>
  )
}

export default DocumentPreviewPage
