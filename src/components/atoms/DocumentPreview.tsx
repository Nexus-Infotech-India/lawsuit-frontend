import { FC } from 'react'
import { Download, ExternalLink, FileText, Image as ImageIcon } from 'lucide-react'

/**
 * Mime-aware document preview.
 *
 * Why `<embed>` and not `<iframe>` for PDFs:
 *   `<iframe src=URL>` strictly respects the server's `Content-Type`
 *   header. Cloudinary's `/raw/upload/` endpoint serves files with
 *   `Content-Type: application/octet-stream`, so even valid PDF bytes
 *   land in the iframe as a "downloadable attachment" and the embedded
 *   PDF viewer never gets invoked — you see a blank iframe or "Failed
 *   to load PDF document".
 *
 *   `<embed type="application/pdf" src=URL>` tells the browser to pick
 *   the PDF viewer via the `type` hint regardless of HTTP Content-Type.
 *   Chrome / Firefox then invoke their built-in PDF plugins, which
 *   parse the bytes directly (checking the `%PDF` magic header) and
 *   render successfully. This works for both `raw/upload` and
 *   `image/upload` Cloudinary URLs — solving the legacy-file gap
 *   without re-uploading anything.
 *
 * For non-PDF, non-image formats (DOCX, XLSX, ZIP, etc.) the browser
 * has no built-in viewer, so we render a download card instead.
 */
interface DocumentPreviewProps {
  url: string
  /** Original filename — used in the header chip and download attribute. */
  filename?: string | null
  /** Server-known mime type. Falls back to URL-extension sniffing when omitted. */
  mimeType?: string | null
  /** Tailwind classes for sizing the viewport. Defaults to a comfortable inline preview. */
  className?: string
}

/**
 * Best-effort kind detection. Prefers `mimeType` when supplied; otherwise
 * sniffs the URL extension (Cloudinary URLs preserve the original ext).
 */
function detectKind(url: string, mimeType?: string | null): 'image' | 'pdf' | 'other' {
  const m = (mimeType || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf') return 'pdf'

  const cleanUrl = url.split('?')[0]
  const ext = (cleanUrl.split('.').pop() || '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif', 'heic', 'heif'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}

export const DocumentPreview: FC<DocumentPreviewProps> = ({ url, filename, mimeType, className }) => {
  const kind = detectKind(url, mimeType)
  const displayName = filename || decodeURIComponent(url.split('?')[0].split('/').pop() || 'document')

  if (kind === 'image') {
    return (
      <div className={`w-full bg-gray-100 flex items-center justify-center ${className || 'h-[60vh]'}`}>
        <img
          src={url}
          alt={displayName}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    )
  }

  if (kind === 'pdf') {
    return (
      // `<embed>` with explicit type="application/pdf" makes the browser
      // invoke its PDF plugin regardless of the server's Content-Type.
      // Works for both `raw/upload` and `image/upload` Cloudinary URLs.
      <embed
        src={url}
        type="application/pdf"
        className={`w-full ${className || 'h-[80vh]'}`}
      />
    )
  }

  // Non-previewable: surface filename + download / open-original buttons.
  return (
    <div className={`w-full flex flex-col items-center justify-center bg-gray-50 border border-gray-200 rounded-lg p-8 text-center ${className || 'h-[40vh]'}`}>
      <FileText className="w-12 h-12 text-gray-400 mb-3" />
      <div className="text-sm font-medium text-gray-800 break-words max-w-md">{displayName}</div>
      <div className="text-xs text-gray-500 mt-1">
        {mimeType || 'Unknown format'} — preview not available in browser.
      </div>
      <div className="mt-4 flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open original
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
    </div>
  )
}

/**
 * Small inline thumbnail used in document lists. Cheaper than the full
 * preview — gives an icon + filename without trying to render PDFs.
 */
export const DocumentThumb: FC<{
  filename?: string | null
  mimeType?: string | null
  className?: string
}> = ({ filename, mimeType, className }) => {
  const isImg = (mimeType || '').toLowerCase().startsWith('image/')
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      {isImg ? (
        <ImageIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
      ) : (
        <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
      )}
      <span className="truncate text-sm text-gray-800">{filename || 'Document'}</span>
    </div>
  )
}

export default DocumentPreview
