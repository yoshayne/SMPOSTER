import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

type Target = {
  id: number;
  platform: string;
  status: string;
  external_post_id: string | null;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  reach: number | null;
  last_synced_at: string | null;
};

type Post = {
  id: number;
  copy: string;
  scheduled_at: string;
  brand_name: string;
  targets: Target[];
};

type Brand = { id: number; name: string };

const stat = (val: number | null, label: string) =>
  val != null ? `${label}: ${val.toLocaleString()}` : null;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

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

  useEffect(() => {
    fetch("/api/brands").then(r => r.json()).then(setBrands).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (brandId) params.set("brand_id", String(brandId));
    params.set("page", String(page));
    params.set("limit", String(limit));
    fetch(`/api/archive?${params}`)
      .then(r => r.json())
      .then(data => { setPosts(data.posts ?? []); setTotal(data.total ?? 0); })
      .catch(() => {});
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
    <div style={{ padding: 24, color: "#e5e5e5" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Archive</h2>
        <button
          onClick={syncAnalytics}
          disabled={syncing}
          style={{ padding: "6px 14px", background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #333", borderRadius: 5, cursor: "pointer" }}
        >
          {syncing ? "Syncing…" : "Sync Analytics"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search posts…"
          style={{ flex: 1, padding: "8px 12px", background: "#141414", color: "#e5e5e5", border: "1px solid #333", borderRadius: 5, outline: "none" }}
        />
        <select
          value={brandId}
          onChange={e => setBrandId(e.target.value ? Number(e.target.value) : "")}
          style={{ padding: "8px 12px", background: "#141414", color: "#e5e5e5", border: "1px solid #333", borderRadius: 5 }}
        >
          <option value="">All Brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {posts.length === 0 && (
        <p style={{ color: "#888", textAlign: "center", marginTop: 60 }}>No posted posts yet.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {posts.map(post => {
          const targets: Target[] = Array.isArray(post.targets) ? post.targets : [];
          const metrics = targets.reduce(
            (acc, t) => ({
              likes: (acc.likes ?? 0) + (t.likes ?? 0),
              comments: (acc.comments ?? 0) + (t.comments ?? 0),
              shares: (acc.shares ?? 0) + (t.shares ?? 0),
              views: (acc.views ?? 0) + (t.views ?? 0),
              reach: (acc.reach ?? 0) + (t.reach ?? 0),
            }),
            { likes: 0, comments: 0, shares: 0, views: 0, reach: 0 }
          );
          const anyMetrics = targets.some(t => t.likes != null || t.reach != null);

          return (
            <div key={post.id} style={{ background: "#141414", border: "1px solid #222", borderRadius: 6, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                    {post.brand_name} · {fmt(post.scheduled_at)}
                  </div>
                  <div style={{ marginBottom: 10, lineHeight: 1.4 }}>
                    {post.copy.length > 160 ? post.copy.slice(0, 160) + "…" : post.copy}
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, marginBottom: anyMetrics ? 8 : 0 }}>
                    {targets.map(t => (
                      <span key={t.id} style={{ color: t.status === "posted" ? "#22c55e" : "#ef4444" }}>
                        {t.platform.toUpperCase()} {t.status}
                      </span>
                    ))}
                  </div>
                  {anyMetrics && (
                    <div style={{ fontSize: 12, color: "#888", display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {[
                        stat(metrics.likes, "Likes"),
                        stat(metrics.comments, "Comments"),
                        stat(metrics.shares, "Shares"),
                        stat(metrics.views, "Views"),
                        stat(metrics.reach, "Reach"),
                      ]
                        .filter(Boolean)
                        .map((s, i) => <span key={i}>{s}</span>)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => repost(post.id)}
                  disabled={reposting === post.id}
                  style={{ marginLeft: 16, padding: "6px 14px", background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #333", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  {reposting === post.id ? "Reposting…" : "Repost"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 24, color: "#888", fontSize: 14 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: "4px 12px", background: "#141414", color: "#e5e5e5", border: "1px solid #333", borderRadius: 5, cursor: page === 1 ? "default" : "pointer", opacity: page === 1 ? 0.4 : 1 }}
          >
            Prev
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: "4px 12px", background: "#141414", color: "#e5e5e5", border: "1px solid #333", borderRadius: 5, cursor: page === totalPages ? "default" : "pointer", opacity: page === totalPages ? 0.4 : 1 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
