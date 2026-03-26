"use client";
import { useState, useEffect, useCallback } from "react";

const PASS = process.env.NEXT_PUBLIC_COCKPIT_PASSWORD ?? "";
const GMB = "#2D4C47"; // Grand Manan Black

const $n = (n: number) => `$${(n ?? 0).toFixed(2)}`;
const num = (n: number) => (n ?? 0).toLocaleString("en-US");
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const s = {
  bg: "#F7F6F3",
  surface: "#FFFFFF",
  border: "#E8E6E1",
  borderLight: "#F0EEE9",
  text: "#1C1C1C",
  textMid: "#555",
  textDim: "#888",
  textFaint: "#BBB",
  accent: GMB,
  accentBg: "#EBF0EF",
  danger: "#D94F3D",
  dangerBg: "#FEF2F0",
  warn: "#B45309",
  warnBg: "#FFFBEB",
};

function Card({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: s.textFaint, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: accent ?? s.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: s.textDim, marginTop: 5, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function Sec({ title, children, noBorder }: { title: string; children: React.ReactNode; noBorder?: boolean }) {
  return (
    <div style={{ marginBottom: 32 }}>
      {!noBorder && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase" as const, color: s.textFaint, marginBottom: 14 }}>{title}</div>}
      {noBorder && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase" as const, color: s.textFaint, marginBottom: 14 }}>{title}</div>}
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
  const [limits, setLimits] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hChecking, setHChecking] = useState(false);
  const [lastRef, setLastRef] = useState(new Date());

  const fetchAll = useCallback(async () => {
    const base = process.env.NEXT_PUBLIC_UNBUILT_API ?? "https://www.unbuilt.me";
    const key  = process.env.NEXT_PUBLIC_COCKPIT_API_KEY ?? "";
    const hdrs = { "x-cockpit-key": key };
    const [s, l] = await Promise.all([
      fetch(`${base}/api/cockpit/stats`,  { headers: hdrs }).then(r => r.json()).catch(() => null),
      fetch(`${base}/api/cockpit/limits`, { headers: hdrs }).then(r => r.json()).catch(() => null),
    ]);
    if (s) { setStats(s); setLastRef(new Date()); }
    if (l) setLimits(l);
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
    Promise.all([fetchAll(), runHealth()]).finally(() => setLoading(false));
    const si = setInterval(fetchAll, 60000);
    return () => clearInterval(si);
  }, [auth, fetchAll, runHealth]);

  const login = () => { if (pw === PASS) { setAuth(true); setPwErr(false); } else setPwErr(true); };

  if (!auth) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: s.bg }}>
      <div style={{ width: 320, background: s.surface, border: `1px solid ${s.border}`, borderRadius: 14, padding: "32px 28px", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const, color: s.textFaint, marginBottom: 4 }}>Unbuilt</div>
        <div style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 24, color: s.text }}>Cockpit</div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && login()}
          placeholder="Password" autoFocus
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${pwErr ? s.danger : s.border}`, background: s.bg, color: s.text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, marginBottom: 10 }}
        />
        <button onClick={login} style={{ width: "100%", padding: "10px 0", borderRadius: 8, background: s.accent, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Enter</button>
        {pwErr && <div style={{ color: s.danger, fontSize: 12, marginTop: 8, textAlign: "center" as const }}>Wrong password</div>}
      </div>
    </div>
  );

  const failing = health?.checks?.filter((c: any) => !c.ok) ?? [];
  const allOk   = health?.checks?.every((c: any) => c.ok);
  const pulseOk = stats?.pulse?.ageMinutes != null && stats.pulse.ageMinutes < 180;
  const dailyKeys = stats ? Object.keys(stats.daily ?? {}).sort().slice(-14) : [];
  const maxVal = dailyKeys.length ? Math.max(1, ...dailyKeys.map(k => (stats.daily[k]?.dig ?? 0) + (stats.daily[k]?.stack ?? 0))) : 1;

  return (
    <div style={{ padding: "28px 36px 80px", maxWidth: 1020, margin: "0 auto" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, paddingBottom: 20, borderBottom: `1px solid ${s.border}` }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const, color: s.textFaint, marginBottom: 3 }}>Unbuilt</div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: s.text }}>Cockpit</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: s.textDim }}>{lastRef.toLocaleTimeString()}</span>
          <button onClick={fetchAll} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${s.border}`, background: s.surface, color: s.textMid, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>↻</button>
          <button onClick={runHealth} disabled={hChecking}
            style={{ padding: "6px 16px", borderRadius: 7, border: "none",
              background: allOk === false ? s.danger : allOk === true ? s.accent : s.border,
              color: allOk !== undefined ? "#fff" : s.textMid,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: hChecking ? 0.7 : 1 }}>
            {hChecking ? "Checking…" : allOk === false ? `⚠ ${failing.length} down` : allOk === true ? "✓ All systems go" : "Check health"}
          </button>
        </div>
      </div>

      {loading ? <div style={{ color: s.textDim, fontSize: 13 }}>Loading…</div> : <>

      {/* HEALTH */}
      <Sec title="Site health">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {(health?.checks ?? []).map((c: any) => (
            <div key={c.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 6,
              background: c.ok ? s.accentBg : s.dangerBg,
              border: `1px solid ${c.ok ? "#C5DAD7" : "#F5C6C0"}` }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.ok ? s.accent : s.danger, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: c.ok ? s.accent : s.danger }}>{c.name}</span>
              <span style={{ fontSize: 11, color: c.ok ? "#6A9E98" : "#E07068" }}>{c.latency}ms</span>
            </div>
          ))}
        </div>
        {failing.map((c: any) => (
          <div key={c.name} style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: s.dangerBg, border: `1px solid #F5C6C0` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: s.danger }}>⚠ {c.name} — HTTP {c.status || "timeout"}</div>
            {c.error && <div style={{ fontSize: 11, color: s.danger, fontFamily: "monospace", marginTop: 3, opacity: 0.8 }}>{c.error}</div>}
          </div>
        ))}
      </Sec>

      {/* USAGE */}
      <Sec title="Usage">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <Card label="Users today"   value={stats?.users?.today ?? 0}          sub={`${num(stats?.users?.week ?? 0)} this week · ${num(stats?.users?.total ?? 0)} total`} />
          <Card label="Reports today" value={stats?.reports?.today ?? 0}        sub={`${num(stats?.reports?.week ?? 0)} this week · ${num(stats?.reports?.total ?? 0)} total`} />
          <Card label="Dig today"     value={stats?.reports?.dig?.today ?? 0}   sub={`${num(stats?.reports?.dig?.total ?? 0)} total`} accent={s.accent} />
          <Card label="Stack today"   value={stats?.reports?.stack?.today ?? 0} sub={`${num(stats?.reports?.stack?.total ?? 0)} total`} accent="#3B7DBF" />
        </div>
      </Sec>

      {/* REVENUE */}
      <Sec title="Revenue">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
          <Card label="Today"        value={$n(stats?.revenue?.today ?? 0)}   sub={`${$n(stats?.revenue?.week ?? 0)} this week`} accent={s.accent} />
          <Card label="All time"     value={$n(stats?.revenue?.total ?? 0)}   accent={s.accent} />
          <Card label="Orders today" value={stats?.orders?.today ?? 0}        sub={`${num(stats?.orders?.total ?? 0)} total`} />
          <Card label="Credits sold" value={num(stats?.orders?.credits ?? 0)} sub="all time" />
        </div>
        {(stats?.orders?.recent ?? []).length > 0 && (
          <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ borderBottom: `1px solid ${s.borderLight}`, background: s.bg }}>
                {["When","Package","Credits","Amount"].map(h => (
                  <th key={h} style={{ padding: "8px 16px", textAlign: "left" as const, fontSize: 10, fontWeight: 700, color: s.textFaint, letterSpacing: ".07em", textTransform: "uppercase" as const }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{stats.orders.recent.map((o: any, i: number) => (
                <tr key={i} style={{ borderBottom: `1px solid ${s.borderLight}` }}>
                  <td style={{ padding: "9px 16px", color: s.textDim }}>{ago(o.created_at)}</td>
                  <td style={{ padding: "9px 16px", fontWeight: 600, color: s.text }}>{o.package_slug}</td>
                  <td style={{ padding: "9px 16px", color: s.textMid }}>{o.credits_added}</td>
                  <td style={{ padding: "9px 16px", color: s.accent, fontWeight: 700 }}>{$n(o.amount_usd ?? 0)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Sec>

      {/* API COSTS */}
      <Sec title="API costs — Anthropic">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: s.textFaint, marginBottom: 8 }}>March 2026 baseline</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: s.text, marginBottom: 8 }}>$40.04</div>
            <div style={{ fontSize: 11, color: s.textDim, lineHeight: 1.7 }}>
              Sonnet 4.6: $16.07/mo · Opus: $11.33/mo · Haiku: $8.45/mo<br/>
              Dig/Stack: ~$0.45–0.75/query · Pulse: ~$3.21/day
            </div>
          </div>
          <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column" as const, gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: s.textFaint }}>Live billing</div>
            <div style={{ fontSize: 12, color: s.textMid, lineHeight: 1.6 }}>Real-time token usage is in Anthropic Console.</div>
            <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer"
              style={{ padding: "8px 14px", borderRadius: 8, background: s.accent, color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 600, display: "inline-block", width: "fit-content" }}>
              Open billing ↗
            </a>
          </div>
        </div>
      </Sec>

      {/* PULSE */}
      <Sec title="Pulse">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          <Card label="Last update" value={stats?.pulse?.generatedAt ? ago(stats.pulse.generatedAt) : "Never"}
            sub={stats?.pulse?.generatedAt ? new Date(stats.pulse.generatedAt).toLocaleString() : "—"}
            accent={pulseOk ? s.text : s.danger} />
          <Card label="Signals in feed" value={num(stats?.pulse?.signals ?? 0)} />
          <Card label="Feed age" value={stats?.pulse?.ageMinutes != null ? `${stats.pulse.ageMinutes}m` : "?"}
            sub={pulseOk ? "Fresh" : "⚠ Stale — check cron"} accent={pulseOk ? s.text : s.danger} />
        </div>
      </Sec>

      {/* CHART */}
      <Sec title="Daily reports — last 14 days">
        <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 10, padding: "20px 18px 14px" }}>
          {dailyKeys.length === 0 ? <div style={{ fontSize: 12, color: s.textDim }}>No data yet</div> : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 72 }}>
                {dailyKeys.map(k => {
                  const d = stats.daily[k]; const total = (d?.dig ?? 0) + (d?.stack ?? 0);
                  const h = total > 0 ? Math.max(5, Math.round((total / maxVal) * 64)) : 3;
                  return (
                    <div key={k} title={`${k}: ${d?.dig ?? 0} Dig, ${d?.stack ?? 0} Stack`}
                      style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
                      <div style={{ width: "100%", display: "flex", flexDirection: "column" as const, justifyContent: "flex-end", height: 64 }}>
                        <div style={{ height: h, borderRadius: 3, background: total > 0 ? s.accent : s.borderLight }} />
                      </div>
                      <div style={{ fontSize: 9, color: s.textFaint, marginTop: 5, transform: "rotate(-45deg)", whiteSpace: "nowrap" as const }}>{k.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 16, fontSize: 11, color: s.textDim, display: "flex", gap: 20 }}>
                <span>Dig: <b style={{ color: s.text }}>{num(stats?.reports?.dig?.total ?? 0)}</b></span>
                <span>Stack: <b style={{ color: s.text }}>{num(stats?.reports?.stack?.total ?? 0)}</b></span>
                <span>This week: <b style={{ color: s.text }}>{num(stats?.reports?.week ?? 0)}</b></span>
              </div>
            </>
          )}
        </div>
      </Sec>

      {/* API LIMITS */}
      <Sec title="API limits & quotas">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {(limits?.liveApis ?? []).map((api: any) => {
            const pct = api.limit && api.remaining != null ? Math.round((api.remaining / api.limit) * 100) : null;
            const barColor = pct === null ? s.accent : pct > 50 ? s.accent : pct > 20 ? s.warn : s.danger;
            return (
              <a key={api.name} href={api.dashboardUrl} target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: "none", background: s.surface, border: `1px solid ${s.border}`, borderRadius: 10, padding: "14px 16px", display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: s.text }}>{api.icon} {api.name}</div>
                    <div style={{ fontSize: 11, color: s.textDim, marginTop: 1 }}>{api.subtitle}</div>
                  </div>
                  {pct !== null && <div style={{ fontSize: "1rem", fontWeight: 700, color: barColor }}>{pct}%</div>}
                  {api.error && <span style={{ fontSize: 10, color: s.textDim, background: s.bg, padding: "2px 6px", borderRadius: 4 }}>API unavailable</span>}
                </div>
                {api.remaining != null ? (
                  <>
                    <div style={{ height: 3, background: s.borderLight, borderRadius: 2, marginBottom: 6 }}>
                      <div style={{ height: "100%", width: `${Math.min(pct ?? 100, 100)}%`, background: barColor, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 11, color: s.textDim }}>
                      <b style={{ color: s.text }}>{(api.remaining ?? 0).toLocaleString("en-US")}</b> remaining
                      {api.limit ? <span style={{ color: s.textFaint }}> / {api.limit.toLocaleString("en-US")}</span> : null}
                      {api.note && <span style={{ marginLeft: 8, color: s.textFaint }}>{api.note}</span>}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: s.textDim, display: "flex", alignItems: "center", gap: 8 }}>
                    {api.error ? (
                      <><span>API unavailable —</span><a href="https://app.scrapecreators.com" target="_blank" rel="noopener noreferrer" style={{ color: s.accent, fontWeight: 600, textDecoration: "none" }}>Open dashboard ↗</a></>
                    ) : "Loading…"}
                  </div>
                )}
                <div style={{ fontSize: 10, color: s.textFaint, marginTop: 6 }}>{api.resetInfo}</div>
              </a>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {(limits?.manualApis ?? []).map((api: any) => (
            <a key={api.name} href={api.dashboardUrl} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: "none", background: s.surface, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px", display: "block" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: s.text, marginBottom: 3 }}>{api.icon} {api.name}</div>
              <div style={{ fontSize: 11, color: s.textDim, marginBottom: 6 }}>{api.subtitle}</div>
              {api.limit && <div style={{ fontSize: "1rem", fontWeight: 700, color: s.text }}>{api.limit.toLocaleString("en-US")} <span style={{ fontSize: 10, fontWeight: 400, color: s.textDim }}>{api.note}</span></div>}
              {!api.limit && <div style={{ fontSize: 11, color: s.textMid }}>{api.note}</div>}
              <div style={{ fontSize: 10, color: s.textFaint, marginTop: 5 }}>{api.resetInfo} · View dashboard ↗</div>
            </a>
          ))}
        </div>
      </Sec>

      {/* QUICK LINKS */}
      <Sec title="Quick links">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {[
            ["Anthropic Console", "https://console.anthropic.com/workspaces/default/cost"],
            ["Vercel", "https://vercel.com/sam-3735s-projects/unbuilt"],
            ["Supabase", "https://supabase.com/dashboard/project/jlqawgrtnbizwqigbyho"],
            ["Clerk", "https://dashboard.clerk.com"],
            ["Google Analytics", "https://analytics.google.com"],
            ["Paddle", "https://vendors.paddle.com"],
          ].map(([l, u]) => (
            <a key={l} href={u} target="_blank" rel="noopener noreferrer"
              style={{ padding: "7px 13px", borderRadius: 7, border: `1px solid ${s.border}`, background: s.surface, color: s.textMid, textDecoration: "none", fontSize: 12, fontWeight: 500 }}>
              {l} ↗
            </a>
          ))}
        </div>
      </Sec>

      <div style={{ fontSize: 11, color: s.textFaint, textAlign: "center" as const, marginTop: 8 }}>
        Auto-refreshes every 60s · {lastRef.toLocaleString()}
      </div>

      </>}
    </div>
  );
}
