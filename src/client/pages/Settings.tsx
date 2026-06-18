import { useEffect, useState } from "react";
import PagePickerModal from "../components/PagePickerModal";
import { t, btn, input } from "../theme";

type Brand = { id: number; name: string; style_instructions: string; created_at: string };
type Channel = { id: number; platform: string; external_id: string; is_active: boolean; token_expires_at: string | null };
type Page = { page_id: string; page_name: string; ig_id?: string; ig_username?: string };

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
  const [flash, setFlash] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function loadBrands() {
    const res = await fetch("/api/brands");
    const data: Brand[] = await res.json();
    setBrands(data);
    const map: Record<number, Channel[]> = {};
    await Promise.all(data.map(async (b) => {
      const r = await fetch(`/api/brands/${b.id}/channels`);
      map[b.id] = await r.json();
    }));
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
    if (params.get("tiktok_connected")) {
      setFlash({ type: "success", msg: "TikTok account connected successfully." });
      history.replaceState(null, "", window.location.pathname);
    }
    if (params.get("tiktok_error")) {
      setFlash({ type: "error", msg: `TikTok connection failed: ${params.get("tiktok_error")}` });
      history.replaceState(null, "", window.location.pathname);
    }
    const oauthKey = params.get("oauth_key");
    if (oauthKey) {
      fetch(`/api/oauth/meta/pending?key=${oauthKey}`)
        .then(r => r.json())
        .then(data => {
          setPendingOAuth({ brandId: Number(data.brand_id), pages: data.pages, key: oauthKey });
          setShowPickerModal(true);
        })
        .catch(() => {});
    }
  }, []);

  async function saveBrand() {
    if (editingBrand) {
      await fetch(`/api/brands/${editingBrand.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brandForm) });
    } else {
      await fetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brandForm) });
    }
    setShowBrandModal(false);
    loadBrands();
  }

  async function deleteBrand(id: number) {
    if (!confirm("Delete this brand and all its channels?")) return;
    await fetch(`/api/brands/${id}`, { method: "DELETE" });
    loadBrands();
  }

  async function saveBudget() {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly_budget_cap: budgetInput ? Number(budgetInput) : null }) });
    loadSettings();
  }

  const pct = settings.monthly_budget_cap ? Math.min(100, (Number(settings.current_spend) / Number(settings.monthly_budget_cap)) * 100) : 0;
  const barColor = pct >= 90 ? t.danger : pct >= 70 ? t.warning : t.success;

  return (
    <div>
      <h2 style={{ margin: "0 0 28px", fontSize: 22, fontWeight: 700, color: t.text }}>Settings</h2>

      {flash && (
        <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 8, background: flash.type === "success" ? t.successBg : t.dangerBg, border: `1px solid ${flash.type === "success" ? "#bbf7d0" : "#fecaca"}`, color: flash.type === "success" ? t.success : t.danger, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{flash.msg}</span>
          <button onClick={() => setFlash(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: t.muted }}>×</button>
        </div>
      )}

      {/* BRANDS */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: t.text }}>Brands</h3>
          <button onClick={() => { setEditingBrand(null); setBrandForm({ name: "", style_instructions: "" }); setShowBrandModal(true); }} style={btn.primary}>
            + New Brand
          </button>
        </div>

        {brands.length === 0 && (
          <div style={{ background: "#fff", borderRadius: 10, border: `1px solid ${t.border}`, padding: 32, textAlign: "center", color: t.muted }}>
            No brands yet. Create one to get started.
          </div>
        )}

        {brands.map(brand => (
          <div key={brand.id} style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 10, padding: 20, marginBottom: 12, boxShadow: t.shadow }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 15, flex: 1, color: t.text }}>{brand.name}</span>
              <button onClick={() => { setEditingBrand(brand); setBrandForm({ name: brand.name, style_instructions: brand.style_instructions ?? "" }); setShowBrandModal(true); }} style={btn.ghost}>Edit</button>
              <button onClick={() => deleteBrand(brand.id)} style={btn.danger}>Delete</button>
            </div>

            {(channelsMap[brand.id] ?? []).map(ch => (
              <div key={ch.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13, borderBottom: `1px solid ${t.borderLight}` }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: ch.is_active ? t.success : t.border, flexShrink: 0, display: "inline-block" }} />
                <span style={{ color: t.text, textTransform: "capitalize", fontWeight: 500, width: 90 }}>{ch.platform}</span>
                <span style={{ color: t.muted, fontSize: 12, flex: 1 }}>{ch.external_id}</span>
                <button onClick={async () => { await fetch(`/api/channels/${ch.id}`, { method: "DELETE" }); loadBrands(); }} style={{ padding: "3px 10px", background: "none", border: `1px solid ${t.border}`, borderRadius: 5, color: t.muted, cursor: "pointer", fontSize: 12 }}>
                  Disconnect
                </button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => { window.location.href = `/api/oauth/meta/start?brand_id=${brand.id}`; }} style={btn.ghost}>
                + Connect Meta Page / IG
              </button>
              <button onClick={() => { window.location.href = `/api/oauth/tiktok/start?brand_id=${brand.id}`; }} style={btn.ghost}>
                + Connect TikTok
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* BUDGET */}
      <section>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: t.text }}>Budget</h3>
        <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 10, padding: 20, maxWidth: 440, boxShadow: t.shadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
            <span style={{ color: t.muted }}>Spent this month</span>
            <span style={{ fontWeight: 600, color: t.text }}>
              ${Number(settings.current_spend).toFixed(2)}
              {settings.monthly_budget_cap != null && <span style={{ color: t.muted, fontWeight: 400 }}> / ${Number(settings.monthly_budget_cap).toFixed(2)}</span>}
            </span>
          </div>
          {settings.monthly_budget_cap != null && (
            <div style={{ height: 6, background: t.borderLight, borderRadius: 3, marginBottom: 20, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3 }} />
            </div>
          )}
          <label style={{ display: "block", fontSize: 13, color: t.muted, marginBottom: 6 }}>Monthly budget cap ($)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} placeholder="Unlimited" style={{ ...input, width: 160 }} />
            <button onClick={saveBudget} style={btn.primary}>Save</button>
          </div>
          {settings.monthly_budget_cap == null && <p style={{ margin: "8px 0 0", fontSize: 12, color: t.mutedLight }}>No cap set — generation is unlimited.</p>}
        </div>
      </section>

      {/* BRAND MODAL */}
      {showBrandModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 480, maxWidth: "90vw", boxShadow: t.shadowMd }}>
            <h3 style={{ margin: "0 0 20px", color: t.text }}>{editingBrand ? "Edit Brand" : "New Brand"}</h3>
            <label style={{ display: "block", fontSize: 13, color: t.muted, marginBottom: 6 }}>Name</label>
            <input value={brandForm.name} onChange={e => setBrandForm(p => ({ ...p, name: e.target.value }))} style={{ ...input, marginBottom: 16 }} placeholder="Brand name" />
            <label style={{ display: "block", fontSize: 13, color: t.muted, marginBottom: 6 }}>Style Instructions</label>
            <textarea value={brandForm.style_instructions} onChange={e => setBrandForm(p => ({ ...p, style_instructions: e.target.value }))} rows={5} style={{ ...input, resize: "vertical", marginBottom: 20 }} placeholder="Describe the brand's visual style, tone, color palette..." />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowBrandModal(false)} style={btn.ghost}>Cancel</button>
              <button onClick={saveBrand} style={btn.primary}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showPickerModal && pendingOAuth && (
        <PagePickerModal
          brandId={pendingOAuth.brandId}
          pages={pendingOAuth.pages}
          oauthKey={pendingOAuth.key}
          onClose={() => { setShowPickerModal(false); setPendingOAuth(null); history.replaceState(null, "", window.location.pathname); }}
          onConnected={() => { setShowPickerModal(false); setPendingOAuth(null); history.replaceState(null, "", window.location.pathname); loadBrands(); }}
        />
      )}
    </div>
  );
}
