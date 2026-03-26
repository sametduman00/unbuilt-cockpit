"use client";
import { useState, useEffect, useCallback } from "react";

const PASS = process.env.NEXT_PUBLIC_COCKPIT_PASSWORD ?? "";

const $n = (n: number) => `$${(n ?? 0).toFixed(2)}`;
const num = (n: number) => (n ?? 0).toLocaleString('en-US');
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function Card({ title, value, sub, color }: { title: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#141414", border: `1px solid ${color ? color + "44" : "#2a2a2a"}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#555", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: color ?? "#e5e5e5", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#444", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid #1e1e1e" }}>{title}</div>
      {children}
    </div>
  );
}

export default function Cockpit() {
  const [auth, setAuth] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hLoading, setHLoading] = useState(false);
  const [limits, setLimits] = useState<any>(null);
  const [lastRef, setLastRef] = useState(new Date());

  const fetchStats = useCallback(async () => {
    const base = process.env.NEXT_PUBLIC_UNBUILT_API ?? "https://www.unbuilt.me";
    const key  = process.env.NEXT_PUBLIC_COCKPIT_API_KEY ?? "";
    const [r, l] = await Promise.all([
      fetch(`${base}/api/cockpit/stats`, { headers: { "x-cockpit-key": key } }).then(r => r.json()).catch(() => null),
      fetch(`${base}/api/cockpit/limits`, { headers: { "x-cockpit-key": key } }).then(r => r.json()).catch(() => null),
    ]);
    if (r) { setStats(r); setLastRef(new Date()); }
    if (l) setLimits(l);
  }, []);

  const runHealth = useCallback(async () => {
    setHLoading(true);
    const base = process.env.NEXT_PUBLIC_UNBUILT_API ?? "https://www.unbuilt.me";
    const key  = process.env.NEXT_PUBLIC_COCKPIT_API_KEY ?? "";
    const r = await fetch(`${base}/api/cockpit/health`, {
      headers: { "x-cockpit-key": key }
    }).then(r => r.json()).catch(() => null);
    if (r) setHealth(r);
    setHLoading(false);
  }, []);

  useEffect(() => {
    if (!auth) return;
    setLoading(true);
    Promise.all([fetchStats(), runHealth()]).finally(() => setLoading(false));
    const si = setInterval(fetchStats, 60000);
    return () => clearInterval(si);
  }, [auth, fetchStats, runHealth]);

  const login = () => {
    if (pw === PASS) { setAuth(true); setPwErr(false); }
    else { setPwErr(true); }
  };

  // Login screen
  if (!auth) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 320, background: "#111", border: "1px solid #222", borderRadius: 14, padding: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#444", marginBottom: 6 }}>Unbuilt</div>
        <div style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 24, color: "#e5e5e5" }}>Cockpit</div>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()}
          placeholder="Password"
          autoFocus
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${pwErr ? "#ef4444" : "#2a2a2a"}`, background: "#0a0a0a", color: "#e5e5e5", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, marginBottom: 12 }}
        />
        <button onClick={login} style={{ width: "100%", padding: "10px 0", borderRadius: 8, background: "#7c6fff", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Enter
        </button>
        {pwErr && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8, textAlign: "center" as const }}>Wrong password</div>}
      </div>
    </div>
  );

  const failing = health?.checks?.filter((c: any) => !c.ok) ?? [];
  const allOk   = health?.checks?.every((c: any) => c.ok);
  const pulseOk = stats?.pulse?.ageMinutes != null && stats.pulse.ageMinutes < 180;
  const dailyKeys = stats ? Object.keys(stats.daily ?? {}).sort().slice(-14) : [];
  const maxVal = stats && dailyKeys.length ? Math.max(1, ...dailyKeys.map(k => (stats.daily[k]?.dig ?? 0) + (stats.daily[k]?.stack ?? 0))) : 1;

  return (
    <div style={{ padding: "24px 32px 80px", maxWidth: 1020, margin: "0 auto" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#444", marginBottom: 4 }}>Unbuilt</div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#e5e5e5" }}>Cockpit</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#444" }}>{lastRef.toLocaleTimeString()}</span>
          <button onClick={fetchStats} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid #2a2a2a", background: "#141414", color: "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>↻</button>
          <button onClick={runHealth} disabled={hLoading} style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: allOk === false ? "#ef4444" : allOk === true ? "#16a34a" : "#1e1e1e", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: hLoading ? 0.6 : 1 }}>
            {hLoading ? "Checking..." : allOk === false ? `⚠ ${failing.length} DOWN` : allOk === true ? "✓ All OK" : "Check health"}
          </button>
        </div>
      </div>

      {loading ? <div style={{ color: "#444", fontSize: 13 }}>Loading...</div> : <>

      {/* HEALTH */}
      <Sec title="🛡 Site health">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {(health?.checks ?? []).map((c: any) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: `1px solid ${c.ok ? "#166534" : "#7f1d1d"}`, background: c.ok ? "#052e16" : "#450a0a" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.ok ? "#22c55e" : "#ef4444", display: "inline-block" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: c.ok ? "#4ade80" : "#f87171" }}>{c.name}</span>
              <span style={{ fontSize: 11, color: c.ok ? "#166534" : "#7f1d1d" }}>{c.latency}ms</span>
            </div>
          ))}
        </div>
        {failing.map((c: any) => (
          <div key={c.name} style={{ marginTop: 8, padding: "10px 14px", borderRadius: 8, background: "#450a0a", border: "1px solid #7f1d1d" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>🚨 {c.name} — HTTP {c.status || "TIMEOUT"}</div>
            {c.error && <div style={{ fontSize: 11, color: "#ef4444", fontFamily: "monospace", marginTop: 3 }}>{c.error}</div>}
          </div>
        ))}
      </Sec>

      {/* USAGE */}
      <Sec title="📊 Usage">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <Card title="Users today"   value={stats?.users?.today ?? 0}          sub={`${num(stats?.users?.week ?? 0)} week · ${num(stats?.users?.total ?? 0)} total`} />
          <Card title="Reports today" value={stats?.reports?.today ?? 0}        sub={`${num(stats?.reports?.week ?? 0)} week · ${num(stats?.reports?.total ?? 0)} total`} />
          <Card title="Dig today"     value={stats?.reports?.dig?.today ?? 0}   sub={`${num(stats?.reports?.dig?.total ?? 0)} total`} color="#7c6fff" />
          <Card title="Stack today"   value={stats?.reports?.stack?.today ?? 0} sub={`${num(stats?.reports?.stack?.total ?? 0)} total`} color="#38bdf8" />
        </div>
      </Sec>

      {/* REVENUE */}
      <Sec title="💰 Revenue">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
          <Card title="Today"        value={$n(stats?.revenue?.today ?? 0)}   sub={`${$n(stats?.revenue?.week ?? 0)} this week`} color="#22c55e" />
          <Card title="All time"     value={$n(stats?.revenue?.total ?? 0)}   color="#22c55e" />
          <Card title="Orders today" value={stats?.orders?.today ?? 0}        sub={`${num(stats?.orders?.total ?? 0)} total`} />
          <Card title="Credits sold" value={num(stats?.orders?.credits ?? 0)} sub="all time" />
        </div>
        {(stats?.orders?.recent ?? []).length > 0 && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ borderBottom: "1px solid #1e1e1e" }}>
                {["When", "Package", "Credits", "Amount"].map(h => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: "left" as const, fontSize: 9, fontWeight: 700, color: "#444", letterSpacing: ".08em", textTransform: "uppercase" as const }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{stats.orders.recent.map((o: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <td style={{ padding: "8px 14px", color: "#666" }}>{ago(o.created_at)}</td>
                  <td style={{ padding: "8px 14px", fontWeight: 600, color: "#ccc" }}>{o.package_slug}</td>
                  <td style={{ padding: "8px 14px", color: "#aaa" }}>{o.credits_added}</td>
                  <td style={{ padding: "8px 14px", color: "#22c55e", fontWeight: 700 }}>{$n(o.amount_usd ?? 0)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Sec>

      {/* API COSTS */}
      <Sec title="💸 API costs (Anthropic)">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#444", marginBottom: 8 }}>March 2026 baseline</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#e5e5e5" }}>$40.04</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 6, lineHeight: 1.7 }}>
              Sonnet 4.6: $16.07/mo · Opus: $11.33/mo · Haiku: $8.45/mo<br />
              Dig/Stack: ~$0.45–0.75/query · Pulse: ~$3.21/day
            </div>
          </div>
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column" as const, gap: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#444" }}>Live billing</div>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>Real-time usage is in Anthropic Console.</div>
            <a href="https://console.anthropic.com/workspaces/default/cost" target="_blank" rel="noopener noreferrer"
              style={{ padding: "8px 14px", borderRadius: 7, background: "#7c6fff", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700, display: "inline-block", width: "fit-content" }}>
              Open Console ↗
            </a>
          </div>
        </div>
      </Sec>

      {/* PULSE */}
      <Sec title="📡 Pulse">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          <Card title="Last update" value={stats?.pulse?.generatedAt ? ago(stats.pulse.generatedAt) : "Never"} sub={stats?.pulse?.generatedAt ? new Date(stats.pulse.generatedAt).toLocaleString() : "—"} color={pulseOk ? undefined : "#ef4444"} />
          <Card title="Signals"     value={num(stats?.pulse?.signals ?? 0)} sub="in feed" />
          <Card title="Feed age"    value={stats?.pulse?.ageMinutes !== null ? `${stats.pulse.ageMinutes}m` : "?"} sub={pulseOk ? "✓ Fresh" : "⚠ Stale"} color={pulseOk ? "#22c55e" : "#ef4444"} />
        </div>
      </Sec>

      {/* CHART */}
      <Sec title="📈 Daily reports (14 days)">
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "16px 16px 12px" }}>
          {dailyKeys.length === 0 ? <div style={{ fontSize: 12, color: "#444" }}>No data yet</div> : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 72 }}>
                {dailyKeys.map(k => {
                  const d = stats.daily[k]; const total = (d.dig ?? 0) + (d.stack ?? 0);
                  const h = Math.max(3, Math.round((total / maxVal) * 64));
                  return (
                    <div key={k} title={`${k}: ${d.dig} Dig, ${d.stack} Stack`} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
                      <div style={{ width: "100%", display: "flex", flexDirection: "column" as const, justifyContent: "flex-end", height: 64 }}>
                        <div style={{ height: h, borderRadius: 3, background: total > 0 ? "#7c6fff" : "#1e1e1e" }} />
                      </div>
                      <div style={{ fontSize: 9, color: "#444", marginTop: 4, transform: "rotate(-45deg)", whiteSpace: "nowrap" as const }}>{k.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 14, fontSize: 11, color: "#555", display: "flex", gap: 20 }}>
                <span>Dig: <b style={{ color: "#aaa" }}>{num(stats?.reports?.dig?.total ?? 0)}</b></span>
                <span>Stack: <b style={{ color: "#aaa" }}>{num(stats?.reports?.stack?.total ?? 0)}</b></span>
                <span>This week: <b style={{ color: "#aaa" }}>{num(stats?.reports?.week ?? 0)}</b></span>
              </div>
            </>
          )}
        </div>
      </Sec>

      {/* API LIMITS */}
      <Sec title="⚡ API limits & quotas">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 10 }}>
          {(limits?.liveApis ?? []).map((api: any) => {
            const pct = api.limit && api.remaining != null ? Math.round((api.remaining / api.limit) * 100) : null;
            const color = pct === null ? "#555" : pct > 50 ? "#22c55e" : pct > 20 ? "#f59e0b" : "#ef4444";
            return (
              <a key={api.name} href={api.dashboardUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", background: "#111", border: `1px solid ${color}33`, borderRadius: 10, padding: "14px 16px", display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#ddd" }}>{api.icon} {api.name}</div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{api.subtitle}</div>
                  </div>
                  {pct !== null && <div style={{ fontSize: "1.1rem", fontWeight: 800, color }}>{pct}%</div>}
                  {api.error && <div style={{ fontSize: 10, color: "#ef4444" }}>fetch error</div>}
                </div>
                {api.remaining != null ? (
                  <>
                    <div style={{ height: 4, background: "#1e1e1e", borderRadius: 2, marginBottom: 6 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#666" }}>
                      <span style={{ color: "#aaa", fontWeight: 700 }}>{(api.remaining ?? 0).toLocaleString('en-US')}</span> remaining
                      {api.limit ? <span> / {api.limit.toLocaleString('en-US')}</span> : null}
                      {api.used != null ? <span style={{ marginLeft: 8, color: "#555" }}>{api.used.toLocaleString('en-US')} used</span> : null}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: "#555" }}>{api.error ? "Could not fetch — check dashboard ↗" : "Loading..."}</div>
                )}
                <div style={{ fontSize: 10, color: "#444", marginTop: 6 }}>{api.resetInfo}</div>
              </a>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {(limits?.manualApis ?? []).map((api: any) => (
            <a key={api.name} href={api.dashboardUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "12px 14px", display: "block" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#ddd", marginBottom: 4 }}>{api.icon} {api.name}</div>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 6 }}>{api.subtitle}</div>
              {api.limit && <div style={{ fontSize: 13, fontWeight: 700, color: "#aaa" }}>{api.limit.toLocaleString('en-US')} <span style={{ fontSize: 10, fontWeight: 400, color: "#555" }}>{api.note}</span></div>}
              {!api.limit && <div style={{ fontSize: 11, color: "#555" }}>{api.note}</div>}
              <div style={{ fontSize: 10, color: "#444", marginTop: 4 }}>{api.resetInfo} · View dashboard ↗</div>
            </a>
          ))}
        </div>
      </Sec>

      {/* QUICK LINKS */}
      <Sec title="🔗 Quick links">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {[
            ["Anthropic Console", "https://console.anthropic.com/workspaces/default/cost"],
            ["Vercel", "https://vercel.com/sametduman00s-projects/unbuilt"],
            ["Supabase", "https://supabase.com/dashboard/project/jlqawgrtnbizwqigbyho"],
            ["Clerk", "https://dashboard.clerk.com"],
            ["Google Analytics", "https://analytics.google.com"],
            ["Paddle", "https://vendors.paddle.com"],
          ].map(([l, u]) => (
            <a key={l} href={u} target="_blank" rel="noopener noreferrer"
              style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid #2a2a2a", background: "#111", color: "#888", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
              {l} ↗
            </a>
          ))}
        </div>
      </Sec>

      <div style={{ fontSize: 10, color: "#333", textAlign: "center" as const, marginTop: 16 }}>
        Auto-refreshes every 60s · {lastRef.toLocaleString()}
      </div>

      </>}
    </div>
  );
}
