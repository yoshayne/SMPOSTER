import { useEffect, useState } from "react";
import PagePickerModal from "../components/PagePickerModal";

type Brand = { id: number; name: string; style_instructions: string; created_at: string };
type Channel = { id: number; platform: string; external_id: string; is_active: boolean; token_expires_at: string | null };
type Page = { page_id: string; page_name: string; ig_id?: string; ig_username?: string };

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "#0f0f0f",
  border: "1px solid #333",
  borderRadius: 6,
  color: "#e5e5e5",
  fontSize: 14,
  boxSizing: "border-box",
};

const btnStyle = (variant: "primary" | "ghost" | "danger" = "primary"): React.CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 6,
  border: variant === "ghost" ? "1px solid #333" : "none",
  background: variant === "primary" ? "#22c55e" : variant === "danger" ? "#ef4444" : "transparent",
  color: variant === "primary" ? "#000" : "#e5e5e5",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
});

export default function Settings() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [channelsMap, setChannelsMap] = useState<Record<number, Channel[]>>({});
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [brandForm, setBrandForm] = useState({ name: "", style_instructions: "" });
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [pendingOAuth, setPendingOAuth] = useState<{ brandId: number; pages: Page[]; key: string } | null>(null);
  const [settings, setSettings] = useState<{ monthly_budget_cap: number | null; current_spend: number }>({ monthly_budget_cap: null, current_spend: 0 });
  const [budgetInput, setBudgetInput] = useState("");

  async function loadBrands() {
    const res = await fetch("/api/brands");
    const data: Brand[] = await res.json();
    setBrands(data);

    const map: Record<number, Channel[]> = {};
    await Promise.all(
      data.map(async (b) => {
        const r = await fetch(`/api/brands/${b.id}/channels`);
        map[b.id] = await r.json();
      })
    );
    setChannelsMap(map);
  }

  async function loadSettings() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings({ monthly_budget_cap: data.monthly_budget_cap, current_spend: data.current_spend ?? 0 });
    setBudgetInput(data.monthly_budget_cap != null ? String(data.monthly_budget_cap) : "");
  }

  useEffect(() => {
    loadBrands();
    loadSettings();

    const params = new URLSearchParams(window.location.search);
    const oauthKey = params.get("oauth_key");
    if (oauthKey) {
      fetch(`/api/oauth/meta/pending?key=${oauthKey}`)
        .then((r) => r.json())
        .then((data) => {
          setPendingOAuth({ brandId: Number(data.brand_id), pages: data.pages, key: oauthKey });
          setShowPickerModal(true);
        })
        .catch(() => {});
    }
  }, []);

  function openNewBrand() {
    setEditingBrand(null);
    setBrandForm({ name: "", style_instructions: "" });
    setShowBrandModal(true);
  }

  function openEditBrand(brand: Brand) {
    setEditingBrand(brand);
    setBrandForm({ name: brand.name, style_instructions: brand.style_instructions ?? "" });
    setShowBrandModal(true);
  }

  async function saveBrand() {
    if (editingBrand) {
      await fetch(`/api/brands/${editingBrand.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brandForm),
      });
    } else {
      await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brandForm),
      });
    }
    setShowBrandModal(false);
    loadBrands();
  }

  async function deleteBrand(id: number) {
    if (!confirm("Delete this brand and all its channels?")) return;
    await fetch(`/api/brands/${id}`, { method: "DELETE" });
    loadBrands();
  }

  async function disconnectChannel(id: number) {
    await fetch(`/api/channels/${id}`, { method: "DELETE" });
    loadBrands();
  }

  async function saveBudget() {
    const cap = budgetInput ? Number(budgetInput) : null;
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthly_budget_cap: cap }),
    });
    loadSettings();
  }

  function handleOAuthConnected() {
    setShowPickerModal(false);
    setPendingOAuth(null);
    history.replaceState(null, "", window.location.pathname);
    loadBrands();
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 28px", color: "#e5e5e5" }}>Settings</h2>

      {/* BRANDS */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "#e5e5e5" }}>Brands</h3>
          <button onClick={openNewBrand} style={btnStyle("primary")}>+ New Brand</button>
        </div>

        {brands.length === 0 && (
          <p style={{ color: "#555" }}>No brands yet. Create one to get started.</p>
        )}

        {brands.map((brand) => (
          <div
            key={brand.id}
            style={{ background: "#141414", border: "1px solid #222", borderRadius: 8, padding: 16, marginBottom: 12 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{brand.name}</span>
              <button onClick={() => openEditBrand(brand)} style={btnStyle("ghost")}>Edit</button>
              <button onClick={() => deleteBrand(brand.id)} style={btnStyle("danger")}>Delete</button>
            </div>

            {(channelsMap[brand.id] ?? []).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {(channelsMap[brand.id] ?? []).map((ch) => (
                  <div key={ch.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}>
                    <span style={{ color: ch.is_active ? "#22c55e" : "#555", fontSize: 10 }}>●</span>
                    <span style={{ color: "#aaa", textTransform: "capitalize" }}>{ch.platform}</span>
                    <span style={{ color: "#555" }}>{ch.external_id}</span>
                    <button
                      onClick={() => disconnectChannel(ch.id)}
                      style={{ marginLeft: "auto", padding: "2px 8px", background: "transparent", border: "1px solid #333", borderRadius: 4, color: "#888", cursor: "pointer", fontSize: 12 }}
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => { window.location.href = `/api/oauth/meta/start?brand_id=${brand.id}`; }}
              style={{ ...btnStyle("ghost"), fontSize: 12, marginTop: 4 }}
            >
              + Connect Meta Page / IG
            </button>
          </div>
        ))}
      </section>

      {/* BUDGET */}
      <section>
        <h3 style={{ margin: "0 0 12px", color: "#e5e5e5" }}>Budget</h3>
        <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 8, padding: 16, maxWidth: 420 }}>
          <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "#888" }}>Spent this month</span>
            <span style={{ color: "#e5e5e5" }}>
              <strong>${Number(settings.current_spend).toFixed(2)}</strong>
              {settings.monthly_budget_cap != null && (
                <span style={{ color: "#555" }}> / ${Number(settings.monthly_budget_cap).toFixed(2)}</span>
              )}
            </span>
          </div>
          {settings.monthly_budget_cap != null && (() => {
            const pct = Math.min(100, (Number(settings.current_spend) / Number(settings.monthly_budget_cap)) * 100);
            const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
            return (
              <div style={{ height: 6, background: "#222", borderRadius: 3, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.3s" }} />
              </div>
            );
          })()}
          {settings.monthly_budget_cap == null && <div style={{ marginBottom: 16 }} />}
          <label style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>Monthly budget cap ($)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="Unlimited"
              style={{ ...inputStyle, width: 160 }}
            />
            <button onClick={saveBudget} style={btnStyle("primary")}>Save</button>
          </div>
          {settings.monthly_budget_cap == null && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#555" }}>No cap set — generation is unlimited.</p>
          )}
        </div>
      </section>

      {/* BRAND MODAL */}
      {showBrandModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 10, padding: 28, width: 460, maxWidth: "90vw" }}>
            <h3 style={{ margin: "0 0 20px", color: "#e5e5e5" }}>{editingBrand ? "Edit Brand" : "New Brand"}</h3>

            <label style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>Name</label>
            <input
              value={brandForm.name}
              onChange={(e) => setBrandForm((p) => ({ ...p, name: e.target.value }))}
              style={{ ...inputStyle, marginBottom: 16 }}
              placeholder="Brand name"
            />

            <label style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>Style Instructions</label>
            <textarea
              value={brandForm.style_instructions}
              onChange={(e) => setBrandForm((p) => ({ ...p, style_instructions: e.target.value }))}
              rows={5}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 20 }}
              placeholder="Describe the brand's visual style, tone, color palette..."
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowBrandModal(false)} style={btnStyle("ghost")}>Cancel</button>
              <button onClick={saveBrand} style={btnStyle("primary")}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* PAGE PICKER MODAL */}
      {showPickerModal && pendingOAuth && (
        <PagePickerModal
          brandId={pendingOAuth.brandId}
          pages={pendingOAuth.pages}
          oauthKey={pendingOAuth.key}
          onClose={() => { setShowPickerModal(false); setPendingOAuth(null); history.replaceState(null, "", window.location.pathname); }}
          onConnected={handleOAuthConnected}
        />
      )}
    </div>
  );
}
