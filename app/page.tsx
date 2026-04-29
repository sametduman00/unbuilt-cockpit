"use client";

/**
 * Unbuilt Cockpit — v3.
 *
 * Designed to surface real operating signal at a glance, not just totals.
 * The home tab tells you what to DO today; the other tabs let you drill
 * into why. Layout follows Shopify Admin (left dark sidebar, white cards
 * on light gray, Polaris green/red), but the content is custom-shaped
 * for a small SaaS where the operator and the engineer are the same
 * person and time is the constraint.
 *
 * Sections:
 *   Home     — Action items, anomalies, top KPIs, big chart.
 *   Live     — Live activity feed + 14×24 hourly heatmap.
 *   Funnel   — 30-day signup → first report → 5 reports → Pro funnel.
 *   Cohorts  — 8 weekly cohorts × retention matrix.
 *   Revenue  — Daily revenue series + package mix donut.
 *   Customers — Searchable user list with KPIs (unchanged).
 *   Trends   — Top idea keywords + tool split.
 *   Risk     — Top abuse IPs + free quota draining.
 *   System   — Health checks + API limits + pulse cron health.
 *   Settings — External dashboard links.
 *
 * Data fetching: hits /api/cockpit/{stats,limits,health,users}. The
 * stats endpoint was extended server-side (see commit b3c3fa6) so all
 * derived series come back pre-computed.
 */

import { useState, useEffect, useCallback, useMemo, ReactNode } from "react";

const PASS = process.env.NEXT_PUBLIC_COCKPIT_PASSWORD ?? "";

// ─── Polaris-ish palette ─────────────────────────────────────────
const c = {
  bg: "#F1F1F1",
  surface: "#FFFFFF",
  surfaceAlt: "#FAFBFB",
  surfaceHover: "#F6F6F7",
  border: "#E1E3E5",
  borderHover: "#C9CCCF",
  text: "#202223",
  textSec: "#6D7175",
  textDim: "#8C9196",
  textFaint: "#BABFC3",
  primary: "#008060",
  primaryDark: "#006E52",
  primaryBg: "#E3F1DF",
  positive: "#008060",
  positiveText: "#0C5132",
  positiveBg: "#AEE9D1",
  negative: "#D72C0D",
  negativeText: "#8B1A0A",
  negativeBg: "#FED3D1",
  warn: "#B98900",
  warnBg: "#FFEAB6",
  warnText: "#594300",
  info: "#3B7DBF",
  infoBg: "#D6EAF8",
  infoText: "#1B4D7B",
  sidebarBg: "#1A1A1A",
  sidebarText: "#E3E3E3",
  sidebarTextDim: "#A0A0A0",
  sidebarHover: "#2C2C2C",
  sidebarActive: "#303030",
  sidebarActiveText: "#FFFFFF",
};

// ─── Helpers ────────────────────────────────────────────────────
const $n = (n: number) => `$${(n ?? 0).toFixed(2)}`;
const num = (n: number) => (n ?? 0).toLocaleString("en-US");
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Linear-interpolate a colour ramp between two hex colours. Used for
// the heatmap cell tinting — pale-mint for low values, deep teal for high.
function lerpColor(a: string, b: string, t: number) {
  const ah = a.replace("#", ""), bh = b.replace("#", "");
  const ar = parseInt(ah.slice(0, 2), 16), ag = parseInt(ah.slice(2, 4), 16), ab = parseInt(ah.slice(4, 6), 16);
  const br = parseInt(bh.slice(0, 2), 16), bg = parseInt(bh.slice(2, 4), 16), bb = parseInt(bh.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

// ─── Sidebar nav definition ─────────────────────────────────────
type SectionId =
  | "home" | "live" | "funnel" | "cohorts" | "revenue" | "subscriptions"
  | "customers" | "trends" | "risk" | "system" | "settings";

const NAV: Array<{ id: SectionId; label: string; icon: ReactNode; group?: string }> = [
  { id: "home",          label: "Home",          icon: <NavIcon path="M3 11.5L10 5l7 6.5V17a1 1 0 0 1-1 1h-3v-5H8v5H4a1 1 0 0 1-1-1v-5.5z" /> },
  { id: "live",          label: "Live",          icon: <NavIcon path="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" /> },
  { id: "funnel",        label: "Funnel",        icon: <NavIcon path="M3 4h14l-5 7v5l-4 2v-7L3 4z" /> },
  { id: "cohorts",       label: "Cohorts",       icon: <NavIcon path="M3 4h4v4H3zm5 0h4v4H8zm5 0h4v4h-4zM3 9h4v4H3zm5 0h4v4H8zM3 14h4v4H3z" /> },
  { id: "revenue",       label: "Revenue",       icon: <NavIcon path="M10 2v16M5 6h7a3 3 0 1 1 0 6H8a3 3 0 1 0 0 6h7" /> },
  { id: "subscriptions", label: "Subscriptions", icon: <NavIcon path="M4 4h12v3H4V4zm0 5h12v3H4V9zm0 5h8v3H4v-3zm10 1l3 3-3 3v-2h-3v-2h3v-2z" /> },
  { id: "customers",     label: "Customers",     icon: <NavIcon path="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-6 7a6 6 0 0 1 12 0v1H4v-1z" /> },
  { id: "trends",        label: "Trends",        icon: <NavIcon path="M3 14l4-4 3 3 7-7" /> },
  { id: "risk",          label: "Risk",          icon: <NavIcon path="M10 2L1 18h18L10 2zm0 6v4m0 2v.01" /> },
  { id: "system",        label: "System",        icon: <NavIcon path="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3v4l3 2" /> },
  { id: "settings",      label: "Settings",      icon: <NavIcon path="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6.5-3a6.4 6.4 0 0 0-.1-1.1l1.7-1.3-1.7-3-2 .8a6.5 6.5 0 0 0-1.9-1.1l-.3-2.1h-3.4l-.3 2.1a6.5 6.5 0 0 0-1.9 1.1l-2-.8-1.7 3 1.7 1.3a6.4 6.4 0 0 0 0 2.2L1.6 12.4l1.7 3 2-.8a6.5 6.5 0 0 0 1.9 1.1l.3 2.1h3.4l.3-2.1a6.5 6.5 0 0 0 1.9-1.1l2 .8 1.7-3-1.7-1.3c.07-.36.1-.73.1-1.1z" /> },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
      <path d={path} stroke="none" />
    </svg>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────

function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (!data?.length) return <div style={{ height, background: c.surfaceAlt, borderRadius: 3 }} />;
  const w = 100, h = height;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const linePoints = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  const areaCmds = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");
  const areaPath = `${areaCmds} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <path d={areaPath} fill={color} opacity="0.10" />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function KpiCard({ label, value, delta, sparkData, sparkColor, sub, accent }: {
  label: string; value: ReactNode; delta?: number | null;
  sparkData?: number[]; sparkColor?: string; sub?: string; accent?: boolean;
}) {
  const deltaPositive = (delta ?? 0) >= 0;
  return (
    <div style={{
      background: accent ? `linear-gradient(135deg, ${c.primaryBg}, #FFFFFF)` : c.surface,
      border: `1px solid ${accent ? "#90D2A6" : c.border}`,
      borderRadius: 8,
      padding: "16px 18px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ fontSize: 13, color: c.textSec, fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: "1.625rem", fontWeight: 600, color: c.text, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{value}</div>
        {delta !== undefined && delta !== null && (
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: deltaPositive ? c.positive : c.negative,
            display: "inline-flex", alignItems: "center", gap: 2,
          }}>
            <span style={{ fontSize: 10 }}>{deltaPositive ? "▲" : "▼"}</span>
            {Math.abs(delta)}%
          </div>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: c.textDim }}>{sub}</div>}
      {sparkData && sparkData.length > 0 && (
        <div style={{ marginTop: "auto", paddingTop: 4 }}>
          <Sparkline data={sparkData} color={sparkColor ?? c.primary} />
        </div>
      )}
    </div>
  );
}

function Card({ title, action, children, padding = "20px" }: {
  title?: string; action?: ReactNode; children: ReactNode; padding?: string;
}) {
  return (
    <div style={{
      background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, overflow: "hidden",
    }}>
      {(title || action) && (
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${c.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {title && <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{title}</div>}
          {action}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
    </div>
  );
}

function StatusPill({ ok, label, sub }: { ok: boolean; label: string; sub?: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: 999,
      background: ok ? c.positiveBg : c.negativeBg,
      border: `1px solid ${ok ? "#90D2A6" : "#F5A99B"}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? c.positive : c.negative, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: ok ? c.positiveText : c.negativeText }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: ok ? c.positive : c.negative, opacity: 0.85 }}>{sub}</span>}
    </div>
  );
}

// ─── Auth-gated container ───────────────────────────────────────

export default function Cockpit() {
  const [auth, setAuth] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);
  const [section, setSection] = useState<SectionId>("home");

  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [limits, setLimits] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hChecking, setHChecking] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [lastRef, setLastRef] = useState(new Date());
  const [userSearch, setUserSearch] = useState("");

  const fetchStats = useCallback(async () => {
    const base = process.env.NEXT_PUBLIC_UNBUILT_API ?? "https://www.unbuilt.me";
    const key  = process.env.NEXT_PUBLIC_COCKPIT_API_KEY ?? "";
    const r = await fetch(`${base}/api/cockpit/stats`, { headers: { "x-cockpit-key": key } }).then(r => r.json()).catch(() => null);
    if (r) { setStats(r); setLastRef(new Date()); }
  }, []);

  const fetchLimits = useCallback(async () => {
    const base = process.env.NEXT_PUBLIC_UNBUILT_API ?? "https://www.unbuilt.me";
    const key  = process.env.NEXT_PUBLIC_COCKPIT_API_KEY ?? "";
    const r = await fetch(`${base}/api/cockpit/limits`, { headers: { "x-cockpit-key": key } }).then(r => r.json()).catch(() => null);
    if (r) setLimits(r);
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const base = (process.env.NEXT_PUBLIC_UNBUILT_API || "").replace(/\/$/, "");
      const key  = process.env.NEXT_PUBLIC_COCKPIT_API_KEY || "";
      const res = await fetch(base + "/api/cockpit/users", { headers: { "x-cockpit-key": key } });
      if (res.ok) { const d = await res.json(); if (Array.isArray(d.users)) setUsers(d.users); }
    } catch {}
    setUsersLoading(false);
  }, []);

  const runHealth = useCallback(async () => {
    setHChecking(true);
    const base = process.env.NEXT_PUBLIC_UNBUILT_API ?? "https://www.unbuilt.me";
    const key  = process.env.NEXT_PUBLIC_COCKPIT_API_KEY ?? "";
    const h = await fetch(`${base}/api/cockpit/health`, { headers: { "x-cockpit-key": key } }).then(r => r.json()).catch(() => null);
    if (h) setHealth(h);
    setHChecking(false);
  }, []);

  useEffect(() => {
    if (!auth) return;
    Promise.all([fetchStats(), fetchLimits(), runHealth()]).finally(() => setLoading(false));
    const si = setInterval(fetchStats, 60000);
    return () => clearInterval(si);
  }, [auth, fetchStats, fetchLimits, runHealth]);
  useEffect(() => {
    if (auth) {
      fetchUsers();
      const ui = setInterval(fetchUsers, 60000);
      return () => clearInterval(ui);
    }
  }, [auth, fetchUsers]);

  const login = () => { if (pw === PASS) { setAuth(true); setPwErr(false); } else setPwErr(true); };

  // Daily series. Use the 30-day backfilled map from the server.
  const { dailyKeys, dailyDig, dailyStack, dailyTotal } = useMemo(() => {
    if (!stats?.daily) return { dailyKeys: [] as string[], dailyDig: [] as number[], dailyStack: [] as number[], dailyTotal: [] as number[] };
    const keys = Object.keys(stats.daily).sort();
    return {
      dailyKeys: keys,
      dailyDig: keys.map(k => stats.daily[k]?.dig ?? 0),
      dailyStack: keys.map(k => stats.daily[k]?.stack ?? 0),
      dailyTotal: keys.map(k => (stats.daily[k]?.dig ?? 0) + (stats.daily[k]?.stack ?? 0)),
    };
  }, [stats]);

  const revenueSeries = useMemo(() => {
    if (!stats?.revenue?.daily) return { keys: [] as string[], values: [] as number[] };
    const keys = Object.keys(stats.revenue.daily).sort();
    return { keys, values: keys.map(k => stats.revenue.daily[k] ?? 0) };
  }, [stats]);

  const failing = health?.checks?.filter((x: any) => !x.ok) ?? [];
  const allOk   = health?.checks?.length ? health.checks.every((x: any) => x.ok) : null;
  const pulseOk = stats?.pulse?.ageMinutes != null && stats.pulse.ageMinutes < 180;

  // ─── Login screen ────────────────────────────────────────────
  if (!auth) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', sans-serif" }}>
      <div style={{ width: 360, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "36px 32px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: c.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>U</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.textDim, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>Unbuilt</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: c.text }}>Cockpit</div>
          </div>
        </div>
        <label style={{ display: "block", fontSize: 13, color: c.text, fontWeight: 500, marginBottom: 6 }}>Password</label>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && login()}
          autoFocus
          style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: `1.5px solid ${pwErr ? c.negative : c.border}`, background: c.surface, color: c.text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, marginBottom: 12 }}
        />
        <button onClick={login} style={{ width: "100%", padding: "10px 0", borderRadius: 6, background: c.primary, border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Sign in</button>
        {pwErr && <div style={{ color: c.negative, fontSize: 12, marginTop: 10, textAlign: "center" as const }}>Wrong password</div>}
      </div>
    </div>
  );

  // ─── Authed app shell ────────────────────────────────────────
  const sectionLabels: Record<SectionId, { kicker: string; title: string }> = {
    home:          { kicker: "Overview",      title: "What needs your attention" },
    live:          { kicker: "Live",          title: "Real-time activity" },
    funnel:        { kicker: "Funnel",        title: "Activation pipeline" },
    cohorts:       { kicker: "Cohorts",       title: "Weekly retention" },
    revenue:       { kicker: "Revenue",       title: "Sales analytics" },
    subscriptions: { kicker: "Subscriptions", title: "MRR, churn risk, renewals" },
    customers:     { kicker: "Customers",     title: "All customers" },
    trends:        { kicker: "Trends",        title: "What people are building" },
    risk:          { kicker: "Risk",          title: "Abuse and quota burn" },
    system:        { kicker: "System",        title: "System health" },
    settings:      { kicker: "Settings",      title: "External dashboards" },
  };
  const { kicker, title } = sectionLabels[section];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: c.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', sans-serif", color: c.text }}>

      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <aside style={{
        width: 220, background: c.sidebarBg, color: c.sidebarText, flexShrink: 0,
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
      }}>
        <div style={{ padding: "16px 16px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${c.sidebarHover}` }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: c.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>U</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Unbuilt</div>
            <div style={{ fontSize: 10, color: c.sidebarTextDim, letterSpacing: "0.02em" }}>Cockpit</div>
          </div>
        </div>

        <nav style={{ padding: "12px 8px", flex: 1, overflowY: "auto" as const }}>
          {NAV.map(item => {
            const active = section === item.id;
            return (
              <button key={item.id} onClick={() => setSection(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "8px 10px", marginBottom: 2,
                  background: active ? c.sidebarActive : "transparent",
                  border: "none", borderRadius: 6,
                  color: active ? c.sidebarActiveText : c.sidebarText,
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = c.sidebarHover; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.id === "home" && stats?.actions?.filter((a: any) => a.priority === 1).length > 0 && (
                  <span style={{ marginLeft: "auto", background: c.negative, color: "#fff", borderRadius: 999, fontSize: 10, padding: "1px 7px", fontWeight: 700 }}>
                    {stats.actions.filter((a: any) => a.priority === 1).length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "12px 16px", borderTop: `1px solid ${c.sidebarHover}`, fontSize: 11, color: c.sidebarTextDim }}>
          <div>Last refresh</div>
          <div style={{ color: c.sidebarText, fontWeight: 500, marginTop: 2 }}>{lastRef.toLocaleTimeString()}</div>
        </div>
      </aside>

      {/* ─── Main content ─────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{
          padding: "12px 28px", background: c.surface, borderBottom: `1px solid ${c.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, position: "sticky", top: 0, zIndex: 10,
        }}>
          <div>
            <div style={{ fontSize: 11, color: c.textDim, fontWeight: 500, letterSpacing: "0.02em" }}>{kicker}</div>
            <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: c.text, letterSpacing: "-0.01em" }}>{title}</h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {stats?.activity && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 6, background: c.primaryBg, fontSize: 11, fontWeight: 600, color: c.primaryDark }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.primary, animation: "pulse 1.6s ease-in-out infinite" }} />
                {stats.activity.dau} DAU
              </div>
            )}
            <button onClick={fetchStats}
              title="Refresh"
              style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.surface, color: c.textSec, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.background = c.surfaceHover}
              onMouseLeave={e => e.currentTarget.style.background = c.surface}
            >↻ Refresh</button>
            <button onClick={runHealth} disabled={hChecking}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none",
                background: allOk === false ? c.negative : allOk === true ? c.primary : c.border,
                color: allOk !== null ? "#fff" : c.textSec,
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: hChecking ? 0.7 : 1 }}>
              {hChecking ? "Checking…" : allOk === false ? `${failing.length} system${failing.length === 1 ? "" : "s"} down` : allOk === true ? "All systems go" : "Check health"}
            </button>
          </div>
        </header>

        <div style={{ padding: "24px 28px 60px", maxWidth: 1280, width: "100%", margin: "0 auto", boxSizing: "border-box" as const }}>
          {loading ? (
            <div style={{ color: c.textDim, fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {section === "home"          && <HomeSection stats={stats} dailyKeys={dailyKeys} dailyDig={dailyDig} dailyStack={dailyStack} dailyTotal={dailyTotal} pulseOk={pulseOk} onJump={setSection} />}
              {section === "live"          && <LiveSection stats={stats} />}
              {section === "funnel"        && <FunnelSection stats={stats} />}
              {section === "cohorts"       && <CohortsSection stats={stats} />}
              {section === "revenue"       && <RevenueSection stats={stats} revenueSeries={revenueSeries} />}
              {section === "subscriptions" && <SubscriptionsSection stats={stats} users={users} />}
              {section === "customers"     && <CustomersSection users={users} loading={usersLoading} search={userSearch} setSearch={setUserSearch} />}
              {section === "trends"        && <TrendsSection stats={stats} dailyDig={dailyDig} dailyStack={dailyStack} />}
              {section === "risk"          && <RiskSection stats={stats} />}
              {section === "system"        && <SystemSection health={health} limits={limits} stats={stats} />}
              {section === "settings"      && <SettingsSection />}
            </>
          )}
        </div>
      </main>

      {/* Global keyframe for the live-pulse dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Home
// ═══════════════════════════════════════════════════════════════
function HomeSection({ stats, dailyKeys, dailyDig, dailyStack, dailyTotal, pulseOk, onJump }: {
  stats: any; dailyKeys: string[]; dailyDig: number[]; dailyStack: number[]; dailyTotal: number[]; pulseOk: boolean;
  onJump: (s: SectionId) => void;
}) {
  return (
    <>
      {/* Action items — what to DO today */}
      {stats?.actions?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Card title="Today's action items">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stats.actions.slice(0, 5).map((a: any, i: number) => {
                const sev = a.priority === 1 ? "alert" : a.priority === 2 ? "warn" : "info";
                const bg  = sev === "alert" ? c.negativeBg : sev === "warn" ? c.warnBg : c.infoBg;
                const border = sev === "alert" ? "#F5A99B" : sev === "warn" ? "#E8C887" : "#A4CDEF";
                const txt = sev === "alert" ? c.negativeText : sev === "warn" ? c.warnText : c.infoText;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 6, background: bg, border: `1px solid ${border}` }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 11, background: txt, color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>P{a.priority}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: txt }}>{a.text}</div>
                      <div style={{ fontSize: 12, color: txt, opacity: 0.8, marginTop: 2 }}>{a.why}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Top KPIs row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
        <KpiCard label="Revenue (lifetime)" value={$n(stats?.revenue?.total ?? 0)} sub={`${$n(stats?.revenue?.today ?? 0)} today · ${$n(stats?.revenue?.week ?? 0)} this week`} sparkColor={c.primary} accent />
        <KpiCard label="MRR" value={$n(stats?.subscriptions?.mrrUsd ?? 0)} sub={`ARR ${$n(stats?.subscriptions?.arrUsd ?? 0)} · ${num(stats?.subscriptions?.proCount ?? 0)} Pro · ${num(stats?.subscriptions?.proPlusCount ?? 0)} Pro+`} sparkColor={c.primary} />
        <KpiCard label="Reports (7-day)" value={num(stats?.reports?.week ?? 0)} delta={stats?.reports?.deltaPct} sparkData={dailyTotal.slice(-14)} sub={`${num(stats?.reports?.total ?? 0)} all-time`} />
        <KpiCard label="Customers" value={num(stats?.users?.total ?? 0)} delta={stats?.users?.deltaPct} sub={`${num(stats?.users?.today ?? 0)} today · ${num(stats?.users?.week ?? 0)} this week`} />
      </div>

      {/* Activity row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="DAU" value={num(stats?.activity?.dau ?? 0)} sub="Active in last 24h" />
        <KpiCard label="WAU" value={num(stats?.activity?.wau ?? 0)} sub="Active in last 7d" />
        <KpiCard label="Renewals next 7d" value={num(stats?.subscriptions?.expiringSoon ?? 0)} sub="Period ends within a week" sparkColor={(stats?.subscriptions?.expiringSoon ?? 0) > 0 ? c.warn : c.primary} />
        <KpiCard
          label="Pulse feed"
          value={stats?.pulse?.ageMinutes != null ? `${stats.pulse.ageMinutes}m` : "?"}
          sub={`${stats?.pulse?.cronHealth?.freshDays ?? 0}/${stats?.pulse?.cronHealth?.expected ?? 7} cron days · ${num(stats?.pulse?.signals ?? 0)} signals`}
          sparkColor={pulseOk ? c.primary : c.negative}
        />
      </div>

      {/* Big chart */}
      <div style={{ marginBottom: 24 }}>
        <Card title="Reports — last 30 days" action={
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: c.textSec }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: c.primary }} />Dig</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: c.info }} />Stack</span>
          </div>
        }>
          {dailyKeys.length === 0
            ? <div style={{ fontSize: 13, color: c.textDim, padding: "20px 0" }}>No data yet.</div>
            : <DailyChart keys={dailyKeys} dig={dailyDig} stack={dailyStack} />}
        </Card>
      </div>

      {/* Anomalies + jump links */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <Card title="Signals">
          {(stats?.anomalies ?? []).length === 0 ? (
            <div style={{ fontSize: 13, color: c.textDim }}>No anomalies detected.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
              {stats.anomalies.map((a: any, i: number) => {
                const bg  = a.severity === "alert" ? c.negativeBg : a.severity === "warn" ? c.warnBg : c.infoBg;
                const txt = a.severity === "alert" ? c.negativeText : a.severity === "warn" ? c.warnText : c.infoText;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, background: bg }}>
                    <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: txt }} />
                    <span style={{ fontSize: 13, color: txt }}>{a.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Quick jump">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([
              ["live",          "Live activity",     "What's happening right now"],
              ["funnel",        "Funnel",            "Where users drop off"],
              ["cohorts",       "Cohort retention",  "Are users sticking around"],
              ["subscriptions", "Subscriptions",     "MRR, renewals, churn risk"],
              ["trends",        "Trends",            "What people are building"],
              ["risk",          "Risk",              "Abuse, quota burn, anomalies"],
            ] as const).map(([id, label, sub]) => (
              <button key={id} onClick={() => onJump(id as SectionId)}
                style={{ padding: "12px 14px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.surfaceAlt, cursor: "pointer", textAlign: "left" as const, fontFamily: "inherit" }}
                onMouseEnter={e => { e.currentTarget.style.background = c.surfaceHover; e.currentTarget.style.borderColor = c.borderHover; }}
                onMouseLeave={e => { e.currentTarget.style.background = c.surfaceAlt; e.currentTarget.style.borderColor = c.border; }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{label} →</div>
                <div style={{ fontSize: 11, color: c.textDim, marginTop: 2 }}>{sub}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {(stats?.orders?.recent ?? []).length > 0 && (
        <Card title="Recent orders" padding="0">
          <RecentOrdersTable orders={stats.orders.recent} />
        </Card>
      )}
    </>
  );
}

/**
 * DailyChart — two-series area chart with hover tooltip and grid.
 */
function DailyChart({ keys, dig, stack }: { keys: string[]; dig: number[]; stack: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 880, H = 260, padL = 36, padR = 12, padT = 12, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(1, ...keys.map((_, i) => dig[i] + stack[i]));
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const step = keys.length > 1 ? innerW / (keys.length - 1) : innerW;
  const yScale = (v: number) => padT + innerH - (v / niceMax) * innerH;
  const totalVals = dig.map((d, i) => d + stack[i]);

  const linePoints = (vals: number[]) => vals.map((v, i) => `${padL + i * step},${yScale(v)}`).join(" ");
  const areaPath = (vals: number[]) => {
    if (!vals.length) return "";
    const pts = vals.map((v, i) => `${padL + i * step} ${yScale(v)}`);
    return `M${pts[0]} L${pts.slice(1).join(" L")} L${padL + (vals.length - 1) * step} ${padT + innerH} L${padL} ${padT + innerH} Z`;
  };

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = padT + innerH * (1 - t);
          const v = Math.round(niceMax * t);
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={c.border} strokeWidth="1" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill={c.textDim}>{v}</text>
            </g>
          );
        })}
        <path d={areaPath(stack)} fill={c.info} opacity="0.15" />
        <polyline points={linePoints(stack)} fill="none" stroke={c.info} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={areaPath(dig)} fill={c.primary} opacity="0.15" />
        <polyline points={linePoints(dig)} fill="none" stroke={c.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {keys.map((k, i) => {
          const x = padL + i * step;
          return (
            <g key={k}>
              <rect x={x - step / 2} y={padT} width={step} height={innerH} fill="transparent"
                onMouseEnter={() => setHover(i)} style={{ cursor: "crosshair" }} />
              {[0, Math.floor(keys.length / 4), Math.floor(keys.length / 2), Math.floor(3 * keys.length / 4), keys.length - 1].includes(i) && (
                <text x={x} y={H - 8} textAnchor="middle" fontSize="10" fill={c.textDim}>{k.slice(5)}</text>
              )}
              {hover === i && (
                <>
                  <line x1={x} y1={padT} x2={x} y2={padT + innerH} stroke={c.textDim} strokeDasharray="3,3" />
                  <circle cx={x} cy={yScale(dig[i])} r="4" fill={c.primary} stroke="#fff" strokeWidth="2" />
                  <circle cx={x} cy={yScale(stack[i])} r="4" fill={c.info} stroke="#fff" strokeWidth="2" />
                </>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div style={{
          position: "absolute", left: `${((padL + hover * step) / W) * 100}%`, top: 8,
          transform: "translateX(-50%)", background: c.text, color: "#fff",
          padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
          pointerEvents: "none", whiteSpace: "nowrap" as const, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <div style={{ color: "#BABFC3", fontSize: 11, marginBottom: 3 }}>{keys[hover]}</div>
          <div>Dig: <b>{dig[hover]}</b></div>
          <div>Stack: <b>{stack[hover]}</b></div>
          <div style={{ marginTop: 3, paddingTop: 3, borderTop: "1px solid rgba(255,255,255,0.15)" }}>Total: <b>{totalVals[hover]}</b></div>
        </div>
      )}
    </div>
  );
}

function RecentOrdersTable({ orders }: { orders: any[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ background: c.surfaceAlt, borderBottom: `1px solid ${c.border}` }}>
          {["When", "Package", "Credits", "Amount"].map(h => (
            <th key={h} style={{ padding: "10px 16px", textAlign: "left" as const, fontSize: 12, fontWeight: 500, color: c.textSec }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map((o: any, i: number) => (
          <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
            <td style={{ padding: "12px 16px", color: c.textSec }}>{ago(o.created_at)}</td>
            <td style={{ padding: "12px 16px", fontWeight: 500, color: c.text }}>{o.package_slug}</td>
            <td style={{ padding: "12px 16px", color: c.textSec }}>{o.credits_added}</td>
            <td style={{ padding: "12px 16px", color: c.primary, fontWeight: 600 }}>{$n(o.amount_usd ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Live  (real-time activity feed + 14×24 heatmap)
// ═══════════════════════════════════════════════════════════════
function LiveSection({ stats }: { stats: any }) {
  const feed: any[] = stats?.liveFeed ?? [];
  const heatmap = stats?.heatmap ?? { days: [], grid: [] };
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Card title="Activity heatmap — last 14 days × 24 hours (UTC)">
          <Heatmap days={heatmap.days} grid={heatmap.grid} />
        </Card>
      </div>

      <Card title={`Live feed — last ${feed.length} events`} padding="0">
        {feed.length === 0 ? (
          <div style={{ padding: 24, color: c.textDim, fontSize: 13, textAlign: "center" as const }}>No recent activity.</div>
        ) : (
          <div style={{ maxHeight: 600, overflow: "auto" }}>
            {feed.map((e: any, i: number) => {
              const isReport = e.type === "report";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 20px", borderBottom: `1px solid ${c.border}`,
                }}>
                  <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 6,
                    background: isReport ? (e.payload?.tool === "gap-analysis" ? c.primaryBg : c.infoBg) : c.warnBg,
                    color: isReport ? (e.payload?.tool === "gap-analysis" ? c.primary : c.info) : c.warnText,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {isReport ? (e.payload?.tool === "gap-analysis" ? "DG" : "ST") : "$"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isReport ? (
                      <>
                        <div style={{ fontSize: 13, color: c.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{e.payload?.idea || "(empty)"}</div>
                        <div style={{ fontSize: 11, color: c.textDim, marginTop: 2, fontFamily: "monospace" }}>{e.payload?.user}</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, color: c.text, fontWeight: 500 }}>
                          Order — <b>{e.payload?.package}</b> for <b style={{ color: c.primary }}>{$n(e.payload?.amount ?? 0)}</b>
                        </div>
                        <div style={{ fontSize: 11, color: c.textDim, marginTop: 2 }}>{e.payload?.credits} credits</div>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: c.textDim, flexShrink: 0, textAlign: "right" as const }}>
                    {ago(e.ts)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

/**
 * Heatmap — 14 rows (days, oldest top) × 24 columns (hours UTC). Cells
 * tinted from white→primary by relative intensity.
 */
function Heatmap({ days, grid }: { days: string[]; grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingTop: 18 }}>
        {days.map(d => (
          <div key={d} style={{ fontSize: 10, color: c.textDim, fontFamily: "monospace", height: 18, lineHeight: "18px" }}>{d.slice(5)}</div>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, marginBottom: 4 }}>
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} style={{ fontSize: 9, color: c.textDim, textAlign: "center" as const, fontFamily: "monospace" }}>
              {h % 3 === 0 ? `${h}` : ""}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateRows: `repeat(${grid.length}, 16px)`, gap: 2 }}>
          {grid.map((row, di) => (
            <div key={di} style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
              {row.map((v, hi) => (
                <div key={hi}
                  title={`${days[di]} ${hi}:00 UTC — ${v} reports`}
                  style={{
                    height: 16,
                    background: v === 0 ? c.surfaceAlt : lerpColor("#E3F1DF", "#008060", v / max),
                    borderRadius: 2,
                    border: `1px solid ${v === 0 ? c.border : "transparent"}`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Funnel
// ═══════════════════════════════════════════════════════════════
function FunnelSection({ stats }: { stats: any }) {
  const f = stats?.funnel ?? { signups: 0, firstReport: 0, fiveReports: 0, upgraded: 0 };
  const stages = [
    { label: "Signed up", value: f.signups, color: c.info },
    { label: "Made 1+ report", value: f.firstReport, color: "#5B9BD5" },
    { label: "Made 5+ reports", value: f.fiveReports, color: c.primary },
    { label: "Upgraded to Pro", value: f.upgraded, color: c.primaryDark },
  ];
  const max = Math.max(1, ...stages.map(s => s.value));

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Signed up (30d)" value={num(f.signups)} sub="New customer accounts" />
        <KpiCard label="Activated" value={num(f.firstReport)} sub={`${f.signups ? Math.round((f.firstReport / f.signups) * 100) : 0}% of signups`} />
        <KpiCard label="Engaged" value={num(f.fiveReports)} sub={`${f.signups ? Math.round((f.fiveReports / f.signups) * 100) : 0}% made 5+ reports`} />
        <KpiCard label="Paid" value={num(f.upgraded)} sub={`${f.signups ? Math.round((f.upgraded / f.signups) * 100) : 0}% conversion`} accent />
      </div>

      <Card title="Activation funnel — last 30 days">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 4px" }}>
          {stages.map((s, i) => {
            const pct = (s.value / max) * 100;
            const dropFromPrev = i > 0 && stages[i - 1].value > 0
              ? Math.round(((stages[i - 1].value - s.value) / stages[i - 1].value) * 100)
              : null;
            return (
              <div key={s.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{s.label}</div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {dropFromPrev !== null && dropFromPrev > 0 && (
                      <span style={{ fontSize: 11, color: c.negative, fontWeight: 500 }}>-{dropFromPrev}% drop</span>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 600, color: c.text, fontVariantNumeric: "tabular-nums" as const }}>{num(s.value)}</div>
                  </div>
                </div>
                <div style={{ height: 24, background: c.surfaceAlt, borderRadius: 4, overflow: "hidden", border: `1px solid ${c.border}` }}>
                  <div style={{
                    height: "100%", width: `${Math.max(2, pct)}%`,
                    background: s.color,
                    borderRadius: 4,
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 24, padding: 14, borderRadius: 6, background: c.infoBg, border: `1px solid #A4CDEF`, fontSize: 12, color: c.infoText, lineHeight: 1.6 }}>
          <strong>How to read this:</strong> Of the {num(f.signups)} people who signed up in the last 30 days,
          {" "}{num(f.firstReport)} ({f.signups ? Math.round((f.firstReport / f.signups) * 100) : 0}%) ran a report.
          {" "}{num(f.fiveReports)} kept going and ran 5 or more.
          {" "}{num(f.upgraded)} ultimately upgraded to Pro
          {" "}({f.signups ? Math.round((f.upgraded / f.signups) * 100) : 0}% end-to-end conversion).
          {" "}The biggest drop tells you which step to fix first.
        </div>
      </Card>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Cohorts
// ═══════════════════════════════════════════════════════════════
function CohortsSection({ stats }: { stats: any }) {
  const rows = stats?.cohorts?.rows ?? [];
  const weeks = stats?.cohorts?.weeks ?? [];
  return (
    <Card title="Weekly cohort retention" padding="0">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: c.surfaceAlt, borderBottom: `1px solid ${c.border}` }}>
              <th style={{ padding: "10px 14px", textAlign: "left" as const, color: c.textSec, fontWeight: 500, fontFamily: "monospace" }}>Cohort week</th>
              <th style={{ padding: "10px 14px", textAlign: "right" as const, color: c.textSec, fontWeight: 500 }}>Size</th>
              {weeks.map((w: string, i: number) => (
                <th key={w} style={{ padding: "10px 8px", textAlign: "center" as const, color: c.textSec, fontWeight: 500, fontSize: 11 }}>W{i}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, i: number) => (
              <tr key={row.cohort} style={{ borderBottom: `1px solid ${c.border}` }}>
                <td style={{ padding: "10px 14px", color: c.text, fontFamily: "monospace", fontWeight: 500 }}>{row.cohort}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" as const, color: c.text, fontWeight: 600 }}>{row.size}</td>
                {weeks.map((_: string, wi: number) => {
                  // Cells before the cohort itself are blank.
                  if (wi < i) return <td key={wi} style={{ padding: "10px 8px", background: "#F8F8F8" }} />;
                  const offset = wi - i;
                  const pct = row.retention[offset];
                  if (pct === null || pct === undefined) return <td key={wi} style={{ padding: "10px 8px" }}>—</td>;
                  // Color cell by retention strength.
                  const intensity = Math.min(1, pct / 80);
                  const bg = pct === 0 ? c.surfaceAlt : lerpColor("#FFFFFF", "#008060", intensity);
                  const textColor = pct > 50 ? "#fff" : c.text;
                  return (
                    <td key={wi} title={`${pct}% retained at W+${offset}`}
                      style={{
                        padding: "10px 8px", textAlign: "center" as const,
                        background: bg, color: textColor, fontWeight: 600,
                        fontSize: 11, fontVariantNumeric: "tabular-nums" as const,
                      }}>
                      {pct}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: 14, borderTop: `1px solid ${c.border}`, fontSize: 12, color: c.textSec, lineHeight: 1.5 }}>
        Each row is users who signed up in that week. <b>W0</b> = the signup week itself; <b>W1</b> = the week after; and so on.
        Cells show what % of the cohort came back to make a report in that week. Strong retention curves stay green several columns to the right.
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Revenue
// ═══════════════════════════════════════════════════════════════
function RevenueSection({ stats, revenueSeries }: { stats: any; revenueSeries: { keys: string[]; values: number[] } }) {
  const totalSold = stats?.orders?.packageMix?.reduce((s: number, p: any) => s + p.count, 0) ?? 0;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Today" value={$n(stats?.revenue?.today ?? 0)} sub="Today's gross revenue" sparkColor={c.primary} accent />
        <KpiCard label="This week" value={$n(stats?.revenue?.week ?? 0)} sub="Last 7 days" sparkData={revenueSeries.values.slice(-14)} />
        <KpiCard label="Lifetime" value={$n(stats?.revenue?.total ?? 0)} sub={`${num(stats?.orders?.total ?? 0)} orders`} />
        <KpiCard label="AOV" value={$n((stats?.revenue?.total ?? 0) / Math.max(1, stats?.orders?.total ?? 1))} sub="Average order value" />
      </div>

      <div style={{ marginBottom: 24 }}>
        <Card title="Daily revenue — last 30 days">
          <RevenueChart keys={revenueSeries.keys} values={revenueSeries.values} />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <Card title="Package mix">
          {(stats?.orders?.packageMix ?? []).length === 0 ? (
            <div style={{ fontSize: 13, color: c.textDim }}>No orders yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stats.orders.packageMix.map((p: any, i: number) => {
                const pct = totalSold > 0 ? (p.count / totalSold) * 100 : 0;
                const colors = [c.primary, c.info, "#9B6FDC", c.warn, "#D72C0D"];
                return (
                  <div key={p.slug}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{p.slug}</div>
                      <div style={{ fontSize: 12, color: c.textSec }}>{num(p.count)} sold · {$n(p.revenue)}</div>
                    </div>
                    <div style={{ height: 8, background: c.surfaceAlt, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: colors[i % colors.length], borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Recent orders" padding="0">
          {(stats?.orders?.recent ?? []).length === 0 ? (
            <div style={{ padding: 24, color: c.textDim, fontSize: 13 }}>No orders yet.</div>
          ) : (
            <RecentOrdersTable orders={stats.orders.recent.slice(0, 8)} />
          )}
        </Card>
      </div>
    </>
  );
}

function RevenueChart({ keys, values }: { keys: string[]; values: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!keys.length) return <div style={{ fontSize: 13, color: c.textDim, padding: "20px 0" }}>No revenue yet.</div>;
  const W = 880, H = 220, padL = 44, padR = 12, padT = 12, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(1, ...values);
  const niceMax = Math.ceil(max / 10) * 10 || 10;
  const barW = (innerW / values.length) * 0.7;
  const gap = (innerW / values.length) * 0.3;
  const xFor = (i: number) => padL + i * (barW + gap) + gap / 2;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map(t => {
          const y = padT + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={c.border} strokeWidth="1" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill={c.textDim}>${Math.round(niceMax * t)}</text>
            </g>
          );
        })}
        {values.map((v, i) => {
          const h = (v / niceMax) * innerH;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={xFor(i)} y={padT + innerH - h} width={barW} height={h}
                fill={hover === i ? c.primaryDark : c.primary}
                style={{ transition: "fill 0.1s" }}
              />
              <rect x={xFor(i) - gap / 2} y={padT} width={barW + gap} height={innerH} fill="transparent" style={{ cursor: "crosshair" }} />
            </g>
          );
        })}
        {keys.map((k, i) => i % 5 === 0 && (
          <text key={k} x={xFor(i) + barW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={c.textDim}>{k.slice(5)}</text>
        ))}
      </svg>
      {hover !== null && (
        <div style={{
          position: "absolute", left: `${(xFor(hover) + barW / 2) / W * 100}%`, top: 0,
          transform: "translateX(-50%)", background: c.text, color: "#fff",
          padding: "6px 10px", borderRadius: 4, fontSize: 12, pointerEvents: "none", whiteSpace: "nowrap" as const,
        }}>
          <span style={{ color: "#BABFC3" }}>{keys[hover]}</span> · <b>${values[hover].toFixed(2)}</b>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Customers (existing, lightly polished)
// ═══════════════════════════════════════════════════════════════
function CustomersSection({ users, loading, search, setSearch }: {
  users: any[]; loading: boolean; search: string; setSearch: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      (u.email || "").toLowerCase().includes(q) ||
      (u.user_id || "").toLowerCase().includes(q) ||
      (u.recent_ideas?.[0]?.idea || "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const totalSpent = users.reduce((sum, u) => sum + (u.total_spent || 0), 0);
  const paidCount = users.filter(u => (u.purchase_count || 0) > 0).length;
  // Top spenders for an at-a-glance highlight bar.
  const topSpenders = [...users].filter(u => (u.total_spent || 0) > 0).sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0)).slice(0, 5);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="All customers" value={num(users.length)} sub="signed up" />
        <KpiCard label="Paying" value={num(paidCount)} sub={`${users.length ? Math.round((paidCount / users.length) * 100) : 0}% conversion`} accent />
        <KpiCard label="Total spend" value={$n(totalSpent)} sub="lifetime" />
        <KpiCard label="Avg LTV" value={$n(users.length ? totalSpent / users.length : 0)} sub="per signed-up user" />
      </div>

      {topSpenders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Card title={`Top spenders`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              {topSpenders.map((u, i) => (
                <div key={u.user_id || i} style={{ padding: "10px 12px", background: c.surfaceAlt, borderRadius: 6, border: `1px solid ${c.border}` }}>
                  <div style={{ fontSize: 12, color: c.textSec, marginBottom: 2 }}>#{i + 1}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {u.email || (u.user_id || "").slice(0, 14) + "…"}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.primary, marginTop: 4 }}>{$n(u.total_spent || 0)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card padding="0">
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by email, user id, or recent idea…"
            style={{ flex: 1, minWidth: 220, maxWidth: 480, padding: "8px 12px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.surfaceAlt, fontSize: 13, color: c.text, fontFamily: "inherit", outline: "none" }}
          />
          <div style={{ fontSize: 12, color: c.textDim }}>{filtered.length} of {users.length} shown</div>
        </div>

        {loading ? (
          <div style={{ padding: 24, color: c.textDim, fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, color: c.textDim, fontSize: 13, textAlign: "center" as const }}>
            {users.length === 0 ? "No customers yet." : "No customers match this search."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: c.surfaceAlt, borderBottom: `1px solid ${c.border}` }}>
                  {["Customer", "Signed up", "Credits", "Dig", "Stack", "Last idea", "Spend", "Last active"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left" as const, fontSize: 12, fontWeight: 500, color: c.textSec, whiteSpace: "nowrap" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u: any, i: number) => {
                  const latest = u.recent_ideas?.[0];
                  return (
                    <tr key={u.user_id || i} style={{ borderBottom: `1px solid ${c.border}` }}>
                      <td style={{ padding: "12px 14px", color: c.text, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {u.email || <span style={{ color: c.textDim, fontFamily: "monospace", fontSize: 12 }}>{(u.user_id || "").substring(0, 14)}…</span>}
                      </td>
                      <td style={{ padding: "12px 14px", color: c.textSec, whiteSpace: "nowrap" as const }}>{u.signed_up_at ? ago(u.signed_up_at) : "—"}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ background: (u.credits || 0) > 0 ? c.primaryBg : c.surfaceAlt, color: (u.credits || 0) > 0 ? c.primary : c.textDim, borderRadius: 4, padding: "2px 8px", fontWeight: 600, fontSize: 12 }}>{u.credits ?? 0}</span>
                      </td>
                      <td style={{ padding: "12px 14px", color: c.textSec }}>{u.dig_count ?? 0}</td>
                      <td style={{ padding: "12px 14px", color: c.textSec }}>{u.stack_count ?? 0}</td>
                      <td style={{ padding: "12px 14px", color: c.textSec, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }} title={latest?.idea || ""}>
                        {latest ? (
                          <>
                            <span style={{ background: latest.tool === "gap-analysis" ? c.primaryBg : c.infoBg, color: latest.tool === "gap-analysis" ? c.primary : c.info, borderRadius: 3, padding: "1px 6px", fontSize: 10, fontWeight: 700, marginRight: 6 }}>{latest.tool === "gap-analysis" ? "DIG" : "STACK"}</span>
                            {latest.idea}
                          </>
                        ) : <span style={{ color: c.textFaint }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        {(u.purchase_count || 0) > 0 ? (
                          <span style={{ background: c.positiveBg, color: c.positiveText, borderRadius: 4, padding: "2px 8px", fontWeight: 600, fontSize: 12 }}>${u.total_spent?.toFixed?.(2) ?? 0}</span>
                        ) : <span style={{ color: c.textFaint }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 14px", color: c.textSec, whiteSpace: "nowrap" as const }}>{u.last_activity ? ago(u.last_activity) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Trends  (top keywords + tool split)
// ═══════════════════════════════════════════════════════════════
function TrendsSection({ stats, dailyDig, dailyStack }: { stats: any; dailyDig: number[]; dailyStack: number[] }) {
  const keywords: Array<{ word: string; count: number }> = stats?.topKeywords ?? [];
  const totalDig = dailyDig.reduce((a, b) => a + b, 0);
  const totalStack = dailyStack.reduce((a, b) => a + b, 0);
  const total = totalDig + totalStack;
  const digPct = total > 0 ? (totalDig / total) * 100 : 50;
  const stackPct = 100 - digPct;
  const maxKwCount = keywords[0]?.count ?? 1;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <Card title="Tool split — last 30 days">
          <div style={{ marginBottom: 12 }}>
            <div style={{ height: 28, display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${c.border}` }}>
              <div style={{ width: `${digPct}%`, background: c.primary, color: "#fff", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", minWidth: digPct > 8 ? "auto" : 0 }}>
                {digPct > 8 && `Dig ${digPct.toFixed(0)}%`}
              </div>
              <div style={{ width: `${stackPct}%`, background: c.info, color: "#fff", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", minWidth: stackPct > 8 ? "auto" : 0 }}>
                {stackPct > 8 && `Stack ${stackPct.toFixed(0)}%`}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div style={{ padding: 12, borderRadius: 6, background: c.primaryBg, border: `1px solid #90D2A6` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: c.primaryDark, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Dig</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: c.primaryDark, marginTop: 4 }}>{num(totalDig)}</div>
              <div style={{ fontSize: 11, color: c.primaryDark, opacity: 0.8 }}>reports in 30 days</div>
            </div>
            <div style={{ padding: 12, borderRadius: 6, background: c.infoBg, border: `1px solid #A4CDEF` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: c.infoText, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Stack</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: c.infoText, marginTop: 4 }}>{num(totalStack)}</div>
              <div style={{ fontSize: 11, color: c.infoText, opacity: 0.8 }}>reports in 30 days</div>
            </div>
          </div>
        </Card>

        <Card title="Quick stats">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Stat label="Reports today" value={num(stats?.reports?.today ?? 0)} />
            <Stat label="Reports this week" value={num(stats?.reports?.week ?? 0)} delta={stats?.reports?.deltaPct} />
            <Stat label="Free analyses today" value={num(stats?.freemium?.freeAnalyses?.today ?? 0)} />
            <Stat label="Free analyses this week" value={num(stats?.freemium?.freeAnalyses?.week ?? 0)} />
            <Stat label="Free → Pro conversion" value={`${stats?.freemium?.proConversionRate ?? 0}%`} />
          </div>
        </Card>
      </div>

      <Card title={`What people are building — top ${keywords.length} keywords (last 30 days)`}>
        {keywords.length === 0 ? (
          <div style={{ fontSize: 13, color: c.textDim }}>No keyword data yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {keywords.map(({ word, count }) => {
              const intensity = count / maxKwCount;
              const fontSize = 11 + Math.round(intensity * 7); // 11–18
              return (
                <div key={word} style={{
                  padding: "10px 12px",
                  background: lerpColor("#FFFFFF", "#E3F1DF", intensity),
                  border: `1px solid ${c.border}`,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                }}>
                  <span style={{ fontSize, fontWeight: 600, color: c.text }}>{word}</span>
                  <span style={{ fontSize: 11, color: c.textSec, fontVariantNumeric: "tabular-nums" as const }}>{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value, delta }: { label: string; value: ReactNode; delta?: number }) {
  const dPos = (delta ?? 0) >= 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 13, color: c.textSec }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {delta !== undefined && (
          <span style={{ fontSize: 11, color: dPos ? c.positive : c.negative, fontWeight: 600 }}>
            {dPos ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
        <span style={{ fontSize: 16, fontWeight: 700, color: c.text, fontVariantNumeric: "tabular-nums" as const }}>{value}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Risk
// ═══════════════════════════════════════════════════════════════
function RiskSection({ stats }: { stats: any }) {
  const ips = stats?.freemium?.topFreeIPs ?? [];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Free analyses today" value={num(stats?.freemium?.freeAnalyses?.today ?? 0)} sub="Anonymous + IP-rate-limited" />
        <KpiCard label="Free analyses this week" value={num(stats?.freemium?.freeAnalyses?.week ?? 0)} sub="Last 7 days" />
        <KpiCard label="Monthly Pro quota left" value={num(stats?.freemium?.monthlyAnalysesRemaining ?? 0)} sub="Across all Pro subs" />
        <KpiCard label="Purchased credits left" value={num(stats?.freemium?.purchasedAnalysesRemaining ?? 0)} sub="Across all Pro subs" />
      </div>

      <Card title={`Top free IPs today — top ${ips.length}`} padding="0">
        {ips.length === 0 ? (
          <div style={{ padding: 24, color: c.textDim, fontSize: 13, textAlign: "center" as const }}>No free traffic today.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: c.surfaceAlt, borderBottom: `1px solid ${c.border}` }}>
                <th style={{ padding: "10px 16px", textAlign: "left" as const, fontSize: 12, fontWeight: 500, color: c.textSec }}>Rank</th>
                <th style={{ padding: "10px 16px", textAlign: "left" as const, fontSize: 12, fontWeight: 500, color: c.textSec }}>IP address</th>
                <th style={{ padding: "10px 16px", textAlign: "right" as const, fontSize: 12, fontWeight: 500, color: c.textSec }}>Hits today</th>
                <th style={{ padding: "10px 16px", textAlign: "left" as const, fontSize: 12, fontWeight: 500, color: c.textSec }}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {ips.map((row: any, i: number) => {
                const risk = row.count >= 20 ? "alert" : row.count >= 10 ? "warn" : "low";
                const riskBg = risk === "alert" ? c.negativeBg : risk === "warn" ? c.warnBg : c.positiveBg;
                const riskTxt = risk === "alert" ? c.negativeText : risk === "warn" ? c.warnText : c.positiveText;
                const riskLabel = risk === "alert" ? "High" : risk === "warn" ? "Medium" : "Normal";
                return (
                  <tr key={row.ip} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td style={{ padding: "12px 16px", color: c.textSec, fontFamily: "monospace" }}>#{i + 1}</td>
                    <td style={{ padding: "12px 16px", color: c.text, fontFamily: "monospace", fontWeight: 500 }}>{row.ip}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" as const, color: c.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" as const }}>{row.count}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: riskBg, color: riskTxt, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{riskLabel}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: System
// ═══════════════════════════════════════════════════════════════
function SystemSection({ health, limits, stats }: { health: any; limits: any; stats: any }) {
  const failing = health?.checks?.filter((x: any) => !x.ok) ?? [];
  const cron = stats?.pulse?.cronHealth ?? { freshDays: 0, expected: 7 };
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Pulse cron — last 7d" value={`${cron.freshDays}/${cron.expected}`} sub={cron.freshDays >= 6 ? "Healthy" : `Missed ${cron.expected - cron.freshDays} runs`} sparkColor={cron.freshDays >= 6 ? c.primary : c.negative} />
        <KpiCard label="Last pulse" value={stats?.pulse?.ageMinutes != null ? `${stats.pulse.ageMinutes}m` : "?"} sub={stats?.pulse?.ageMinutes != null && stats.pulse.ageMinutes < 180 ? "Fresh" : "Stale"} />
        <KpiCard label="Pulse signals" value={num(stats?.pulse?.signals ?? 0)} sub="In current feed" />
        <KpiCard label="Failing checks" value={failing.length} sub={failing.length === 0 ? "All clear" : "Click below for details"} accent={failing.length === 0} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <Card title="Health checks">
          {!health?.checks ? (
            <div style={{ fontSize: 13, color: c.textDim }}>Click &quot;Check health&quot; in the top bar to run.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                {health.checks.map((check: any) => (
                  <StatusPill key={check.name} ok={check.ok} label={check.name} sub={`${check.latency}ms`} />
                ))}
              </div>
              {failing.map((check: any) => (
                <div key={check.name} style={{ marginTop: 12, padding: "12px 14px", borderRadius: 6, background: c.negativeBg, border: `1px solid #F5A99B` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.negativeText }}>⚠ {check.name} — HTTP {check.status || "timeout"}</div>
                  {check.error && <div style={{ fontSize: 12, color: c.negative, fontFamily: "monospace", marginTop: 4, opacity: 0.85 }}>{check.error}</div>}
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Card title="API limits — live">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(limits?.liveApis ?? []).map((api: any) => {
              const pct = api.limit && api.remaining != null ? Math.round((api.remaining / api.limit) * 100) : null;
              const barColor = pct === null ? c.primary : pct > 50 ? c.primary : pct > 20 ? c.warn : c.negative;
              return (
                <a key={api.name} href={api.dashboardUrl} target="_blank" rel="noopener noreferrer"
                  style={{ textDecoration: "none", background: c.surfaceAlt, border: `1px solid ${c.border}`, borderRadius: 6, padding: "14px 16px", display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{api.icon} {api.name}</div>
                      <div style={{ fontSize: 12, color: c.textDim, marginTop: 1 }}>{api.subtitle}</div>
                    </div>
                    {pct !== null && <div style={{ fontSize: "1.125rem", fontWeight: 600, color: barColor }}>{pct}%</div>}
                  </div>
                  {api.remaining != null ? (
                    <>
                      <div style={{ height: 4, background: c.border, borderRadius: 2, marginBottom: 6, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(pct ?? 100, 100)}%`, background: barColor, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 12, color: c.textSec }}>
                        <b style={{ color: c.text }}>{(api.remaining ?? 0).toLocaleString("en-US")}</b> remaining
                        {api.limit && <span style={{ color: c.textFaint }}> / {api.limit.toLocaleString("en-US")}</span>}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: c.textDim }}>{api.error ? "API unavailable" : "Loading…"}</div>
                  )}
                  <div style={{ fontSize: 11, color: c.textFaint, marginTop: 6 }}>{api.resetInfo}</div>
                </a>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="API limits — manual tracking">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {(limits?.manualApis ?? []).map((api: any) => (
            <a key={api.name} href={api.dashboardUrl} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: "none", background: c.surfaceAlt, border: `1px solid ${c.border}`, borderRadius: 6, padding: "12px 14px", display: "block" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 3 }}>{api.icon} {api.name}</div>
              <div style={{ fontSize: 12, color: c.textDim, marginBottom: 6 }}>{api.subtitle}</div>
              {api.limit && <div style={{ fontSize: "1rem", fontWeight: 600, color: c.text }}>{api.limit.toLocaleString("en-US")} <span style={{ fontSize: 11, fontWeight: 400, color: c.textDim }}>{api.note}</span></div>}
              {!api.limit && <div style={{ fontSize: 12, color: c.textSec }}>{api.note}</div>}
              <div style={{ fontSize: 11, color: c.textFaint, marginTop: 5 }}>{api.resetInfo}</div>
            </a>
          ))}
        </div>
      </Card>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Subscriptions
// ═══════════════════════════════════════════════════════════════
//
// Surface the recurring side of the business that the orders table
// alone wasn't showing. Pulls from stats.subscriptions which is
// computed server-side over user_subscriptions rows where plan='pro'.
// Tier is derived (monthly_analyses >= 25 = Pro+) to mirror the rule
// the navbar uses, since the DB doesn't have a separate "pro+" plan
// value.
//
// Cross-references the customers list (when loaded) to show a
// readable email instead of just a Clerk user_id.
function SubscriptionsSection({ stats, users }: { stats: any; users: any[] }) {
  const subs: any[] = stats?.subscriptions?.list ?? [];
  // Build a quick user_id → email lookup so we don't show raw Clerk IDs.
  const emailFor: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of users ?? []) {
      if (u.user_id && u.email) m[u.user_id] = u.email;
    }
    return m;
  }, [users]);

  // Sort: soonest renewal first, with negative days (already past — i.e.
  // failed payment but still in our DB) sorted to the top because those
  // are the ones to investigate.
  const sortedSubs = useMemo(() => {
    return [...subs].sort((a, b) => {
      const ad = a.days_to_renewal ?? Infinity;
      const bd = b.days_to_renewal ?? Infinity;
      return ad - bd;
    });
  }, [subs]);

  const proPlusMrr = (stats?.subscriptions?.proPlusCount ?? 0) * 19.99;
  const proMrr = (stats?.subscriptions?.proCount ?? 0) * 9.99;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard
          label="MRR"
          value={$n(stats?.subscriptions?.mrrUsd ?? 0)}
          sub={`Pro: ${$n(proMrr)} · Pro+: ${$n(proPlusMrr)}`}
          sparkColor={c.primary}
          accent
        />
        <KpiCard
          label="ARR"
          value={$n(stats?.subscriptions?.arrUsd ?? 0)}
          sub="Annualised run-rate"
          sparkColor={c.primary}
        />
        <KpiCard
          label="Active subscribers"
          value={num(subs.length)}
          sub={`${num(stats?.subscriptions?.proCount ?? 0)} Pro · ${num(stats?.subscriptions?.proPlusCount ?? 0)} Pro+`}
        />
        <KpiCard
          label="Renewals next 7 days"
          value={num(stats?.subscriptions?.expiringSoon ?? 0)}
          sub="Will charge or churn within a week"
          sparkColor={(stats?.subscriptions?.expiringSoon ?? 0) > 0 ? c.warn : c.primary}
        />
      </div>

      {/* Tier split visual */}
      {subs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Card title="Plan mix">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ padding: 16, borderRadius: 6, background: c.primaryBg, border: `1px solid #90D2A6` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: c.primaryDark, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Pro $9.99/mo</div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: c.primaryDark, marginTop: 4 }}>{num(stats?.subscriptions?.proCount ?? 0)}</div>
                <div style={{ fontSize: 12, color: c.primaryDark, opacity: 0.85 }}>{$n(proMrr)} MRR</div>
              </div>
              <div style={{ padding: 16, borderRadius: 6, background: "#E8E0FA", border: `1px solid #B8A4E8` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#4C2D8E", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Pro+ $19.99/mo</div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#4C2D8E", marginTop: 4 }}>{num(stats?.subscriptions?.proPlusCount ?? 0)}</div>
                <div style={{ fontSize: 12, color: "#4C2D8E", opacity: 0.85 }}>{$n(proPlusMrr)} MRR</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card title={`Active subscriptions — ${subs.length}`} padding="0">
        {subs.length === 0 ? (
          <div style={{ padding: 32, color: c.textDim, fontSize: 13, textAlign: "center" as const }}>
            No active subscriptions.
            <div style={{ fontSize: 11, marginTop: 6 }}>
              If you just bought one and don't see it here, check the Paddle webhook log — the orders table
              insert was added recently and older subscription buys may not have a corresponding orders row.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: c.surfaceAlt, borderBottom: `1px solid ${c.border}` }}>
                  {["Customer", "Tier", "Period ends", "Renewal in", "Monthly quota", "Purchased", "MRR"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left" as const, fontSize: 12, fontWeight: 500, color: c.textSec, whiteSpace: "nowrap" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedSubs.map((s: any, i: number) => {
                  const dr = s.days_to_renewal as number | null;
                  // Risk pill: anything overdue or within 3 days is a watch item;
                  // 7 days is a soft warning; everything else is healthy.
                  let renewBg = c.surfaceAlt, renewTxt = c.textSec, renewLabel = "—";
                  if (dr !== null) {
                    if (dr < 0)      { renewBg = c.negativeBg; renewTxt = c.negativeText; renewLabel = `${Math.abs(dr)}d overdue`; }
                    else if (dr <= 3){ renewBg = c.warnBg;     renewTxt = c.warnText;     renewLabel = `in ${dr}d`; }
                    else if (dr <= 7){ renewBg = c.infoBg;     renewTxt = c.infoText;     renewLabel = `in ${dr}d`; }
                    else             { renewBg = c.positiveBg; renewTxt = c.positiveText; renewLabel = `in ${dr}d`; }
                  }
                  const tierBg = s.tier === "pro+" ? "#E8E0FA" : c.primaryBg;
                  const tierTxt = s.tier === "pro+" ? "#4C2D8E" : c.primaryDark;
                  const email = emailFor[s.user_id];
                  return (
                    <tr key={s.user_id || i} style={{ borderBottom: `1px solid ${c.border}` }}>
                      <td style={{ padding: "12px 14px", color: c.text, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {email ?? <span style={{ color: c.textDim, fontFamily: "monospace", fontSize: 12 }}>{(s.user_id || "").substring(0, 14)}…</span>}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ background: tierBg, color: tierTxt, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                          {s.tier === "pro+" ? "Pro+" : "Pro"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", color: c.textSec, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const }}>
                        {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ background: renewBg, color: renewTxt, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{renewLabel}</span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "left" as const, color: c.text, fontWeight: 500 }}>{s.monthly_analyses}</td>
                      <td style={{ padding: "12px 14px", color: c.textSec }}>{s.purchased_analyses || 0}</td>
                      <td style={{ padding: "12px 14px", color: c.primary, fontWeight: 600 }}>{$n(s.monthly_price_usd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Helper note explaining the tier rule */}
      <div style={{ marginTop: 16, padding: 14, borderRadius: 6, background: c.infoBg, border: `1px solid #A4CDEF`, fontSize: 12, color: c.infoText, lineHeight: 1.6 }}>
        <strong>Note on tier detection:</strong> Subscriptions are stored in <code>user_subscriptions</code> with a single
        <code> plan </code> column (<code>pro</code> or <code>free</code>). Tier is derived: <code>monthly_analyses ≥ 25</code> = Pro+, otherwise Pro.
        This matches the rule used by <code>AppTopNav</code> on the live site. If a Pro+ purchase isn't showing up,
        check that the Paddle <code>price_id</code> in the webhook is mapped to <code>25</code> in <code>SUBSCRIPTION_QUOTAS</code>.
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION: Settings
// ═══════════════════════════════════════════════════════════════
function SettingsSection() {
  const links = [
    { label: "Anthropic Console", url: "https://console.anthropic.com/workspaces/default/cost", description: "API spend and rate limits" },
    { label: "Vercel — main site", url: "https://vercel.com/sam-3735s-projects/unbuilt", description: "Deployments, logs, env vars" },
    { label: "Vercel — cockpit", url: "https://vercel.com/sam-3735s-projects/unbuilt-cockpit", description: "This dashboard's deployments" },
    { label: "Supabase", url: "https://supabase.com/dashboard/project/jlqawgrtnbizwqigbyho", description: "Database, auth, storage" },
    { label: "Clerk", url: "https://dashboard.clerk.com", description: "User authentication" },
    { label: "Google Analytics", url: "https://analytics.google.com", description: "Web traffic and conversions" },
    { label: "Paddle", url: "https://vendors.paddle.com", description: "Subscriptions and billing" },
    { label: "GitHub — main repo", url: "https://github.com/sametduman00/unbuilt", description: "Source code" },
  ];
  return (
    <Card title="External dashboards">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {links.map(link => (
          <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
            style={{
              padding: "14px 16px", borderRadius: 6, border: `1px solid ${c.border}`,
              background: c.surfaceAlt, textDecoration: "none", display: "block",
              transition: "border-color 0.1s, background 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = c.borderHover; e.currentTarget.style.background = c.surfaceHover; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = c.surfaceAlt; }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 3 }}>{link.label} <span style={{ color: c.textDim, fontWeight: 400 }}>↗</span></div>
            <div style={{ fontSize: 12, color: c.textSec }}>{link.description}</div>
          </a>
        ))}
      </div>
    </Card>
  );
}
