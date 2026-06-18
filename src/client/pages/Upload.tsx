import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { t, btn } from "../theme";

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

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(true); };
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

  return (
    <div>
      <h2 style={{ margin: "0 0 28px", fontSize: 22, fontWeight: 700, color: t.text }}>Upload Posts via CSV</h2>

      {state === "idle" || state === "uploading" ? (
        <>
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => window.open("/api/csv/template")} style={btn.ghost}>
              Download Template
            </button>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragOver ? t.accent : t.border}`,
              borderRadius: 10,
              padding: "48px 24px",
              textAlign: "center",
              cursor: "pointer",
              marginBottom: 20,
              background: dragOver ? t.accentLight : "#fff",
              transition: "border-color 0.2s, background 0.2s",
              maxWidth: 520,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8, color: t.mutedLight }}>↑</div>
            <div style={{ fontSize: 15, color: t.muted, marginBottom: 4 }}>Drop CSV file here</div>
            <div style={{ fontSize: 13, color: t.mutedLight }}>or click to select</div>
            {file && (
              <div style={{ marginTop: 12, fontSize: 13, color: t.success, fontWeight: 600 }}>
                {file.name}
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileChange} />

          {state === "uploading" ? (
            <div style={{ color: t.muted, fontSize: 14 }}>Importing...</div>
          ) : (
            <button onClick={handleUpload} disabled={!file} style={{ ...btn.primary, opacity: file ? 1 : 0.5, cursor: file ? "pointer" : "not-allowed" }}>
              Upload & Import
            </button>
          )}
        </>
      ) : (
        result && (
          <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 10, padding: 28, maxWidth: 520, boxShadow: t.shadow }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: t.text }}>Import Complete</h3>
            <div style={{ marginBottom: 8, fontSize: 15, color: t.success }}>
              + {result.imported} posts imported as drafts
            </div>
            {result.skipped > 0 && (
              <div style={{ marginBottom: 8, fontSize: 15, color: t.warning }}>
                ! {result.skipped} rows skipped
              </div>
            )}
            {result.errors.length > 0 && (
              <div style={{ marginTop: 16, marginBottom: 16, padding: "12px 16px", background: t.dangerBg, borderRadius: 8, border: `1px solid #fecaca` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: t.danger }}>Errors:</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {result.errors.map((e, i) => (
                    <li key={i} style={{ fontSize: 13, color: t.danger, marginBottom: 4 }}>
                      {e.row > 0 ? `Row ${e.row}: ` : ""}{e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button onClick={handleReset} style={btn.ghost}>Upload Another</button>
              <button onClick={() => navigate("/approval")} style={btn.primary}>Go to Approval</button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
