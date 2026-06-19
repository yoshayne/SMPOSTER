import { useState, useEffect, useCallback, useRef } from "react";
import { t, btn } from "../theme";

type Asset = {
  id: number;
  asset_type: "image" | "reel" | "story";
  generation_status: "pending" | "generating" | "ready" | "failed" | "approved" | "rejected";
  storage_key: string | null;
  cost: number | null;
  error_message: string | null;
};

type Post = {
  id: number;
  brand_id: number;
  brand_name: string;
  copy: string;
  scheduled_at: string;
  status: string;
  quality_tier: string;
  assets: Asset[] | null;
  targets: { id: number; channel_id: number; status: string }[] | null;
};

type AssetUrls = Record<number, string>;

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  generating: "#f59e0b",
  pending_approval: "#a78bfa",
  approved: "#16a34a",
  scheduled: "#3b82f6",
  posted: "#16a34a",
  failed: "#dc2626",
  cancelled: "#94a3b8",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: color + "22", color, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
      {label}
    </span>
  );
}

function PulseBox({ label }: { label: string }) {
  const [op, setOp] = useState(1);
  useEffect(() => {
    let rising = false;
    const timer = setInterval(() => {
      setOp((v) => {
        if (v <= 0.3) rising = true;
        if (v >= 1) rising = false;
        return rising ? Math.min(v + 0.05, 1) : Math.max(v - 0.05, 0.3);
      });
    }, 60);
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={{ width: "100%", height: 180, background: t.borderLight, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", opacity: op, color: t.muted, fontSize: 13 }}>
      {label}
    </div>
  );
}

function AssetPreview({ asset, assetUrls, onLoadUrl }: { asset: Asset; assetUrls: AssetUrls; onLoadUrl: (id: number) => void }) {
  const requested = useRef(false);
  useEffect(() => {
    if (!requested.current && (asset.generation_status === "ready" || asset.generation_status === "approved") && !assetUrls[asset.id]) {
      requested.current = true;
      onLoadUrl(asset.id);
    }
  }, [asset.generation_status, asset.id, assetUrls, onLoadUrl]);

  if (asset.generation_status === "pending" || asset.generation_status === "generating") {
    return <PulseBox label={asset.generation_status === "pending" ? "Queued..." : "Generating..."} />;
  }
  if (asset.generation_status === "failed") {
    return (
      <div style={{ width: "100%", minHeight: 80, background: t.dangerBg, border: `1px solid #fecaca`, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: t.danger, fontSize: 13, padding: "12px 16px", gap: 6, textAlign: "center" }}>
        <span style={{ fontWeight: 600 }}>Generation failed</span>
        {asset.error_message && <span style={{ fontSize: 11, color: "#ef4444", opacity: 0.85, wordBreak: "break-word" }}>{asset.error_message}</span>}
      </div>
    );
  }
  const url = assetUrls[asset.id];
  if (!url) return <PulseBox label="Loading preview..." />;

  if (asset.asset_type === "image") {
    return <img src={url} style={{ width: "100%", height: 180, objectFit: "cover" as const, borderRadius: 8, display: "block" }} alt="generated" />;
  }
  return <video src={url} controls style={{ width: "100%", height: 180, objectFit: "cover" as const, borderRadius: 8, display: "block" }} />;
}

function PostCard({ post, selected, onToggle, assetUrls, onLoadUrl, onAction, onPublish }: {
  post: Post; selected: boolean; onToggle: () => void; assetUrls: AssetUrls;
  onLoadUrl: (id: number) => void; onAction: (type: string, postId: number, assetId?: number) => Promise<void>; onPublish: (postId: number) => Promise<void>;
}) {
  const assets = post.assets ?? [];
  const totalCost = assets.reduce((s, a) => s + (a.cost ?? 0), 0);
  const scheduledDate = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

  return (
    <div style={{ background: "#fff", border: `1px solid ${selected ? t.accent : t.border}`, borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12, boxShadow: t.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input type="checkbox" checked={selected} onChange={onToggle} style={{ width: 16, height: 16, cursor: "pointer", accentColor: t.accent }} />
        <Badge label={post.status.replace(/_/g, " ")} color={STATUS_COLORS[post.status] ?? t.muted} />
        <Badge label={post.brand_name} color={t.accent} />
        <span style={{ marginLeft: "auto", fontSize: 12, color: t.muted }}>{scheduledDate} ET</span>
      </div>

      {assets.length === 0 ? (
        <div style={{ color: t.muted, fontSize: 13 }}>No assets</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {assets.map((asset) => (
            <div key={asset.id}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <Badge label={asset.asset_type.toUpperCase()} color={asset.asset_type === "image" ? "#3b82f6" : "#f97316"} />
                <Badge label={asset.generation_status.replace(/_/g, " ")} color={
                  asset.generation_status === "ready" || asset.generation_status === "approved" ? t.success
                    : asset.generation_status === "failed" ? t.danger
                    : asset.generation_status === "generating" ? t.warning
                    : t.muted
                } />
              </div>
              <AssetPreview asset={asset} assetUrls={assetUrls} onLoadUrl={onLoadUrl} />
              {(post.status === "pending_approval" || post.status === "approved") && (
                <button onClick={() => onAction("regenerate-asset", post.id, asset.id)} style={{ ...btn.ghost, marginTop: 6, fontSize: 12, padding: "4px 10px" }}>
                  Regenerate
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 13, color: t.text, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
        {post.copy}
      </p>

      {totalCost > 0 && <div style={{ fontSize: 12, color: t.muted }}>Est. cost: ${totalCost.toFixed(2)}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {post.status === "draft" && (
          <button onClick={() => onAction("generate", post.id)} style={btn.primary}>Start Generation</button>
        )}
        {post.status === "generating" && (
          <button disabled style={{ ...btn.ghost, opacity: 0.5, cursor: "not-allowed" as const }}>Generating...</button>
        )}
        {post.status === "pending_approval" && (
          <>
            <button onClick={() => onAction("reject", post.id)} style={btn.danger}>Reject</button>
            <button onClick={() => onAction("approve", post.id)} style={btn.primary}>Approve</button>
          </>
        )}
        {post.status === "approved" && (
          <>
            <span style={{ fontSize: 12, color: t.success, fontWeight: 600 }}>Approved</span>
            <button onClick={() => onPublish(post.id)} style={{ ...btn.ghost, color: "#3b82f6", borderColor: "#3b82f6" }}>Publish Now</button>
          </>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "7px 10px", background: "#fff", border: `1px solid ${t.border}`, borderRadius: 7, color: t.text, fontSize: 13, cursor: "pointer",
};

export default function Approval() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState("active");
  const [brandFilter, setBrandFilter] = useState("all");
  const [assetUrls, setAssetUrls] = useState<AssetUrls>({});
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchPosts = useCallback(async () => {
    const statusParam = statusFilter === "active" ? "draft,generating,pending_approval,approved" : statusFilter === "all" ? "" : statusFilter;
    const qs = statusParam ? `?status=${encodeURIComponent(statusParam)}` : "";
    const res = await fetch(`/api/posts${qs}`);
    if (res.ok) setPosts(await res.json());
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { setLoading(true); fetchPosts(); }, [fetchPosts]);

  useEffect(() => {
    const shouldPoll = posts.some((p) => p.status === "draft" || p.status === "generating");
    if (!shouldPoll) return;
    const timer = setInterval(fetchPosts, 5000);
    return () => clearInterval(timer);
  }, [posts, fetchPosts]);

  const loadAssetUrl = useCallback(async (assetId: number) => {
    const res = await fetch(`/api/post-assets/${assetId}/url`);
    if (res.ok) {
      const { url } = await res.json();
      setAssetUrls((prev) => ({ ...prev, [assetId]: url }));
    }
  }, []);

  const handleAction = useCallback(async (type: string, postId: number, assetId?: number) => {
    if (type === "generate") {
      await fetch(`/api/posts/${postId}/generate`, { method: "POST" });
    } else if (type === "approve") {
      await fetch(`/api/posts/${postId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) });
    } else if (type === "reject") {
      await fetch(`/api/posts/${postId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    } else if (type === "regenerate-asset" && assetId) {
      await fetch(`/api/posts/${postId}/regenerate-asset/${assetId}`, { method: "POST" });
    }
    fetchPosts();
  }, [fetchPosts]);

  const handlePublish = useCallback(async (postId: number) => {
    setPublishMsg({ ok: true, text: "Publishing..." });
    const res = await fetch(`/api/posts/${postId}/publish`, { method: "POST" });
    const data = await res.json();
    setPublishMsg({ ok: res.ok, text: res.ok ? "Published successfully." : `Publish failed: ${data.error}` });
    fetchPosts();
    setTimeout(() => setPublishMsg(null), 6000);
  }, [fetchPosts]);

  async function handleBatchGenerate() {
    const ids = Array.from(selectedIds).filter((id) => posts.find((p) => p.id === id)?.status === "draft");
    if (!ids.length) return;
    await fetch("/api/generation/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postIds: ids }) });
    setSelectedIds(new Set());
    fetchPosts();
  }

  async function handleBatchApprove() {
    const ids = Array.from(selectedIds).filter((id) => posts.find((p) => p.id === id)?.status === "pending_approval");
    await Promise.all(ids.map((id) => fetch(`/api/posts/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) })));
    setSelectedIds(new Set());
    fetchPosts();
  }

  const brands = Array.from(new Set(posts.map((p) => p.brand_name)));
  const filtered = posts.filter((p) => brandFilter === "all" || p.brand_name === brandFilter);
  const allSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));
  const selectedDraftCount = Array.from(selectedIds).filter((id) => posts.find((p) => p.id === id)?.status === "draft").length;
  const selectedPendingCount = Array.from(selectedIds).filter((id) => posts.find((p) => p.id === id)?.status === "pending_approval").length;
  const totalEstCost = filtered.filter((p) => selectedIds.has(p.id)).flatMap((p) => p.assets ?? []).reduce((s, a) => s + (a.cost ?? 0), 0);

  return (
    <div>
      <h2 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: t.text }}>Approval Grid</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" as const, marginBottom: 20, padding: "12px 16px", background: "#fff", border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: t.shadow }}>
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => { if (allSelected) setSelectedIds(new Set()); else setSelectedIds(new Set(filtered.map((p) => p.id))); }}
          style={{ width: 16, height: 16, cursor: "pointer", accentColor: t.accent }}
        />
        <span style={{ fontSize: 13, color: t.muted }}>{selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}</span>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="active">Active</option>
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="generating">Generating</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="posted">Posted</option>
          <option value="failed">Failed</option>
        </select>

        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Brands</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        {selectedDraftCount > 0 && (
          <button onClick={handleBatchGenerate} style={btn.primary}>Start Generation ({selectedDraftCount})</button>
        )}
        {selectedPendingCount > 0 && (
          <button onClick={handleBatchApprove} style={btn.primary}>Approve Selected ({selectedPendingCount})</button>
        )}
      </div>

      {publishMsg && (
        <div style={{ padding: "10px 16px", marginBottom: 16, background: publishMsg.ok ? t.successBg : t.dangerBg, border: `1px solid ${publishMsg.ok ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, fontSize: 13, color: publishMsg.ok ? t.success : t.danger }}>
          {publishMsg.text}
        </div>
      )}

      {loading ? (
        <div style={{ color: t.muted, fontSize: 14 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: t.muted, fontSize: 14 }}>No posts found. Upload a CSV on the Upload page to get started.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              selected={selectedIds.has(post.id)}
              onToggle={() => setSelectedIds((prev) => { const next = new Set(prev); if (next.has(post.id)) next.delete(post.id); else next.add(post.id); return next; })}
              assetUrls={assetUrls}
              onLoadUrl={loadAssetUrl}
              onAction={handleAction}
              onPublish={handlePublish}
            />
          ))}
        </div>
      )}

      {selectedIds.size > 0 && totalEstCost > 0 && (
        <div style={{ marginTop: 20, padding: "10px 16px", background: "#fff", border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 13, color: t.muted, boxShadow: t.shadow }}>
          Estimated generation cost for selected: <strong style={{ color: t.text }}>${totalEstCost.toFixed(2)}</strong>
        </div>
      )}
    </div>
  );
}
