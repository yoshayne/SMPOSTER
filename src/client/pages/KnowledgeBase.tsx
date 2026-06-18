import { useState, useEffect, useRef } from "react";
import { t, btn, input as inputStyle } from "../theme";

interface Brand { id: number; name: string; style_instructions: string; }
interface KbAsset { id: number; brand_id: number; kind: "image" | "video"; storage_key: string; notes: string; created_at: string; }

export default function KnowledgeBase() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [assets, setAssets] = useState<KbAsset[]>([]);
  const [styleInstructions, setStyleInstructions] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [presignedUrls, setPresignedUrls] = useState<Record<number, string>>({});
  const [savingStyle, setSavingStyle] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/brands").then((r) => r.json()).then((data: Brand[]) => {
      setBrands(data);
      if (data.length > 0) setSelectedBrandId(data[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedBrandId == null) return;
    const brand = brands.find((b) => b.id === selectedBrandId);
    setStyleInstructions(brand?.style_instructions || "");
    loadAssets(selectedBrandId);
  }, [selectedBrandId, brands]);

  async function loadAssets(brandId: number) {
    const res = await fetch(`/api/brands/${brandId}/kb`);
    const data: KbAsset[] = await res.json();
    setAssets(data);
    setPresignedUrls({});
    data.forEach(async (asset) => {
      const r = await fetch(`/api/kb/${asset.id}/url`);
      const { url } = await r.json();
      setPresignedUrls((prev) => ({ ...prev, [asset.id]: url }));
    });
  }

  async function saveStyleInstructions() {
    if (selectedBrandId == null) return;
    setSavingStyle(true);
    await fetch(`/api/brands/${selectedBrandId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ style_instructions: styleInstructions }) });
    setSavingStyle(false);
    setBrands((prev) => prev.map((b) => b.id === selectedBrandId ? { ...b, style_instructions: styleInstructions } : b));
  }

  async function deleteAsset(id: number) {
    await fetch(`/api/kb/${id}`, { method: "DELETE" });
    if (selectedBrandId != null) loadAssets(selectedBrandId);
  }

  async function handleUpload() {
    if (!uploadFile || selectedBrandId == null) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("notes", uploadNotes);
    await fetch(`/api/brands/${selectedBrandId}/kb`, { method: "POST", body: fd });
    setUploading(false);
    setShowUploadModal(false);
    setUploadFile(null);
    setUploadNotes("");
    loadAssets(selectedBrandId);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadFile(file);
  }

  if (brands.length === 0) {
    return (
      <div>
        <h2 style={{ margin: "0 0 28px", fontSize: 22, fontWeight: 700, color: t.text }}>Knowledge Base</h2>
        <p style={{ color: t.muted }}>Create a brand in Settings first.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 28px", fontSize: 22, fontWeight: 700, color: t.text }}>Knowledge Base</h2>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 13, color: t.muted, marginBottom: 6 }}>Brand</label>
        <select style={{ ...inputStyle, width: "auto", minWidth: 220 }} value={selectedBrandId ?? ""} onChange={(e) => setSelectedBrandId(Number(e.target.value))}>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {selectedBrandId != null && (
        <>
          <section style={{ marginBottom: 32, background: "#fff", border: `1px solid ${t.border}`, borderRadius: 10, padding: 24, boxShadow: t.shadow }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: t.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>Style Instructions</h3>
            <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 100, marginBottom: 12 }} value={styleInstructions} onChange={(e) => setStyleInstructions(e.target.value)} placeholder="Describe the brand's visual style, tone, colors, and aesthetic..." />
            <button style={btn.primary} onClick={saveStyleInstructions} disabled={savingStyle}>
              {savingStyle ? "Saving…" : "Save"}
            </button>
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>Style Samples</h3>
              <button style={btn.primary} onClick={() => setShowUploadModal(true)}>+ Upload</button>
            </div>

            {assets.length === 0 ? (
              <p style={{ color: t.muted, fontSize: 14 }}>No style samples yet. Upload some to guide image and video generation.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                {assets.map((asset) => (
                  <div key={asset.id} style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 8, overflow: "hidden", boxShadow: t.shadow }}>
                    {presignedUrls[asset.id] ? (
                      asset.kind === "image" ? (
                        <img src={presignedUrls[asset.id]} alt="" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
                      ) : (
                        <video src={presignedUrls[asset.id]} controls style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
                      )
                    ) : (
                      <div style={{ width: "100%", height: 140, background: t.borderLight, display: "flex", alignItems: "center", justifyContent: "center", color: t.mutedLight, fontSize: 12 }}>Loading…</div>
                    )}
                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: asset.kind === "video" ? "#dcfce7" : "#dbeafe", color: asset.kind === "video" ? t.success : "#3b82f6", fontWeight: 600 }}>
                          {asset.kind.toUpperCase()}
                        </span>
                        <button onClick={() => deleteAsset(asset.id)} style={{ background: "none", border: "none", cursor: "pointer", color: t.danger, fontSize: 14, padding: "2px 6px" }}>✕</button>
                      </div>
                      {asset.notes && <div style={{ fontSize: 12, color: t.muted, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {showUploadModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowUploadModal(false)}>
          <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 12, padding: 28, width: 460, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: t.text }}>Upload Style Sample</h3>

            <div
              style={{ border: `2px dashed ${dragOver ? t.accent : t.border}`, borderRadius: 8, padding: 32, textAlign: "center" as const, cursor: "pointer", marginBottom: 16, background: dragOver ? t.accentLight : t.bg, transition: "border-color 0.2s" }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
              {uploadFile ? (
                <div>
                  <div style={{ fontSize: 14, color: t.text, marginBottom: 4 }}>{uploadFile.name}</div>
                  <div style={{ color: t.muted, fontSize: 12 }}>{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 28, color: t.mutedLight, marginBottom: 8 }}>↑</div>
                  <div style={{ fontSize: 14, color: t.muted }}>Drag & drop or click to select</div>
                  <div style={{ fontSize: 12, marginTop: 4, color: t.mutedLight }}>Images (JPG, PNG, GIF, WebP) or video (MP4, MOV, WebM) · max 50MB</div>
                </div>
              )}
            </div>

            <label style={{ display: "block", fontSize: 13, color: t.muted, marginBottom: 6 }}>Notes (optional)</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", marginBottom: 20 }} value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} placeholder="Describe this sample…" />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btn.ghost} onClick={() => { setShowUploadModal(false); setUploadFile(null); setUploadNotes(""); }}>Cancel</button>
              <button style={btn.primary} onClick={handleUpload} disabled={!uploadFile || uploading}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
