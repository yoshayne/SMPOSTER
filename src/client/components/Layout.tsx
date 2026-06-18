import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { t } from "../theme";

const NAV = [
  { to: "/calendar",       label: "Calendar" },
  { to: "/upload",         label: "Upload" },
  { to: "/approval",       label: "Approval" },
  { to: "/quick-post",     label: "Quick Post" },
  { to: "/knowledge-base", label: "Knowledge Base" },
  { to: "/archive",        label: "Archive" },
  { to: "/settings",       label: "Settings" },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: t.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <nav style={{
        width: 220, flexShrink: 0, background: "#fff",
        borderRight: `1px solid ${t.border}`,
        display: "flex", flexDirection: "column",
        position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }}>
        <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${t.borderLight}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: t.accent, letterSpacing: "-0.3px" }}>SMPoster</div>
          <div style={{ fontSize: 11, color: t.mutedLight, marginTop: 2 }}>Social Media Scheduler</div>
        </div>

        <div style={{ padding: "12px 10px", flex: 1 }}>
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: "block", padding: "9px 12px", borderRadius: 7,
                marginBottom: 2, textDecoration: "none", fontSize: 14, fontWeight: 500,
                background: isActive ? t.accentLight : "transparent",
                color: isActive ? t.accentText : t.muted,
              })}
            >
              {label}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: "16px 20px", borderTop: `1px solid ${t.borderLight}`, fontSize: 11, color: t.mutedLight }}>
          SMPoster v1.0
        </div>
      </nav>

      <main style={{ flex: 1, padding: 32, overflowY: "auto", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
