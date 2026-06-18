import { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const navItems = [
  { label: "Calendar", path: "/calendar" },
  { label: "Upload", path: "/upload" },
  { label: "Approval", path: "/approval" },
  { label: "Quick Post", path: "/quick-post" },
  { label: "Knowledge Base", path: "/knowledge-base" },
  { label: "Archive", path: "/archive" },
  { label: "Settings", path: "/settings" },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f0f0f", color: "#e5e5e5", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ width: 220, minWidth: 220, background: "#141414", borderRight: "1px solid #222", display: "flex", flexDirection: "column", padding: "24px 0" }}>
        <div style={{ padding: "0 20px 24px", fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px" }}>SMPoster</div>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: "block",
              padding: "10px 20px",
              color: isActive ? "#e5e5e5" : "#888",
              background: isActive ? "#1e1e1e" : "transparent",
              textDecoration: "none",
              fontSize: 14,
              borderLeft: isActive ? "2px solid #22c55e" : "2px solid transparent",
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 32, overflowY: "auto" }}>{children}</main>
    </div>
  );
}
