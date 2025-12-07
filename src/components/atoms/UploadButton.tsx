import { useState } from "react";
import { storageApi } from "../../services/api";

const UploadInput = ({
  imageUrl,
  setImageUrl,
  width,
}: {
  imageUrl: string | null;
  setImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  // size?: "small" | "medium" | "large";
  width?: "auto" | "full" | "fixed";
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "uploaded">("idle");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadState("idle");
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploadState("uploading");
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const encodedFileName = encodeURIComponent(sanitizedFileName);
    
    const response = await fetch(
      `${storageApi.getPresignedUrl}?fileName=${encodedFileName}&fileType=${file.type}`
    );
    const { uploadUrl, fileUrl } = await response.json();

    await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
        "x-amz-acl": "public-read",
      },
    });

    console.log("File uploaded to:", fileUrl);

    setImageUrl(fileUrl);
    setUploadState("uploaded");
  };

  return (
    <div className={`relative ${width == 'auto' ? 'auto' : width == 'fixed' ? 'md:w-[150px] lg:w-[300px]' : 'w-full'}`}>
      <input
        type="file"
        accept="image/*,video/*"
        className="hidden"
        id="fileInput"
        onChange={handleFileChange}
      />
      <label
        htmlFor="fileInput"
        className="block w-full p-2 border rounded-lg bg-white text-gray-700 cursor-pointer border-gray-300 hover:border-gray-400 transition"
      >
        {imageUrl ? (
          <span className="text-sm text-gray-700 truncate block">{imageUrl}</span>
        ) : file ? (
          <span className="text-sm text-gray-700 truncate block">{file.name}</span>
        ) : (
          <span className="text-gray-400">Select a file</span>
        )}
      </label>
      <button
        onClick={handleUpload}
        disabled={!file || uploadState === "uploading" || uploadState === "uploaded"}
        className="absolute flex gap-2 right-1 top-1/2 transform -translate-y-1/2 bg-blue-500 text-white px-3 py-1 rounded-lg text-sm font-semibold transition hover:bg-blue-600 disabled:bg-gray-400"
      >
        {uploadState === "uploaded" ? "uploaded" : uploadState === "uploading" ? "uploading" : `Get URL`}
      </button>
    </div>
  );
};

export default UploadInput;