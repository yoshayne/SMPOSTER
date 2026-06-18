import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "../theme";

type Post = {
  id: number;
  copy: string;
  scheduled_at: string;
  status: string;
  brand_name: string;
  quality_tier: string;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "#94a3b8",
  generating: "#f59e0b",
  pending_approval: "#a78bfa",
  approved: "#6366f1",
  scheduled: "#3b82f6",
  posted: "#16a34a",
  failed: "#dc2626",
  cancelled: "#d1d5db",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toEastern(iso: string) {
  return new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function Calendar() {
  const navigate = useNavigate();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    fetch("/api/posts")
      .then(r => r.json())
      .then(data => setPosts(Array.isArray(data) ? data : data.posts ?? []))
      .catch(() => {});
  }, []);

  // Group posts by Eastern-local day
  const byDay = new Map<string, Post[]>();
  for (const p of posts) {
    const d = toEastern(p.scheduled_at);
    const k = dayKey(d);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(p);
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); setSelectedDay(null); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); setSelectedDay(null); };

  const selectedKey = selectedDay ? dayKey(selectedDay) : null;
  const selectedPosts = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: t.text }}>Calendar</h2>
        <button
          onClick={() => navigate("/quick-post")}
          style={{ padding: "9px 18px", borderRadius: 7, border: "none", background: t.accent, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >
          + New Post
        </button>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* Calendar */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: `1px solid ${t.border}`, boxShadow: t.shadow, overflow: "hidden" }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${t.borderLight}` }}>
            <button onClick={prevMonth} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: t.muted, padding: "4px 8px" }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>{MONTHS[month]} {year}</span>
            <button onClick={nextMonth} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: t.muted, padding: "4px 8px" }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${t.borderLight}` }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 12, fontWeight: 600, color: t.mutedLight, letterSpacing: "0.05em" }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} style={{ minHeight: 90, borderRight: i % 7 !== 6 ? `1px solid ${t.borderLight}` : "none", borderBottom: `1px solid ${t.borderLight}` }} />;
              const cellDate = new Date(year, month, day);
              const key = dayKey(cellDate);
              const cellPosts = byDay.get(key) ?? [];
              const isToday = dayKey(today) === key;
              const isSelected = selectedKey === key;

              return (
                <div
                  key={i}
                  onClick={() => setSelectedDay(isSelected ? null : cellDate)}
                  style={{
                    minHeight: 90, padding: "8px 6px",
                    borderRight: i % 7 !== 6 ? `1px solid ${t.borderLight}` : "none",
                    borderBottom: `1px solid ${t.borderLight}`,
                    cursor: "pointer",
                    background: isSelected ? t.accentLight : "transparent",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 4, fontSize: 13, fontWeight: isToday ? 700 : 400,
                    background: isToday ? t.accent : "transparent",
                    color: isToday ? "#fff" : t.text,
                  }}>
                    {day}
                  </div>
                  {cellPosts.slice(0, 3).map(p => (
                    <div key={p.id} style={{
                      fontSize: 10, padding: "2px 5px", borderRadius: 4, marginBottom: 2,
                      background: STATUS_COLOR[p.status] + "22",
                      color: STATUS_COLOR[p.status],
                      fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                    }}>
                      {p.copy.slice(0, 20)}
                    </div>
                  ))}
                  {cellPosts.length > 3 && (
                    <div style={{ fontSize: 10, color: t.mutedLight, paddingLeft: 5 }}>+{cellPosts.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Day panel */}
        {selectedDay && (
          <div style={{ width: 300, flexShrink: 0, background: "#fff", borderRadius: 12, border: `1px solid ${t.border}`, boxShadow: t.shadowMd, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>
                  {selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </div>
                <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>Eastern Time</div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                style={{ border: "none", background: "none", cursor: "pointer", color: t.muted, fontSize: 18, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <button
              onClick={() => {
                const d = selectedDay.toLocaleDateString("en-CA"); // YYYY-MM-DD
                navigate(`/quick-post?date=${d}`);
              }}
              style={{ display: "block", width: "100%", padding: "9px 0", borderRadius: 7, border: `2px dashed ${t.border}`, background: "transparent", color: t.accent, fontWeight: 600, cursor: "pointer", fontSize: 13, marginBottom: 16 }}
            >
              + Add Post for this day
            </button>

            {selectedPosts.length === 0 && (
              <p style={{ color: t.muted, fontSize: 13, textAlign: "center", marginTop: 24 }}>No posts scheduled.</p>
            )}

            {selectedPosts.map(p => (
              <div key={p.id} style={{ padding: "12px", borderRadius: 8, border: `1px solid ${t.border}`, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[p.status], background: STATUS_COLOR[p.status] + "18", padding: "2px 7px", borderRadius: 20 }}>
                    {p.status.replace("_", " ")}
                  </span>
                  <span style={{ fontSize: 11, color: t.muted }}>
                    {toEastern(p.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>{p.brand_name}</div>
                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.4 }}>
                  {p.copy.length > 80 ? p.copy.slice(0, 80) + "…" : p.copy}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 20 }}>
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <div key={status} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: t.muted }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            {status.replace("_", " ")}
          </div>
        ))}
      </div>
    </div>
  );
}
