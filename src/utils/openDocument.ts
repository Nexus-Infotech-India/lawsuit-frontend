/**
 * Open an uploaded file through the in-app `/preview` route in a new
 * tab. Use this instead of `window.open(url)` or
 * `<a href={url} target="_blank">` for document URLs.
 *
 * Why: opening a Cloudinary URL directly relies on the browser's
 * built-in viewers, which strictly check `Content-Type`. Files uploaded
 * to `/raw/upload/` are served as `application/octet-stream`, so
 * Chrome's PDF viewer rejects them ("Failed to load PDF document").
 * `/preview` renders the file via `<embed type="application/pdf">`
 * which invokes the PDF plugin regardless of Content-Type, so both
 * legacy `raw` files and newer `image` files preview correctly.
 *
 * For image URLs the preview page just embeds an `<img>` — same UX as
 * before, but consistent navigation.
 *
 * For non-previewable formats (DOCX, XLSX, ZIP, …) the preview page
 * shows a download card with an "Open original" link, so the user can
 * still grab the file.
 */
export function openDocumentInNewTab(opts: {
  url: string
  filename?: string | null
  mimeType?: string | null
}) {
  if (!opts.url) return
  const params = new URLSearchParams({ url: opts.url })
  if (opts.filename) params.set('name', opts.filename)
  if (opts.mimeType) params.set('mime', opts.mimeType)
  window.open(`/preview?${params.toString()}`, '_blank', 'noopener,noreferrer')
}

/** Build an `<a href>` value that opens `/preview` for the given doc. */
export function previewHref(opts: {
  url: string
  filename?: string | null
  mimeType?: string | null
}): string {
  if (!opts.url) return '#'
  const params = new URLSearchParams({ url: opts.url })
  if (opts.filename) params.set('name', opts.filename)
  if (opts.mimeType) params.set('mime', opts.mimeType)
  return `/preview?${params.toString()}`
}
