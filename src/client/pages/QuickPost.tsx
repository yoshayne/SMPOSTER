import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { t, btn, input as inputStyle } from "../theme";

type Brand = { id: number; name: string };
type Channel = { id: number; platform: string; external_id: string };

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, color: t.muted, marginBottom: 6, fontWeight: 500 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export default function QuickPost() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<number | "">("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [platforms, setPlatforms] = useState<Set<string>>(new Set());
  const [copy, setCopy] = useState("");
  const [captionFb, setCaptionFb] = useState("");
  const [captionIg, setCaptionIg] = useState("");
  const [scheduledDate, setScheduledDate] = useState(searchParams.get("date") ?? "");
  const [scheduledTime, setScheduledTime] = useState("12:00");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetType, setAssetType] = useState("image");
  const [assetStorageKey, setAssetStorageKey] = useState<string | null>(null);
  const [assetPreviewUrl, setAssetPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/brands").then((r) => r.json()).then(setBrands).catch(() => {});
  }, []);

  useEffect(() => {
    if (!brandId) { setChannels([]); setPlatforms(new Set()); return; }
    fetch(`/api/brands/${brandId}/channels`).then((r) => r.json()).then(setChannels).catch(() => setChannels([]));
  }, [brandId]);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/quick-post/asset", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) { setError("Upload failed"); return; }
    const { storage_key } = await res.json();
    setAssetStorageKey(storage_key);
    setAssetPreviewUrl(URL.createObjectURL(file));
    setAssetType(file.type.startsWith("video/") ? "reel" : "image");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { setAssetFile(file); uploadFile(file); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) { setAssetFile(file); uploadFile(file); }
  }

  async function handleSubmit(status: "approved" | "draft") {
    setError(null);
    if (!brandId) return setError("Select a brand");
    if (!assetStorageKey) return setError("Upload an asset first");
    if (!copy.trim()) return setError("Caption is required");
    if (!scheduledDate) return setError("Scheduled date is required");
    if (platforms.size === 0) return setError("Select at least one platform");

    const scheduledAt = easternToUtcIso(scheduledDate, scheduledTime);
    setSubmitting(true);
    const res = await fetch("/api/quick-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: Number(brandId), asset_storage_key: assetStorageKey, asset_type: assetType, copy, scheduled_at: scheduledAt, status, caption_fb: captionFb || undefined, caption_ig: captionIg || undefined, platforms: Array.from(platforms) }),
    });
    setSubmitting(false);
    if (!res.ok) { const data = await res.json(); setError(data.error ?? "Submit failed"); return; }
    navigate("/approval");
  }

  const hasFb = channels.some((c) => c.platform === "facebook");
  const hasIg = channels.some((c) => c.platform === "instagram");

  return (
    <div>
      <h2 style={{ margin: "0 0 28px", fontSize: 22, fontWeight: 700, color: t.text }}>Quick Post</h2>

      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 20, background: "#fff", border: `1px solid ${t.border}`, borderRadius: 10, padding: 28, boxShadow: t.shadow }}>
        <Field label="Brand">
          <select value={brandId} onChange={(e) => setBrandId(Number(e.target.value) || "")} style={inputStyle}>
            <option value="">Select a brand...</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>

        <Field label="Asset (image or video)">
          <div
            ref={dropRef}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            style={{ border: `2px dashed ${t.border}`, borderRadius: 8, padding: 24, textAlign: "center", cursor: "pointer", background: t.bg, color: t.muted, fontSize: 13, minHeight: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {uploading ? (
              <span>Uploading...</span>
            ) : assetPreviewUrl ? (
              assetType === "image" ? (
                <img src={assetPreviewUrl} style={{ maxHeight: 200, maxWidth: "100%", borderRadius: 6, objectFit: "contain" }} alt="preview" />
              ) : (
                <video src={assetPreviewUrl} controls style={{ maxHeight: 200, maxWidth: "100%", borderRadius: 6 }} />
              )
            ) : (
              <>
                <div style={{ fontSize: 28, color: t.mutedLight }}>↑</div>
                <span>Drag and drop or click to upload</span>
                <span style={{ fontSize: 11, color: t.mutedLight }}>Images and videos accepted</span>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileChange} style={{ display: "none" }} />
          {assetPreviewUrl && (
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              <span style={labelStyle}>Asset type:</span>
              {["image", "reel", "story"].map((ty) => (
                <label key={ty} style={{ fontSize: 13, color: t.text, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="assetType" value={ty} checked={assetType === ty} onChange={() => setAssetType(ty)} style={{ accentColor: t.accent }} />
                  {ty}
                </label>
              ))}
            </div>
          )}
        </Field>

        <Field label="Caption">
          <textarea value={copy} onChange={(e) => setCopy(e.target.value)} rows={4} placeholder="Write your caption..." style={{ ...inputStyle, resize: "vertical" }} />
        </Field>

        {brandId !== "" && (
          <Field label="Platforms">
            {!hasFb && !hasIg ? (
              <p style={{ fontSize: 13, color: t.muted, margin: 0 }}>No connected channels for this brand. Connect channels in Settings.</p>
            ) : (
              <div style={{ display: "flex", gap: 16 }}>
                {hasFb && (
                  <label style={{ fontSize: 13, color: t.text, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                    <input type="checkbox" checked={platforms.has("facebook")} onChange={() => setPlatforms((prev) => { const next = new Set(prev); if (next.has("facebook")) next.delete("facebook"); else next.add("facebook"); return next; })} style={{ accentColor: t.accent }} />
                    Facebook
                  </label>
                )}
                {hasIg && (
                  <label style={{ fontSize: 13, color: t.text, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                    <input type="checkbox" checked={platforms.has("instagram")} onChange={() => setPlatforms((prev) => { const next = new Set(prev); if (next.has("instagram")) next.delete("instagram"); else next.add("instagram"); return next; })} style={{ accentColor: t.accent }} />
                    Instagram
                  </label>
                )}
              </div>
            )}
          </Field>
        )}

        {platforms.has("facebook") && (
          <Field label="Facebook caption override (optional)">
            <textarea value={captionFb} onChange={(e) => setCaptionFb(e.target.value)} rows={2} placeholder="Leave blank to use main caption" style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
        )}
        {platforms.has("instagram") && (
          <Field label="Instagram caption override (optional)">
            <textarea value={captionIg} onChange={(e) => setCaptionIg(e.target.value)} rows={2} placeholder="Leave blank to use main caption" style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Scheduled date (Eastern)">
            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Scheduled time (Eastern)">
            <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} style={inputStyle} />
          </Field>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: t.dangerBg, border: `1px solid #fecaca`, borderRadius: 6, color: t.danger, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={() => handleSubmit("draft")} disabled={submitting} style={{ ...btn.ghost, opacity: submitting ? 0.5 : 1 }}>Save as Draft</button>
          <button onClick={() => handleSubmit("approved")} disabled={submitting} style={{ ...btn.primary, opacity: submitting ? 0.5 : 1 }}>
            {submitting ? "Saving..." : "Schedule Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

function easternToUtcIso(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const etString = guessUtc.toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const match = etString.match(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+)/);
  if (!match) return guessUtc.toISOString();
  const [, m, d, y, h, min] = match.map(Number);
  const diffMs = Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(y, m - 1, d, h === 24 ? 0 : h, min);
  return new Date(guessUtc.getTime() + diffMs).toISOString();
}
