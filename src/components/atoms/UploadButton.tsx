import { useState, useEffect } from "react";
import { storageApi } from "../../services/api";

const UploadInput = ({
  imageUrl,
  setImageUrl,
  width,
}: {
  imageUrl: string | null;
  setImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  width?: "auto" | "full" | "fixed";
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
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadState("idle");
      setError(null);
      setProgress(0);

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

      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const encodedFileName = encodeURIComponent(sanitizedFileName);
      
      setProgress(30);
      const response = await fetch(
        `${storageApi.getPresignedUrl}?fileName=${encodedFileName}&fileType=${file.type}`
      );

      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, fileUrl } = await response.json();
      setProgress(50);

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
          "x-amz-acl": "public-read",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      setProgress(100);
      setImageUrl(fileUrl);
      setUploadState("uploaded");
    } catch (err) {
      setUploadState("error");
      setError(err instanceof Error ? err.message : "Upload failed");
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
          <p className="text-xs text-gray-500">Any file type accepted (Max 10MB)</p>
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