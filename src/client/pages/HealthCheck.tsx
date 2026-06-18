import { useEffect, useState } from "react";
import { t } from "../theme";

type Health = { ok: boolean; db: boolean; redis: boolean; bucket: boolean };

export default function HealthCheck() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(setHealth).catch(() => setError(true));
  }, []);

  const Row = ({ label, ok }: { label: string; ok: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${t.borderLight}`, fontSize: 14 }}>
      <span style={{ color: t.text }}>{label}</span>
      <span style={{ color: ok ? t.success : t.danger, fontWeight: 600 }}>{ok ? "Connected" : "Unreachable"}</span>
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: t.text }}>Health Check</h2>
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${t.border}`, boxShadow: t.shadow, padding: 24, maxWidth: 420 }}>
        {error && <p style={{ color: t.danger }}>Failed to reach /api/health</p>}
        {!health && !error && <p style={{ color: t.muted }}>Checking…</p>}
        {health && (
          <>
            <Row label="Postgres" ok={health.db} />
            <Row label="Redis" ok={health.redis} />
            <Row label="Bucket (S3)" ok={health.bucket} />
            <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: health.ok ? t.successBg : t.dangerBg, color: health.ok ? t.success : t.danger, fontWeight: 600, fontSize: 14 }}>
              {health.ok ? "All systems go" : "One or more services down"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
