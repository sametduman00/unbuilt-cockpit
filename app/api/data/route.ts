import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  const sb = getSB();
  const today = new Date(); today.setHours(0,0,0,0);
  const week = new Date(Date.now() - 7*24*3600*1000);
  const month = new Date(Date.now() - 30*24*3600*1000);
  const BASE = "https://www.unbuilt.me";

  const CHECKS = [
    { name: "Homepage", url: `${BASE}/`, expect: 200 },
    { name: "Pulse API", url: `${BASE}/api/pulse`, expect: 200 },
    { name: "Pricing", url: `${BASE}/pricing`, expect: 200 },
    { name: "How it works", url: `${BASE}/how-it-works`, expect: 200 },
    { name: "Analyze API", url: `${BASE}/api/analyze`, expect: 405 },
    { name: "Stack API", url: `${BASE}/api/stack`, expect: 405 },
    { name: "Credits API", url: `${BASE}/api/credits`, expect: 401 },
    { name: "Reports API", url: `${BASE}/api/reports`, expect: 401 },
  ];

  const [healthResults, statsResult] = await Promise.all([
    Promise.all(CHECKS.map(async (ep) => {
      const start = Date.now();
      try {
        const res = await fetch(ep.url, { signal: AbortSignal.timeout(6000) });
        const latency = Date.now() - start;
        const ok = res.status === ep.expect || (ep.expect === 200 && res.ok);
        return { name: ep.name, status: res.status, ok, latency, error: null };
      } catch (e) {
        return { name: ep.name, status: 0, ok: false, latency: Date.now() - start, error: e instanceof Error ? e.message : "Timeout" };
      }
    })),
    (async () => {
      const [
        { count: usersTotal }, { count: usersToday }, { count: usersWeek },
        { count: reportsTotal }, { count: reportsToday }, { count: reportsWeek },
        { count: digTotal }, { count: stackTotal }, { count: digToday }, { count: stackToday },
        { data: orders }, { data: pulse }, { data: daily },
      ] = await Promise.all([
        sb.from("user_credits").select("*", { count: "exact", head: true }),
        sb.from("user_credits").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        sb.from("user_credits").select("*", { count: "exact", head: true }).gte("created_at", week.toISOString()),
        sb.from("user_reports").select("*", { count: "exact", head: true }),
        sb.from("user_reports").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        sb.from("user_reports").select("*", { count: "exact", head: true }).gte("created_at", week.toISOString()),
        sb.from("user_reports").select("*", { count: "exact", head: true }).eq("tool", "gap-analysis"),
        sb.from("user_reports").select("*", { count: "exact", head: true }).eq("tool", "stack-advisor"),
        sb.from("user_reports").select("*", { count: "exact", head: true }).eq("tool", "gap-analysis").gte("created_at", today.toISOString()),
        sb.from("user_reports").select("*", { count: "exact", head: true }).eq("tool", "stack-advisor").gte("created_at", today.toISOString()),
        sb.from("orders").select("id,package_slug,credits_added,amount_usd,created_at").order("created_at", { ascending: false }).limit(20),
        sb.from("pulse_feed_cache").select("generated_at,signals").order("generated_at", { ascending: false }).limit(1).single(),
        sb.from("user_reports").select("created_at,tool").gte("created_at", month.toISOString()).order("created_at", { ascending: true }),
      ]);

      const totalRevenue = orders?.reduce((s, o) => s + (o.amount_usd ?? 0), 0) ?? 0;
      const todayRevenue = orders?.filter(o => new Date(o.created_at) >= today).reduce((s, o) => s + (o.amount_usd ?? 0), 0) ?? 0;
      const weekRevenue = orders?.filter(o => new Date(o.created_at) >= week).reduce((s, o) => s + (o.amount_usd ?? 0), 0) ?? 0;
      const creditsGiven = orders?.reduce((s, o) => s + (o.credits_added ?? 0), 0) ?? 0;
      const pulseSignals = Array.isArray(pulse?.signals) ? (pulse.signals as any[]).length : 0;
      const pulseAge = pulse?.generated_at ? Math.floor((Date.now() - new Date(pulse.generated_at).getTime()) / 60000) : null;

      const dailyMap: Record<string, { dig: number; stack: number }> = {};
      for (const r of daily ?? []) {
        const d = r.created_at.slice(0, 10);
        if (!dailyMap[d]) dailyMap[d] = { dig: 0, stack: 0 };
        if (r.tool === "gap-analysis") dailyMap[d].dig++;
        else dailyMap[d].stack++;
      }

      return {
        users: { total: usersTotal ?? 0, today: usersToday ?? 0, week: usersWeek ?? 0 },
        reports: { total: reportsTotal ?? 0, today: reportsToday ?? 0, week: reportsWeek ?? 0, dig: { total: digTotal ?? 0, today: digToday ?? 0 }, stack: { total: stackTotal ?? 0, today: stackToday ?? 0 } },
        revenue: { total: totalRevenue, today: todayRevenue, week: weekRevenue },
        orders: { total: orders?.length ?? 0, today: orders?.filter(o => new Date(o.created_at) >= today).length ?? 0, credits: creditsGiven, recent: orders?.slice(0, 10) ?? [] },
        pulse: { generatedAt: pulse?.generated_at ?? null, signals: pulseSignals, ageMinutes: pulseAge },
        daily: dailyMap,
      };
    })(),
  ]);

  // Telegram alert if any check fails
  const failing = healthResults.filter(c => !c.ok);
  if (failing.length > 0) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (token && chatId) {
      const msg = `🚨 <b>Health alert!</b>\n\n${failing.map(c => `${c.name}: HTTP ${c.status || "TIMEOUT"}`).join("\n")}`;
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ health: healthResults, ...statsResult, timestamp: new Date().toISOString() });
}
