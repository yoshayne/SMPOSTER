import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";

type ImportResult = {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

type UploadState = "idle" | "uploading" | "result";

export default function Upload() {
  const navigate = useNavigate();
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.endsWith(".csv")) setFile(dropped);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) return;
    setState("uploading");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/csv/upload", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
      setState("result");
    } catch {
      setResult({ imported: 0, skipped: 0, errors: [{ row: 0, message: "Upload failed" }] });
      setState("result");
    }
  };

  const handleReset = () => {
    setState("idle");
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const dropZoneBorder = dragOver ? "#22c55e" : "#444";

  return (
    <div style={{ padding: "32px", maxWidth: "600px", color: "#e5e7eb" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 600, marginBottom: "4px" }}>
        Upload Posts via CSV
      </h1>
      <hr style={{ border: "none", borderTop: "1px solid #333", marginBottom: "24px" }} />

      {state === "idle" || state === "uploading" ? (
        <>
          <div style={{ marginBottom: "20px" }}>
            <button
              onClick={() => window.open("/api/csv/template")}
              style={{
                background: "#1f2937",
                color: "#e5e7eb",
                border: "1px solid #374151",
                borderRadius: "6px",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Download Template
            </button>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dropZoneBorder}`,
              borderRadius: "8px",
              padding: "48px 24px",
              textAlign: "center",
              cursor: "pointer",
              marginBottom: "20px",
              background: "#1a1a1a",
              transition: "border-color 0.2s",
            }}
          >
            <div style={{ fontSize: "15px", color: "#9ca3af", marginBottom: "8px" }}>
              Drop CSV file here
            </div>
            <div style={{ fontSize: "13px", color: "#6b7280" }}>or click to select</div>
            {file && (
              <div style={{ marginTop: "12px", fontSize: "13px", color: "#22c55e" }}>
                {file.name}
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {state === "uploading" ? (
            <div style={{ color: "#9ca3af", fontSize: "14px" }}>Importing...</div>
          ) : (
            <button
              onClick={handleUpload}
              disabled={!file}
              style={{
                background: file ? "#22c55e" : "#374151",
                color: file ? "#000" : "#6b7280",
                border: "none",
                borderRadius: "6px",
                padding: "10px 20px",
                cursor: file ? "pointer" : "not-allowed",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Upload & Import
            </button>
          )}
        </>
      ) : (
        result && (
          <>
            <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
              Import Complete
            </h2>
            <div style={{ marginBottom: "8px", fontSize: "15px" }}>
              <span style={{ color: "#22c55e" }}>+</span> {result.imported} posts imported as drafts
            </div>
            {result.skipped > 0 && (
              <div style={{ marginBottom: "8px", fontSize: "15px", color: "#f59e0b" }}>
                ! {result.skipped} rows skipped
              </div>
            )}
            {result.errors.length > 0 && (
              <div style={{ marginTop: "16px", marginBottom: "16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#f87171" }}>
                  Errors:
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {result.errors.map((e, i) => (
                    <li key={i} style={{ fontSize: "13px", color: "#fca5a5", marginBottom: "4px" }}>
                      {e.row > 0 ? `Row ${e.row}: ` : ""}{e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
              <button
                onClick={handleReset}
                style={{
                  background: "#1f2937",
                  color: "#e5e7eb",
                  border: "1px solid #374151",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Upload Another
              </button>
              <button
                onClick={() => navigate("/approval")}
                style={{
                  background: "#22c55e",
                  color: "#000",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Go to Approval
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}
