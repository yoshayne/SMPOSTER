import { useState, useEffect, useRef } from "react";

interface Brand {
  id: number;
  name: string;
  style_instructions: string;
}

interface KbAsset {
  id: number;
  brand_id: number;
  kind: "image" | "video";
  storage_key: string;
  notes: string;
  created_at: string;
}

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
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data: Brand[]) => {
        setBrands(data);
        if (data.length > 0) setSelectedBrandId(data[0].id);
      })
      .catch(console.error);
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
    // fetch presigned URLs for each asset
    data.forEach(async (asset) => {
      const r = await fetch(`/api/kb/${asset.id}/url`);
      const { url } = await r.json();
      setPresignedUrls((prev) => ({ ...prev, [asset.id]: url }));
    });
  }

  async function saveStyleInstructions() {
    if (selectedBrandId == null) return;
    setSavingStyle(true);
    await fetch(`/api/brands/${selectedBrandId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style_instructions: styleInstructions }),
    });
    setSavingStyle(false);
    setBrands((prev) =>
      prev.map((b) =>
        b.id === selectedBrandId ? { ...b, style_instructions: styleInstructions } : b
      )
    );
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

  const styles = {
    container: { background: "#0f0f0f", minHeight: "100%", padding: "24px", color: "#e5e5e5" },
    heading: { margin: "0 0 20px", fontSize: "22px", fontWeight: 600 },
    label: { display: "block", fontSize: "12px", color: "#888", marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
    select: { background: "#141414", border: "1px solid #222", color: "#e5e5e5", padding: "8px 12px", borderRadius: "6px", fontSize: "14px", minWidth: "220px" },
    textarea: { background: "#141414", border: "1px solid #222", color: "#e5e5e5", padding: "10px", borderRadius: "6px", fontSize: "14px", width: "100%", boxSizing: "border-box" as const, resize: "vertical" as const, minHeight: "100px" },
    btn: { background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 16px", fontSize: "13px", cursor: "pointer" },
    btnSm: { background: "transparent", color: "#888", border: "1px solid #333", borderRadius: "4px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" },
    btnDanger: { background: "transparent", color: "#ef4444", border: "none", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "2px 6px" },
    section: { marginBottom: "32px" },
    sectionTitle: { fontSize: "13px", color: "#888", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: "12px" },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" },
    card: { background: "#141414", border: "1px solid #222", borderRadius: "8px", overflow: "hidden" as const },
    cardMedia: { width: "100%", height: "140px", objectFit: "cover" as const, display: "block" },
    cardBody: { padding: "8px 10px" },
    badge: { display: "inline-block", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "#1e3a5f", color: "#60a5fa", marginBottom: "4px" },
    badgeVideo: { background: "#1a2e1a", color: "#4ade80" },
    cardNotes: { fontSize: "12px", color: "#666", overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const },
    cardRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
    modal: { background: "#141414", border: "1px solid #222", borderRadius: "12px", padding: "28px", width: "460px", maxWidth: "90vw" },
    dropZone: (over: boolean) => ({ border: `2px dashed ${over ? "#2563eb" : "#333"}`, borderRadius: "8px", padding: "32px", textAlign: "center" as const, cursor: "pointer", marginBottom: "16px", background: over ? "#0d1b38" : "transparent" }),
    modalActions: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" },
    emptyMsg: { color: "#555", fontSize: "14px", padding: "24px 0" },
  };

  if (brands.length === 0) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Knowledge Base</h2>
        <p style={{ color: "#555" }}>Create a brand in Settings first.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Knowledge Base</h2>

      {/* Brand selector */}
      <div style={styles.section}>
        <label style={styles.label}>Brand</label>
        <select
          style={styles.select}
          value={selectedBrandId ?? ""}
          onChange={(e) => setSelectedBrandId(Number(e.target.value))}
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {selectedBrandId != null && (
        <>
          {/* Style instructions */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Style Instructions</div>
            <textarea
              style={styles.textarea}
              value={styleInstructions}
              onChange={(e) => setStyleInstructions(e.target.value)}
              placeholder="Describe the brand's visual style, tone, colors, and aesthetic..."
            />
            <div style={{ marginTop: "8px" }}>
              <button style={styles.btn} onClick={saveStyleInstructions} disabled={savingStyle}>
                {savingStyle ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {/* Style samples */}
          <div style={styles.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={styles.sectionTitle}>Style Samples</div>
              <button style={styles.btn} onClick={() => setShowUploadModal(true)}>+ Upload</button>
            </div>

            {assets.length === 0 ? (
              <p style={styles.emptyMsg}>No style samples yet. Upload some to guide image and video generation.</p>
            ) : (
              <div style={styles.grid}>
                {assets.map((asset) => (
                  <div key={asset.id} style={styles.card}>
                    {presignedUrls[asset.id] ? (
                      asset.kind === "image" ? (
                        <img src={presignedUrls[asset.id]} alt="" style={styles.cardMedia} />
                      ) : (
                        <video src={presignedUrls[asset.id]} controls style={styles.cardMedia} />
                      )
                    ) : (
                      <div style={{ ...styles.cardMedia, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: "12px" }}>
                        Loading…
                      </div>
                    )}
                    <div style={styles.cardBody}>
                      <div style={styles.cardRow}>
                        <span style={{ ...styles.badge, ...(asset.kind === "video" ? styles.badgeVideo : {}) }}>
                          {asset.kind.toUpperCase()}
                        </span>
                        <button style={styles.btnDanger} onClick={() => deleteAsset(asset.id)} title="Delete">✕</button>
                      </div>
                      {asset.notes && <div style={styles.cardNotes}>{asset.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <div style={styles.overlay} onClick={() => setShowUploadModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 20px", fontSize: "16px" }}>Upload Style Sample</h3>

            <div
              style={styles.dropZone(dragOver)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: "none" }}
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
              {uploadFile ? (
                <div style={{ color: "#e5e5e5" }}>
                  <div style={{ fontSize: "14px", marginBottom: "4px" }}>{uploadFile.name}</div>
                  <div style={{ color: "#888", fontSize: "12px" }}>{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
              ) : (
                <div style={{ color: "#555" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>↑</div>
                  <div style={{ fontSize: "14px" }}>Drag & drop or click to select</div>
                  <div style={{ fontSize: "12px", marginTop: "4px" }}>Images (JPG, PNG, GIF, WebP) or video (MP4, MOV, WebM) · max 50MB</div>
                </div>
              )}
            </div>

            <label style={styles.label}>Notes (optional)</label>
            <textarea
              style={{ ...styles.textarea, minHeight: "60px" }}
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              placeholder="Describe this sample…"
            />

            <div style={styles.modalActions}>
              <button style={styles.btnSm} onClick={() => { setShowUploadModal(false); setUploadFile(null); setUploadNotes(""); }}>
                Cancel
              </button>
              <button style={styles.btn} onClick={handleUpload} disabled={!uploadFile || uploading}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
