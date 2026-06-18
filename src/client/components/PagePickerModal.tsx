import { useState } from "react";
import { t, btn } from "../theme";

type Page = { page_id: string; page_name: string; ig_id?: string; ig_username?: string; };

type Props = { brandId: number; pages: Page[]; oauthKey: string; onClose: () => void; onConnected: () => void; };

export default function PagePickerModal({ brandId, pages, oauthKey, onClose, onConnected }: Props) {
  const [selections, setSelections] = useState<Record<string, { page: boolean; ig: boolean }>>(() => {
    const init: Record<string, { page: boolean; ig: boolean }> = {};
    for (const p of pages) init[p.page_id] = { page: false, ig: false };
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePage(pageId: string) {
    setSelections((prev) => ({ ...prev, [pageId]: { ...prev[pageId], page: !prev[pageId].page } }));
  }

  function toggleIg(pageId: string) {
    setSelections((prev) => ({ ...prev, [pageId]: { ...prev[pageId], ig: !prev[pageId].ig } }));
  }

  async function handleConnect() {
    setLoading(true);
    setError(null);
    const selectedPages = pages.filter((p) => selections[p.page_id]?.page).map((p) => ({ page_id: p.page_id, include_ig: selections[p.page_id]?.ig ?? false }));
    try {
      const res = await fetch("/api/oauth/meta/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: oauthKey, brand_id: brandId, selections: selectedPages }) });
      if (!res.ok) throw new Error("Connect failed");
      onConnected();
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 12, padding: 28, width: 480, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <h3 style={{ margin: "0 0 20px", color: t.text, fontSize: 16, fontWeight: 700 }}>Select Pages to Connect</h3>

        {pages.length === 0 && <p style={{ color: t.muted }}>No pages found for this account.</p>}

        {pages.map((page) => (
          <div key={page.page_id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${t.borderLight}` }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: t.text }}>
              <input type="checkbox" checked={selections[page.page_id]?.page ?? false} onChange={() => togglePage(page.page_id)} style={{ accentColor: t.accent }} />
              <span style={{ fontWeight: 600 }}>{page.page_name}</span>
              <span style={{ color: t.mutedLight, fontSize: 12 }}>({page.page_id})</span>
            </label>

            <div style={{ marginLeft: 24, marginTop: 8 }}>
              {page.ig_id ? (
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: t.muted }}>
                  <input type="checkbox" checked={selections[page.page_id]?.ig ?? false} onChange={() => toggleIg(page.page_id)} disabled={!selections[page.page_id]?.page} style={{ accentColor: t.accent }} />
                  <span>@{page.ig_username}</span>
                  <span style={{ color: t.mutedLight, fontSize: 12 }}>(Instagram)</span>
                </label>
              ) : (
                <span style={{ color: t.mutedLight, fontSize: 13 }}>No Instagram account linked</span>
              )}
            </div>
          </div>
        ))}

        {error && <p style={{ color: t.danger, fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={handleConnect} disabled={loading || !pages.some((p) => selections[p.page_id]?.page)} style={{ ...btn.primary, flex: 1, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Connecting..." : "Connect Selected"}
          </button>
          <button onClick={onClose} style={btn.ghost}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
