import { useState, useEffect } from "react";
import { storageApi } from "../../services/api";
import { pickCloudinaryResourceType } from "@/utils/cloudinaryUpload";

// =============================================================================
// UploadInput — picks a file from the device and uploads it directly to
// Cloudinary using a server-issued signature. The previous version POSTed to
// `${baseURL}/storage/presigned` which doesn't exist on the server (only
// `/storage/sign` does), so every upload silently 404'd and the document AI
// page could never persist anything. We now mirror the mobile-app flow:
//
//   1. GET /storage/sign?folder=documents  →  { timestamp, signature, apiKey,
//                                              cloudName, folder }
//   2. POST FormData(file + signed params)  →
//        https://api.cloudinary.com/v1_1/{cloudName}/{image|raw}/upload
//      (resource_type=image for images, raw for PDFs/DOCX so Cloudinary
//      doesn't reject non-image bytes on the /image/upload endpoint).
//   3. Hand the resulting `secure_url` back to the caller via setImageUrl.
// =============================================================================

/**
 * Metadata captured from the picked File at selection time. Cloudinary's
 * `raw/upload` endpoint does NOT preserve the original filename / extension
 * in the returned `secure_url` by default — derive-from-URL gives e.g.
 * "abcd1234" with no extension, which the server then maps to
 * `application/octet-stream` and the OCR dispatcher rejects. We hand the
 * caller the real `file.type` / `file.name` so they can persist the right
 * mime type on the Document row.
 */
export interface UploadedFileMeta {
  filename: string;
  mimeType: string;
  size: number;
}

const UploadInput = ({
  imageUrl,
  setImageUrl,
  width,
  onFileMeta,
  accept,
}: {
  imageUrl: string | null;
  setImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  width?: "auto" | "full" | "fixed";
  /** Optional — invoked with the original File metadata once selected and again with `null` on remove. */
  onFileMeta?: (meta: UploadedFileMeta | null) => void;
  /**
   * MIME / extension filter passed straight to the native file picker.
   * Defaults to undefined (any file). Pass `"image/*"` for avatar /
   * profile uploads where only images make sense. Everywhere else we
   * leave this undefined so the user can attach anything — PDFs, DOCX,
   * spreadsheets, presentations — and the platform will store + preview
   * what it can and fall back to download for the rest.
   */
  accept?: string;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "uploaded" | "error">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Auto-upload when file is selected
  useEffect(() => {
    if (file && uploadState === "idle") {
      handleUpload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadState("idle");
      setError(null);
      setProgress(0);
      // Hand the caller the real mime type — URL-derived extensions are
      // unreliable for Cloudinary `raw` uploads (no extension preserved).
      onFileMeta?.({
        filename: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
        size: selectedFile.size,
      });

      // Generate preview for images
      if (selectedFile.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setPreview(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploadState("uploading");
      setProgress(10);

      // Step 1: ask our server to mint a Cloudinary signature scoped to
      // the `documents` folder. The signing key never leaves the server.
      const sigRes = await storageApi.getSignature("documents");
      const sig = sigRes.data as {
        timestamp: number;
        signature: string;
        apiKey: string;
        cloudName: string;
        folder: string;
      };
      if (!sig?.signature || !sig?.cloudName) {
        throw new Error("Could not obtain upload signature from server");
      }
      setProgress(30);

      // Step 2: POST the file straight to Cloudinary with the signed
      // params. `pickCloudinaryResourceType` keeps PDFs on `image/upload`
      // (Cloudinary then serves them with `Content-Type: application/pdf`
      // so the browser's built-in PDF viewer can render them inline);
      // images go to `image/upload` too; DOCX / XLSX / TXT / ZIP /…
      // fall through to `raw/upload`. Without the PDF special-case the
      // file uploads fine but every download throws "Failed to load PDF
      // document" because Cloudinary defaults raw to octet-stream.
      const resourceType = pickCloudinaryResourceType(file.type);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("timestamp", String(sig.timestamp));
      formData.append("signature", sig.signature);
      formData.append("api_key", sig.apiKey);
      formData.append("folder", sig.folder);

      setProgress(50);
      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloudName)}/${resourceType}/upload`,
        { method: "POST", body: formData }
      );

      const uploadData = await uploadResponse.json().catch(() => ({} as any));
      if (!uploadResponse.ok || !uploadData?.secure_url) {
        throw new Error(
          uploadData?.error?.message ||
            `Cloudinary upload failed (status ${uploadResponse.status})`,
        );
      }

      setProgress(100);
      setImageUrl(uploadData.secure_url);
      setUploadState("uploaded");
    } catch (err) {
      setUploadState("error");
      setError(err instanceof Error ? err.message : "Upload failed");
      // eslint-disable-next-line no-console
      console.error("Upload error:", err);
    }
  };

  const handleRemove = () => {
    setFile(null);
    setImageUrl(null);
    setUploadState("idle");
    setPreview(null);
    setError(null);
    setProgress(0);
    onFileMeta?.(null);
  };

  const getFileIcon = () => {
    if (!file) return null;
    if (file.type.startsWith("image/")) return "🖼️";
    if (file.type.startsWith("video/")) return "🎥";
    return "📄";
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className={`relative ${width == 'auto' ? 'auto' : width == 'fixed' ? 'md:w-[150px] lg:w-[300px]' : 'w-full'}`}>
      <input
        type="file"
        className="hidden"
        id="fileInput"
        accept={accept}
        onChange={handleFileChange}
        disabled={uploadState === "uploading"}
      />

      {!file && !imageUrl && (
        <label
          htmlFor="fileInput"
          className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-lg cursor-pointer transition-all
            border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-primary/50"
        >
          <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="mb-1 text-sm font-medium text-gray-700">
            <span className="text-primary">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500">PDF, DOCX, or images (Max 10MB)</p>
        </label>
      )}

      {(file || imageUrl) && (
        <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
          {/* Preview Section */}
          {preview && uploadState !== "error" && (
            <div className="relative h-32 bg-gray-100 flex items-center justify-center overflow-hidden">
              <img
                src={preview}
                alt="Preview"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}

          {/* File Info Section */}
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl flex-shrink-0 mt-1">
                {getFileIcon()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {file?.name || "Uploaded file"}
                </p>
                {file && (
                  <p className="text-xs text-gray-500 mt-1">
                    {formatFileSize(file.size)}
                  </p>
                )}

                {/* Upload States */}
                {uploadState === "uploading" && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-primary">Uploading...</span>
                      <span className="text-xs text-gray-600">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {uploadState === "uploaded" && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center gap-1.5 text-green-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-xs font-medium">Uploaded successfully</span>
                    </div>
                  </div>
                )}

                {uploadState === "error" && error && (
                  <div className="mt-2">
                    <div className="flex items-center gap-1.5 text-red-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="text-xs font-medium">{error}</span>
                    </div>
                    <button
                      onClick={handleUpload}
                      className="mt-2 text-xs text-primary hover:text-primary/80 font-medium"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>

              {/* Remove Button */}
              {uploadState !== "uploading" && (
                <button
                  onClick={handleRemove}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove file"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Change File Button */}
            {uploadState === "uploaded" && (
              <label
                htmlFor="fileInput"
                className="mt-3 block text-center text-xs text-primary hover:text-primary/80 cursor-pointer font-medium"
              >
                Change file
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadInput;
