import { useEffect, useState } from "react";

type Health = {
  ok: boolean;
  db: boolean;
  redis: boolean;
  bucket: boolean;
};

const dot = (on: boolean) => (
  <span style={{ color: on ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
    {on ? "●" : "●"}
  </span>
);

export default function HealthCheck() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <div
      style={{
        fontFamily: "monospace",
        maxWidth: 480,
        margin: "0 auto",
        padding: "32px",
        border: "1px solid #333",
        borderRadius: 8,
        background: "#141414",
        color: "#e5e5e5",
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Health Check</h2>
      <p style={{ margin: "0 0 24px", color: "#888", fontSize: 13 }}>
        M0 — scaffold health check
      </p>

      {error && <p style={{ color: "#ef4444" }}>Failed to reach /api/health</p>}
      {!health && !error && <p style={{ color: "#888" }}>Checking...</p>}

      {health && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {(
              [
                ["Postgres", health.db],
                ["Redis", health.redis],
                ["Bucket (S3)", health.bucket],
              ] as [string, boolean][]
            ).map(([label, ok]) => (
              <tr key={label}>
                <td style={{ padding: "6px 0", color: "#aaa" }}>{label}</td>
                <td style={{ padding: "6px 0" }}>
                  {dot(ok)} {ok ? "connected" : "unreachable"}
                </td>
              </tr>
            ))}
            <tr>
              <td
                colSpan={2}
                style={{
                  borderTop: "1px solid #333",
                  paddingTop: 12,
                  color: health.ok ? "#22c55e" : "#ef4444",
                  fontWeight: 700,
                }}
              >
                {health.ok ? "All systems go" : "One or more services down"}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
