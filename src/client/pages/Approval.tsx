import { useState, useEffect, useCallback, useRef } from "react";

const DARK = {
  bg: "#0f0f0f",
  card: "#141414",
  border: "#222",
  text: "#e5e5e5",
  muted: "#888",
  green: "#22c55e",
  red: "#ef4444",
  orange: "#f97316",
  blue: "#3b82f6",
  yellow: "#eab308",
};

type Asset = {
  id: number;
  asset_type: "image" | "reel" | "story";
  generation_status: "pending" | "generating" | "ready" | "failed" | "approved" | "rejected";
  storage_key: string | null;
  cost: number | null;
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
  draft: DARK.muted,
  generating: DARK.yellow,
  pending_approval: DARK.orange,
  approved: DARK.green,
  scheduled: DARK.blue,
  posted: DARK.green,
  failed: DARK.red,
  cancelled: DARK.muted,
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: color + "22",
        color,
        textTransform: "uppercase" as const,
        letterSpacing: 0.5,
      }}
    >
      {label}
    </span>
  );
}

function PulseBox({ label }: { label: string }) {
  const [op, setOp] = useState(1);
  useEffect(() => {
    let rising = false;
    const t = setInterval(() => {
      setOp((v) => {
        if (v <= 0.3) rising = true;
        if (v >= 1) rising = false;
        return rising ? Math.min(v + 0.05, 1) : Math.max(v - 0.05, 0.3);
      });
    }, 60);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      style={{
        width: "100%",
        height: 180,
        background: "#1a1a1a",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: op,
        color: DARK.muted,
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}

function AssetPreview({
  asset,
  assetUrls,
  onLoadUrl,
}: {
  asset: Asset;
  assetUrls: AssetUrls;
  onLoadUrl: (id: number) => void;
}) {
  const requested = useRef(false);
  useEffect(() => {
    if (
      !requested.current &&
      (asset.generation_status === "ready" || asset.generation_status === "approved") &&
      !assetUrls[asset.id]
    ) {
      requested.current = true;
      onLoadUrl(asset.id);
    }
  }, [asset.generation_status, asset.id, assetUrls, onLoadUrl]);

  if (asset.generation_status === "pending" || asset.generation_status === "generating") {
    return <PulseBox label={asset.generation_status === "pending" ? "Queued..." : "Generating..."} />;
  }
  if (asset.generation_status === "failed") {
    return (
      <div
        style={{
          width: "100%",
          height: 180,
          background: "#1a0000",
          border: `1px solid ${DARK.red}`,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: DARK.red,
          fontSize: 13,
        }}
      >
        Generation failed
      </div>
    );
  }
  const url = assetUrls[asset.id];
  if (!url) return <PulseBox label="Loading preview..." />;

  if (asset.asset_type === "image") {
    return (
      <img
        src={url}
        style={{ width: "100%", height: 180, objectFit: "cover" as const, borderRadius: 8, display: "block" }}
        alt="generated"
      />
    );
  }
  return (
    <video
      src={url}
      controls
      style={{ width: "100%", height: 180, objectFit: "cover" as const, borderRadius: 8, display: "block" }}
    />
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: 6,
    border: `1px solid ${color}`,
    background: color + "22",
    color,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function PostCard({
  post,
  selected,
  onToggle,
  assetUrls,
  onLoadUrl,
  onAction,
  onPublish,
}: {
  post: Post;
  selected: boolean;
  onToggle: () => void;
  assetUrls: AssetUrls;
  onLoadUrl: (id: number) => void;
  onAction: (type: string, postId: number, assetId?: number) => Promise<void>;
  onPublish: (postId: number) => Promise<void>;
}) {
  const assets = post.assets ?? [];
  const totalCost = assets.reduce((s, a) => s + (a.cost ?? 0), 0);
  const scheduledDate = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

  return (
    <div
      style={{
        background: DARK.card,
        border: `1px solid ${selected ? DARK.green : DARK.border}`,
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          style={{ width: 16, height: 16, cursor: "pointer", accentColor: DARK.green }}
        />
        <Badge label={post.status.replace(/_/g, " ")} color={STATUS_COLORS[post.status] ?? DARK.muted} />
        <Badge label={post.brand_name} color={DARK.blue} />
        <span style={{ marginLeft: "auto", fontSize: 12, color: DARK.muted }}>{scheduledDate} ET</span>
      </div>

      {assets.length === 0 ? (
        <div style={{ color: DARK.muted, fontSize: 13 }}>No assets</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {assets.map((asset) => (
            <div key={asset.id}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <Badge
                  label={asset.asset_type.toUpperCase()}
                  color={asset.asset_type === "image" ? DARK.blue : DARK.orange}
                />
                <Badge
                  label={asset.generation_status.replace(/_/g, " ")}
                  color={
                    asset.generation_status === "ready" || asset.generation_status === "approved"
                      ? DARK.green
                      : asset.generation_status === "failed"
                      ? DARK.red
                      : asset.generation_status === "generating"
                      ? DARK.yellow
                      : DARK.muted
                  }
                />
              </div>
              <AssetPreview asset={asset} assetUrls={assetUrls} onLoadUrl={onLoadUrl} />
              {(post.status === "pending_approval" || post.status === "approved") && (
                <button
                  onClick={() => onAction("regenerate-asset", post.id, asset.id)}
                  style={{ ...btnStyle(DARK.muted), marginTop: 6, fontSize: 12 }}
                >
                  Regenerate
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: DARK.text,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as any,
        }}
      >
        {post.copy}
      </p>

      {totalCost > 0 && (
        <div style={{ fontSize: 12, color: DARK.muted }}>Est. cost: ${totalCost.toFixed(2)}</div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {post.status === "draft" && (
          <button onClick={() => onAction("generate", post.id)} style={btnStyle(DARK.green)}>
            Start Generation
          </button>
        )}
        {post.status === "generating" && (
          <button disabled style={{ ...btnStyle(DARK.muted), opacity: 0.5, cursor: "not-allowed" as const }}>
            Generating...
          </button>
        )}
        {post.status === "pending_approval" && (
          <>
            <button onClick={() => onAction("reject", post.id)} style={btnStyle(DARK.red)}>
              Reject
            </button>
            <button onClick={() => onAction("approve", post.id)} style={btnStyle(DARK.green)}>
              Approve
            </button>
          </>
        )}
        {post.status === "approved" && (
          <>
            <span style={{ fontSize: 12, color: DARK.green, fontWeight: 600 }}>Approved</span>
            <button onClick={() => onPublish(post.id)} style={btnStyle(DARK.blue)}>
              Publish Now
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "#1a1a1a",
  border: `1px solid ${DARK.border}`,
  borderRadius: 6,
  color: DARK.text,
  fontSize: 13,
  cursor: "pointer",
};

export default function Approval() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState("active");
  const [brandFilter, setBrandFilter] = useState("all");
  const [assetUrls, setAssetUrls] = useState<AssetUrls>({});
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    const statusParam =
      statusFilter === "active"
        ? "draft,generating,pending_approval,approved"
        : statusFilter === "all"
        ? ""
        : statusFilter;
    const qs = statusParam ? `?status=${encodeURIComponent(statusParam)}` : "";
    const res = await fetch(`/api/posts${qs}`);
    if (res.ok) setPosts(await res.json());
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    const shouldPoll = posts.some((p) => p.status === "draft" || p.status === "generating");
    if (!shouldPoll) return;
    const t = setInterval(fetchPosts, 5000);
    return () => clearInterval(t);
  }, [posts, fetchPosts]);

  const loadAssetUrl = useCallback(async (assetId: number) => {
    const res = await fetch(`/api/post-assets/${assetId}/url`);
    if (res.ok) {
      const { url } = await res.json();
      setAssetUrls((prev) => ({ ...prev, [assetId]: url }));
    }
  }, []);

  const handleAction = useCallback(
    async (type: string, postId: number, assetId?: number) => {
      if (type === "generate") {
        await fetch(`/api/posts/${postId}/generate`, { method: "POST" });
      } else if (type === "approve") {
        await fetch(`/api/posts/${postId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved" }),
        });
      } else if (type === "reject") {
        await fetch(`/api/posts/${postId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
      } else if (type === "regenerate-asset" && assetId) {
        await fetch(`/api/posts/${postId}/regenerate-asset/${assetId}`, { method: "POST" });
      }
      fetchPosts();
    },
    [fetchPosts]
  );

  const handlePublish = useCallback(
    async (postId: number) => {
      setPublishMsg("Publishing...");
      const res = await fetch(`/api/posts/${postId}/publish`, { method: "POST" });
      const data = await res.json();
      setPublishMsg(res.ok ? "Published successfully." : `Publish failed: ${data.error}`);
      fetchPosts();
      setTimeout(() => setPublishMsg(null), 6000);
    },
    [fetchPosts]
  );

  async function handleBatchGenerate() {
    const ids = Array.from(selectedIds).filter((id) => posts.find((p) => p.id === id)?.status === "draft");
    if (!ids.length) return;
    await fetch("/api/generation/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postIds: ids }),
    });
    setSelectedIds(new Set());
    fetchPosts();
  }

  async function handleBatchApprove() {
    const ids = Array.from(selectedIds).filter(
      (id) => posts.find((p) => p.id === id)?.status === "pending_approval"
    );
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/posts/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved" }),
        })
      )
    );
    setSelectedIds(new Set());
    fetchPosts();
  }

  const brands = Array.from(new Set(posts.map((p) => p.brand_name)));
  const filtered = posts.filter((p) => brandFilter === "all" || p.brand_name === brandFilter);
  const allSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));

  const selectedDraftCount = Array.from(selectedIds).filter(
    (id) => posts.find((p) => p.id === id)?.status === "draft"
  ).length;
  const selectedPendingCount = Array.from(selectedIds).filter(
    (id) => posts.find((p) => p.id === id)?.status === "pending_approval"
  ).length;
  const totalEstCost = filtered
    .filter((p) => selectedIds.has(p.id))
    .flatMap((p) => p.assets ?? [])
    .reduce((s, a) => s + (a.cost ?? 0), 0);

  return (
    <div style={{ background: DARK.bg, minHeight: "100vh", padding: 24, color: DARK.text }}>
      <h1 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 700 }}>Approval Grid</h1>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap" as const,
          marginBottom: 20,
          padding: "12px 16px",
          background: DARK.card,
          border: `1px solid ${DARK.border}`,
          borderRadius: 8,
        }}
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => {
            if (allSelected) setSelectedIds(new Set());
            else setSelectedIds(new Set(filtered.map((p) => p.id)));
          }}
          style={{ width: 16, height: 16, cursor: "pointer", accentColor: DARK.green }}
        />
        <span style={{ fontSize: 13, color: DARK.muted }}>
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
        </span>

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
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        {selectedDraftCount > 0 && (
          <button onClick={handleBatchGenerate} style={btnStyle(DARK.green)}>
            Start Generation ({selectedDraftCount})
          </button>
        )}
        {selectedPendingCount > 0 && (
          <button onClick={handleBatchApprove} style={btnStyle(DARK.green)}>
            Approve Selected ({selectedPendingCount})
          </button>
        )}
      </div>

      {publishMsg && (
        <div
          style={{
            padding: "10px 16px",
            marginBottom: 16,
            background: DARK.card,
            border: `1px solid ${DARK.border}`,
            borderRadius: 8,
            fontSize: 13,
            color: publishMsg.startsWith("Publish failed") ? DARK.red : DARK.green,
          }}
        >
          {publishMsg}
        </div>
      )}

      {loading ? (
        <div style={{ color: DARK.muted, fontSize: 14 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: DARK.muted, fontSize: 14 }}>
          No posts found. Upload a CSV on the Upload page to get started.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              selected={selectedIds.has(post.id)}
              onToggle={() =>
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(post.id)) next.delete(post.id);
                  else next.add(post.id);
                  return next;
                })
              }
              assetUrls={assetUrls}
              onLoadUrl={loadAssetUrl}
              onAction={handleAction}
              onPublish={handlePublish}
            />
          ))}
        </div>
      )}

      {selectedIds.size > 0 && totalEstCost > 0 && (
        <div
          style={{
            marginTop: 20,
            padding: "10px 16px",
            background: DARK.card,
            border: `1px solid ${DARK.border}`,
            borderRadius: 8,
            fontSize: 13,
            color: DARK.muted,
          }}
        >
          Estimated generation cost for selected:{" "}
          <strong style={{ color: DARK.text }}>${totalEstCost.toFixed(2)}</strong>
        </div>
      )}
    </div>
  );
}
