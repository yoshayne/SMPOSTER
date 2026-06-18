export const t = {
  bg: "#f5f6fa",
  card: "#ffffff",
  border: "#e8eaed",
  borderLight: "#f1f3f5",
  text: "#111827",
  muted: "#6b7280",
  mutedLight: "#9ca3af",
  accent: "#6366f1",
  accentHover: "#4f46e5",
  accentLight: "#eef2ff",
  accentText: "#4338ca",
  success: "#16a34a",
  successBg: "#dcfce7",
  danger: "#dc2626",
  dangerBg: "#fee2e2",
  warning: "#d97706",
  warningBg: "#fef3c7",
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd: "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
} as const;

export const btn = {
  primary: {
    padding: "8px 16px", borderRadius: 7, border: "none",
    background: "#6366f1", color: "#fff", fontWeight: 600,
    cursor: "pointer", fontSize: 13,
  } as React.CSSProperties,
  ghost: {
    padding: "8px 16px", borderRadius: 7, border: "1px solid #e8eaed",
    background: "#fff", color: "#374151", fontWeight: 500,
    cursor: "pointer", fontSize: 13,
  } as React.CSSProperties,
  danger: {
    padding: "8px 16px", borderRadius: 7, border: "none",
    background: "#fee2e2", color: "#dc2626", fontWeight: 600,
    cursor: "pointer", fontSize: 13,
  } as React.CSSProperties,
};

export const input: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 7,
  border: "1px solid #e8eaed", background: "#fff",
  color: "#111827", fontSize: 14, boxSizing: "border-box",
  outline: "none",
};
