import { useState } from "react";

type Page = {
  page_id: string;
  page_name: string;
  ig_id?: string;
  ig_username?: string;
};

type Props = {
  brandId: number;
  pages: Page[];
  oauthKey: string;
  onClose: () => void;
  onConnected: () => void;
};

export default function PagePickerModal({ brandId, pages, oauthKey, onClose, onConnected }: Props) {
  const [selections, setSelections] = useState<Record<string, { page: boolean; ig: boolean }>>(() => {
    const init: Record<string, { page: boolean; ig: boolean }> = {};
    for (const p of pages) init[p.page_id] = { page: false, ig: false };
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePage(pageId: string) {
    setSelections((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], page: !prev[pageId].page },
    }));
  }

  function toggleIg(pageId: string) {
    setSelections((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], ig: !prev[pageId].ig },
    }));
  }

  async function handleConnect() {
    setLoading(true);
    setError(null);
    const selectedPages = pages
      .filter((p) => selections[p.page_id]?.page)
      .map((p) => ({ page_id: p.page_id, include_ig: selections[p.page_id]?.ig ?? false }));

    try {
      const res = await fetch("/api/oauth/meta/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: oauthKey, brand_id: brandId, selections: selectedPages }),
      });
      if (!res.ok) throw new Error("Connect failed");
      onConnected();
    } catch (e) {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#141414",
          border: "1px solid #222",
          borderRadius: 10,
          padding: 28,
          width: 480,
          maxWidth: "90vw",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <h3 style={{ margin: "0 0 16px", color: "#e5e5e5" }}>Select Pages to Connect</h3>

        {pages.length === 0 && (
          <p style={{ color: "#888" }}>No pages found for this account.</p>
        )}

        {pages.map((page) => (
          <div
            key={page.page_id}
            style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #222" }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#e5e5e5" }}>
              <input
                type="checkbox"
                checked={selections[page.page_id]?.page ?? false}
                onChange={() => togglePage(page.page_id)}
              />
              <span style={{ fontWeight: 600 }}>{page.page_name}</span>
              <span style={{ color: "#555", fontSize: 12 }}>({page.page_id})</span>
            </label>

            <div style={{ marginLeft: 24, marginTop: 8 }}>
              {page.ig_id ? (
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#aaa" }}>
                  <input
                    type="checkbox"
                    checked={selections[page.page_id]?.ig ?? false}
                    onChange={() => toggleIg(page.page_id)}
                    disabled={!selections[page.page_id]?.page}
                  />
                  <span>@{page.ig_username}</span>
                  <span style={{ color: "#555", fontSize: 12 }}>(Instagram)</span>
                </label>
              ) : (
                <span style={{ color: "#555", fontSize: 13 }}>No Instagram account linked</span>
              )}
            </div>
          </div>
        ))}

        {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            onClick={handleConnect}
            disabled={loading || !pages.some((p) => selections[p.page_id]?.page)}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: "#22c55e",
              color: "#000",
              border: "none",
              borderRadius: 6,
              fontWeight: 700,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Connecting..." : "Connect Selected"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "10px 16px",
              background: "transparent",
              color: "#888",
              border: "1px solid #333",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
