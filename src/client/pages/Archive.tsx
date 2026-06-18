import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { t, btn, input as inputStyle } from "../theme";

type Target = { id: number; platform: string; status: string; external_post_id: string | null; posted_at: string | null; likes: number | null; comments: number | null; shares: number | null; views: number | null; reach: number | null; last_synced_at: string | null; };
type Post = { id: number; copy: string; scheduled_at: string; brand_name: string; targets: Target[]; };
type Brand = { id: number; name: string };

const stat = (val: number | null, label: string) => val != null ? `${label}: ${val.toLocaleString()}` : null;

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const selectStyle: React.CSSProperties = { padding: "8px 12px", background: "#fff", border: `1px solid ${t.border}`, borderRadius: 7, color: t.text, fontSize: 14, cursor: "pointer" };

export default function Archive() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [brandId, setBrandId] = useState<number | "">("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [reposting, setReposting] = useState<number | null>(null);
  const limit = 20;

  useEffect(() => { fetch("/api/brands").then(r => r.json()).then(setBrands).catch(() => {}); }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (brandId) params.set("brand_id", String(brandId));
    params.set("page", String(page));
    params.set("limit", String(limit));
    fetch(`/api/archive?${params}`).then(r => r.json()).then(data => { setPosts(data.posts ?? []); setTotal(data.total ?? 0); }).catch(() => {});
  }, [debouncedSearch, brandId, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch, brandId]);

  const syncAnalytics = async () => {
    setSyncing(true);
    await fetch("/api/analytics/sync", { method: "POST" }).catch(() => {});
    setSyncing(false);
    load();
  };

  const repost = async (id: number) => {
    setReposting(id);
    const res = await fetch(`/api/posts/${id}/repost`, { method: "POST" });
    const data = await res.json();
    setReposting(null);
    if (data.newPostId) navigate("/approval");
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: t.text }}>Archive</h2>
        <button onClick={syncAnalytics} disabled={syncing} style={btn.ghost}>
          {syncing ? "Syncing…" : "Sync Analytics"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts…" style={{ ...inputStyle, flex: 1 }} />
        <select value={brandId} onChange={e => setBrandId(e.target.value ? Number(e.target.value) : "")} style={selectStyle}>
          <option value="">All Brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {posts.length === 0 && (
        <p style={{ color: t.muted, textAlign: "center", marginTop: 60 }}>No posted posts yet.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {posts.map(post => {
          const targets: Target[] = Array.isArray(post.targets) ? post.targets : [];
          const metrics = targets.reduce((acc, tgt) => ({
            likes: (acc.likes ?? 0) + (tgt.likes ?? 0),
            comments: (acc.comments ?? 0) + (tgt.comments ?? 0),
            shares: (acc.shares ?? 0) + (tgt.shares ?? 0),
            views: (acc.views ?? 0) + (tgt.views ?? 0),
            reach: (acc.reach ?? 0) + (tgt.reach ?? 0),
          }), { likes: 0, comments: 0, shares: 0, views: 0, reach: 0 });
          const anyMetrics = targets.some(tgt => tgt.likes != null || tgt.reach != null);

          return (
            <div key={post.id} style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 8, padding: "16px 20px", boxShadow: t.shadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>
                    {post.brand_name} · {fmt(post.scheduled_at)}
                  </div>
                  <div style={{ marginBottom: 10, lineHeight: 1.4, color: t.text, fontSize: 14 }}>
                    {post.copy.length > 160 ? post.copy.slice(0, 160) + "…" : post.copy}
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, marginBottom: anyMetrics ? 8 : 0 }}>
                    {targets.map(tgt => (
                      <span key={tgt.id} style={{ color: tgt.status === "posted" ? t.success : t.danger, fontWeight: 500 }}>
                        {tgt.platform.toUpperCase()} {tgt.status}
                      </span>
                    ))}
                  </div>
                  {anyMetrics && (
                    <div style={{ fontSize: 12, color: t.muted, display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {[stat(metrics.likes, "Likes"), stat(metrics.comments, "Comments"), stat(metrics.shares, "Shares"), stat(metrics.views, "Views"), stat(metrics.reach, "Reach")].filter(Boolean).map((s, i) => <span key={i}>{s}</span>)}
                    </div>
                  )}
                </div>
                <button onClick={() => repost(post.id)} disabled={reposting === post.id} style={{ ...btn.ghost, marginLeft: 16, whiteSpace: "nowrap" }}>
                  {reposting === post.id ? "Reposting…" : "Repost"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 24, color: t.muted, fontSize: 14 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ ...btn.ghost, opacity: page === 1 ? 0.4 : 1 }}>Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ ...btn.ghost, opacity: page === totalPages ? 0.4 : 1 }}>Next</button>
        </div>
      )}
    </div>
  );
}
