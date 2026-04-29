"use client";

/**
 * Unbuilt Cockpit — Shopify Admin–style analytics dashboard.
 *
 * Layout follows Shopify Admin: a fixed left sidebar for navigation,
 * a slim top bar with the page title and date controls, and section
 * pages on the right. The visual language borrows from Polaris:
 * neutral gray surface, white cards with thin borders, Shopify green
 * (#008060) for positive deltas / primary CTAs, Polaris red for
 * negatives.
 *
 * All data fetching is unchanged from the previous version — the
 * endpoints (/api/cockpit/{stats,limits,health,users}) and their
 * shapes are the same. Only the rendering layer was rebuilt.
 */

import { useState, useEffect, useCallback, useMemo, ReactNode } from "react";

const PASS = process.env.NEXT_PUBLIC_COCKPIT_PASSWORD ?? "";

// ─── Polaris-ish palette ─────────────────────────────────────────
const c = {
  bg: "#F1F1F1",          // Shopify admin gray background
  surface: "#FFFFFF",
  surfaceAlt: "#FAFBFB",
  surfaceHover: "#F6F6F7",
  border: "#E1E3E5",
  borderHover: "#C9CCCF",
  text: "#202223",
  textSec: "#6D7175",
  textDim: "#8C9196",
  textFaint: "#BABFC3",
  primary: "#008060",     // Shopify green
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
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const pctDelta = (current: number, prev: number) => {
  if (!prev) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 100);
};

// ─── Sidebar nav definition ─────────────────────────────────────
type SectionId = "home" | "sales" | "customers" | "reports" | "system" | "settings";
const NAV: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  { id: "home", label: "Home", icon: <NavIcon path="M3 11.5L10 5l7 6.5V17a1 1 0 0 1-1 1h-3v-5H8v5H4a1 1 0 0 1-1-1v-5.5z" /> },
  { id: "sales", label: "Sales", icon: <NavIcon path="M4 4h12v3H4zm0 5h12v3H4zm0 5h8v3H4z" /> },
  { id: "customers", label: "Customers", icon: <NavIcon path="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-6 7a6 6 0 0 1 12 0v1H4v-1z" /> },
  { id: "reports", label: "Reports", icon: <NavIcon path="M5 4h10v12H5zm2 2v2h6V6zm0 4v2h6v-2zm0 4v2h4v-2z" /> },
  { id: "system", label: "System", icon: <NavIcon path="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3v4l3 2" /> },
  { id: "settings", label: "Settings", icon: <NavIcon path="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6.5-3a6.4 6.4 0 0 0-.1-1.1l1.7-1.3-1.7-3-2 .8a6.5 6.5 0 0 0-1.9-1.1l-.3-2.1h-3.4l-.3 2.1a6.5 6.5 0 0 0-1.9 1.1l-2-.8-1.7 3 1.7 1.3a6.4 6.4 0 0 0 0 2.2L1.6 12.4l1.7 3 2-.8a6.5 6.5 0 0 0 1.9 1.1l.3 2.1h3.4l.3-2.1a6.5 6.5 0 0 0 1.9-1.1l2 .8 1.7-3-1.7-1.3c.07-.36.1-.73.1-1.1z" /> },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────

/**
 * Sparkline — minimal SVG line chart used inside KPI cards.
 */
function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (!data?.length) return <div style={{ height, background: c.surfaceAlt, borderRadius: 3 }} />;
  const w = 100, h = height;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const linePoints = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  // Build a separate path for the area fill: same line, then close to baseline.
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

/**
 * KpiCard — Shopify's analytics card pattern: label, big number,
 * delta vs previous period (colored), sparkline.
 */
function KpiCard({
  label, value, delta, sparkData, sparkColor, sub,
}: {
  label: string;
  value: ReactNode;
  delta?: number | null;
  sparkData?: number[];
  sparkColor?: string;
  sub?: string;
}) {
  const deltaPositive = (delta ?? 0) >= 0;
  return (
    <div style={{
      background: c.surface,
      border: `1px solid ${c.border}`,
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
            fontSize: 12,
            fontWeight: 600,
            color: deltaPositive ? c.positive : c.negative,
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
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

/**
 * Card — generic white panel used to wrap chart areas, tables, etc.
 */
function Card({ title, action, children, padding = "20px" }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  padding?: string;
}) {
  return (
    <div style={{
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      {(title || action) && (
        <div style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          {title && <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{title}</div>}
          {action}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
    </div>
  );
}

/**
 * StatusPill — green/red rounded pill used for system health checks.
 */
function StatusPill({ ok, label, sub }: { ok: boolean; label: string; sub?: string }) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 12px",
      borderRadius: 999,
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
  useEffect(() => { if (auth) { fetchUsers(); const ui = setInterval(fetchUsers, 60000); return () => clearInterval(ui); } }, [auth, fetchUsers]);

  const login = () => { if (pw === PASS) { setAuth(true); setPwErr(false); } else setPwErr(true); };

  // dailyKeys: last 14 day ISO keys present in stats.daily.
  const { dailyKeys, dailyDig, dailyStack, dailyTotal } = useMemo(() => {
    if (!stats?.daily) return { dailyKeys: [] as string[], dailyDig: [] as number[], dailyStack: [] as number[], dailyTotal: [] as number[] };
    const keys = Object.keys(stats.daily).sort().slice(-14);
    return {
      dailyKeys: keys,
      dailyDig: keys.map(k => stats.daily[k]?.dig ?? 0),
      dailyStack: keys.map(k => stats.daily[k]?.stack ?? 0),
      dailyTotal: keys.map(k => (stats.daily[k]?.dig ?? 0) + (stats.daily[k]?.stack ?? 0)),
    };
  }, [stats]);

  // Period-over-period: last 7 days vs the 7 before. Used for KPI deltas.
  const periodDeltas = useMemo(() => {
    if (dailyTotal.length < 14) return { reports: null, dig: null, stack: null };
    const last7 = (arr: number[]) => arr.slice(-7).reduce((a, b) => a + b, 0);
    const prev7 = (arr: number[]) => arr.slice(-14, -7).reduce((a, b) => a + b, 0);
    return {
      reports: pctDelta(last7(dailyTotal), prev7(dailyTotal)),
      dig: pctDelta(last7(dailyDig), prev7(dailyDig)),
      stack: pctDelta(last7(dailyStack), prev7(dailyStack)),
    };
  }, [dailyTotal, dailyDig, dailyStack]);

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
  const sectionTitle =
    section === "home" ? "Overview" :
    section === "sales" ? "Sales" :
    section === "customers" ? "Customers" :
    section === "reports" ? "Reports" :
    section === "system" ? "System" : "Settings";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: c.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', sans-serif", color: c.text }}>

      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <aside style={{
        width: 220,
        background: c.sidebarBg,
        color: c.sidebarText,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
      }}>
        <div style={{ padding: "16px 16px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${c.sidebarHover}` }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: c.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>U</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Unbuilt</div>
            <div style={{ fontSize: 10, color: c.sidebarTextDim, letterSpacing: "0.02em" }}>Cockpit</div>
          </div>
        </div>

        <nav style={{ padding: "12px 8px", flex: 1 }}>
          {NAV.map(item => {
            const active = section === item.id;
            return (
              <button key={item.id} onClick={() => setSection(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 2,
                  background: active ? c.sidebarActive : "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: active ? c.sidebarActiveText : c.sidebarText,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = c.sidebarHover; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {item.icon}
                <span>{item.label}</span>
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
          padding: "12px 28px",
          background: c.surface,
          borderBottom: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}>
          <div>
            <div style={{ fontSize: 11, color: c.textDim, fontWeight: 500, letterSpacing: "0.02em" }}>{sectionTitle}</div>
            <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: c.text, letterSpacing: "-0.01em" }}>
              {section === "home" ? "Welcome back" :
               section === "sales" ? "Sales analytics" :
               section === "customers" ? "All customers" :
               section === "reports" ? "Reports" :
               section === "system" ? "System health" : "Settings"}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 6,
              border: `1px solid ${c.border}`,
              background: c.surfaceAlt,
              fontSize: 12,
              color: c.textSec,
              fontWeight: 500,
            }}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M6 3v1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2V3h-2v1H8V3H6zm-1 5h10v8H5V8z" /></svg>
              Last 14 days
            </div>
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
              {section === "home"      && <HomeSection stats={stats} dailyKeys={dailyKeys} dailyDig={dailyDig} dailyStack={dailyStack} dailyTotal={dailyTotal} deltas={periodDeltas} pulseOk={pulseOk} />}
              {section === "sales"     && <SalesSection stats={stats} />}
              {section === "customers" && <CustomersSection users={users} loading={usersLoading} search={userSearch} setSearch={setUserSearch} />}
              {section === "reports"   && <ReportsSection stats={stats} pulseOk={pulseOk} />}
              {section === "system"    && <SystemSection health={health} limits={limits} />}
              {section === "settings"  && <SettingsSection />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Section: Home / Overview ────────────────────────────────────
function HomeSection({ stats, dailyKeys, dailyDig, dailyStack, dailyTotal, deltas, pulseOk }: {
  stats: any;
  dailyKeys: string[];
  dailyDig: number[];
  dailyStack: number[];
  dailyTotal: number[];
  deltas: { reports: number | null; dig: number | null; stack: number | null };
  pulseOk: boolean;
}) {
  return (
    <>
      {/* Row 1 — top KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
        <KpiCard
          label="Total revenue"
          value={$n(stats?.revenue?.total ?? 0)}
          sub={`${$n(stats?.revenue?.today ?? 0)} today · ${$n(stats?.revenue?.week ?? 0)} this week`}
          sparkColor={c.primary}
        />
        <KpiCard
          label="Reports (7-day)"
          value={num(stats?.reports?.week ?? 0)}
          delta={deltas.reports}
          sparkData={dailyTotal}
          sub={`${num(stats?.reports?.total ?? 0)} all-time`}
        />
        <KpiCard
          label="Dig reports"
          value={num(stats?.reports?.dig?.today ?? 0)}
          delta={deltas.dig}
          sparkData={dailyDig}
          sparkColor={c.primary}
          sub={`${num(stats?.reports?.dig?.total ?? 0)} total`}
        />
        <KpiCard
          label="Stack reports"
          value={num(stats?.reports?.stack?.today ?? 0)}
          delta={deltas.stack}
          sparkData={dailyStack}
          sparkColor="#3B7DBF"
          sub={`${num(stats?.reports?.stack?.total ?? 0)} total`}
        />
      </div>

      {/* Row 2 — secondary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Customers" value={num(stats?.users?.total ?? 0)} sub={`${num(stats?.users?.today ?? 0)} today · ${num(stats?.users?.week ?? 0)} this week`} />
        <KpiCard label="Orders today" value={stats?.orders?.today ?? 0} sub={`${num(stats?.orders?.total ?? 0)} all-time`} />
        <KpiCard label="Credits sold" value={num(stats?.orders?.credits ?? 0)} sub="all time" />
        <KpiCard
          label="Pulse feed"
          value={stats?.pulse?.ageMinutes != null ? `${stats.pulse.ageMinutes}m` : "?"}
          sub={pulseOk ? `${num(stats?.pulse?.signals ?? 0)} signals · fresh` : "Stale — check cron"}
          sparkColor={pulseOk ? c.primary : c.negative}
        />
      </div>

      {/* Big chart */}
      <div style={{ marginBottom: 24 }}>
        <Card title="Reports — last 14 days" action={
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: c.textSec }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: c.primary }} />Dig</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#3B7DBF" }} />Stack</span>
          </div>
        }>
          {dailyKeys.length === 0
            ? <div style={{ fontSize: 13, color: c.textDim, padding: "20px 0" }}>No data yet.</div>
            : <DailyChart keys={dailyKeys} dig={dailyDig} stack={dailyStack} />
          }
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
 * DailyChart — two-series area chart with hover tooltip.
 */
function DailyChart({ keys, dig, stack }: { keys: string[]; dig: number[]; stack: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 880, H = 220, padL = 36, padR = 12, padT = 12, padB = 28;
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
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHover(null)}>
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

        <path d={areaPath(stack)} fill="#3B7DBF" opacity="0.15" />
        <polyline points={linePoints(stack)} fill="none" stroke="#3B7DBF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={areaPath(dig)} fill={c.primary} opacity="0.15" />
        <polyline points={linePoints(dig)} fill="none" stroke={c.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {keys.map((k, i) => {
          const x = padL + i * step;
          return (
            <g key={k}>
              <rect x={x - step / 2} y={padT} width={step} height={innerH} fill="transparent"
                onMouseEnter={() => setHover(i)} style={{ cursor: "crosshair" }} />
              {(i === 0 || i === keys.length - 1 || i === Math.floor(keys.length / 2)) && (
                <text x={x} y={H - 8} textAnchor="middle" fontSize="10" fill={c.textDim}>{k.slice(5)}</text>
              )}
              {hover === i && (
                <>
                  <line x1={x} y1={padT} x2={x} y2={padT + innerH} stroke={c.textDim} strokeDasharray="3,3" />
                  <circle cx={x} cy={yScale(dig[i])} r="4" fill={c.primary} stroke="#fff" strokeWidth="2" />
                  <circle cx={x} cy={yScale(stack[i])} r="4" fill="#3B7DBF" stroke="#fff" strokeWidth="2" />
                </>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <div style={{
          position: "absolute",
          left: `${((padL + hover * step) / W) * 100}%`,
          top: 8,
          transform: "translateX(-50%)",
          background: c.text,
          color: "#fff",
          padding: "8px 12px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          pointerEvents: "none",
          whiteSpace: "nowrap" as const,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
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

// ─── Section: Sales ─────────────────────────────────────────────
function SalesSection({ stats }: { stats: any }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Today" value={$n(stats?.revenue?.today ?? 0)} sub="Today's gross revenue" sparkColor={c.primary} />
        <KpiCard label="This week" value={$n(stats?.revenue?.week ?? 0)} sub="Last 7 days" />
        <KpiCard label="All-time revenue" value={$n(stats?.revenue?.total ?? 0)} sub={`${num(stats?.orders?.total ?? 0)} orders`} />
        <KpiCard label="Avg order value" value={$n((stats?.revenue?.total ?? 0) / Math.max(1, stats?.orders?.total ?? 1))} sub="Lifetime" />
      </div>

      {(stats?.orders?.recent ?? []).length > 0 ? (
        <Card title={`Recent orders (${stats.orders.recent.length})`} padding="0">
          <RecentOrdersTable orders={stats.orders.recent} />
        </Card>
      ) : (
        <Card title="Recent orders">
          <div style={{ fontSize: 13, color: c.textDim, padding: "20px 0", textAlign: "center" as const }}>No orders yet.</div>
        </Card>
      )}
    </>
  );
}

// ─── Section: Customers ─────────────────────────────────────────
function CustomersSection({ users, loading, search, setSearch }: { users: any[]; loading: boolean; search: string; setSearch: (s: string) => void }) {
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

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="All customers" value={num(users.length)} sub="signed up" />
        <KpiCard label="Paying customers" value={num(paidCount)} sub={`${users.length ? Math.round((paidCount / users.length) * 100) : 0}% conversion`} />
        <KpiCard label="Total customer spend" value={$n(totalSpent)} sub="lifetime" />
        <KpiCard label="Avg LTV" value={$n(users.length ? totalSpent / users.length : 0)} sub="per signed-up user" />
      </div>

      <Card padding="0">
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email, user id, or recent idea…"
            style={{
              flex: 1, minWidth: 220, maxWidth: 480,
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${c.border}`,
              background: c.surfaceAlt,
              fontSize: 13,
              color: c.text,
              fontFamily: "inherit",
              outline: "none",
            }}
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
                            <span style={{ background: latest.tool === "gap-analysis" ? c.primaryBg : "rgba(59,125,191,0.12)", color: latest.tool === "gap-analysis" ? c.primary : "#3B7DBF", borderRadius: 3, padding: "1px 6px", fontSize: 10, fontWeight: 700, marginRight: 6 }}>{latest.tool === "gap-analysis" ? "DIG" : "STACK"}</span>
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

// ─── Section: Reports ───────────────────────────────────────────
function ReportsSection({ stats, pulseOk }: { stats: any; pulseOk: boolean }) {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Card title="API costs — Anthropic">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const, color: c.textDim, marginBottom: 6 }}>March 2026 baseline</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 600, color: c.text, marginBottom: 8 }}>$40.04</div>
              <div style={{ fontSize: 12, color: c.textSec, lineHeight: 1.7 }}>
                Sonnet 4.6: $16.07/mo · Opus: $11.33/mo · Haiku: $8.45/mo<br/>
                Dig/Stack: ~$0.45–0.75/query · Pulse: ~$3.21/day
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, alignItems: "flex-start" }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const, color: c.textDim }}>Live billing</div>
              <div style={{ fontSize: 12, color: c.textSec, lineHeight: 1.6 }}>Real-time token usage lives in the Anthropic Console.</div>
              <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer"
                style={{ padding: "8px 16px", borderRadius: 6, background: c.primary, color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                Open billing →
              </a>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Pulse">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.textDim, letterSpacing: "0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Last update</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600, color: pulseOk ? c.text : c.negative }}>
              {stats?.pulse?.generatedAt ? ago(stats.pulse.generatedAt) : "Never"}
            </div>
            <div style={{ fontSize: 12, color: c.textDim, marginTop: 2 }}>
              {stats?.pulse?.generatedAt ? new Date(stats.pulse.generatedAt).toLocaleString() : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.textDim, letterSpacing: "0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Signals in feed</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600, color: c.text }}>{num(stats?.pulse?.signals ?? 0)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.textDim, letterSpacing: "0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Feed age</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600, color: pulseOk ? c.text : c.negative }}>
              {stats?.pulse?.ageMinutes != null ? `${stats.pulse.ageMinutes}m` : "?"}
            </div>
            <div style={{ fontSize: 12, color: pulseOk ? c.textDim : c.negative, marginTop: 2 }}>
              {pulseOk ? "Fresh" : "Stale — check cron"}
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

// ─── Section: System ────────────────────────────────────────────
function SystemSection({ health, limits }: { health: any; limits: any }) {
  const failing = health?.checks?.filter((x: any) => !x.ok) ?? [];
  return (
    <>
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

// ─── Section: Settings ──────────────────────────────────────────
function SettingsSection() {
  const links = [
    { label: "Anthropic Console", url: "https://console.anthropic.com/workspaces/default/cost", description: "API spend and rate limits" },
    { label: "Vercel", url: "https://vercel.com/sam-3735s-projects/unbuilt", description: "Deployments, logs, env vars" },
    { label: "Supabase", url: "https://supabase.com/dashboard/project/jlqawgrtnbizwqigbyho", description: "Database, auth, storage" },
    { label: "Clerk", url: "https://dashboard.clerk.com", description: "User authentication" },
    { label: "Google Analytics", url: "https://analytics.google.com", description: "Web traffic and conversions" },
    { label: "Paddle", url: "https://vendors.paddle.com", description: "Subscriptions and billing" },
  ];
  return (
    <Card title="External dashboards">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {links.map(link => (
          <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
            style={{
              padding: "14px 16px",
              borderRadius: 6,
              border: `1px solid ${c.border}`,
              background: c.surfaceAlt,
              textDecoration: "none",
              display: "block",
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
