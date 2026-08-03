import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { parseClientIp } from "@/lib/ip";

const RATE_BURST_THRESHOLD = 30;
const RATE_BURST_WINDOW_MS = 10000;

const BLOCKED_IPS_TTL_MS = 60 * 1000;
const BLOCKED_IPS_MAX = 10000;

let burstMap = new Map<string, number[]>();

// Cached blocklist: refreshed once per minute instead of fetching
// Supabase on every request. On refresh failure the last known list
// is kept, so a transient DB error can't open the gate.
let blockedIps = new Set<string>();
let blockedIpsLoadedAt = 0;
let blockedIpsInFlight: Promise<void> | null = null;

function clientIp(req: NextRequest): string {
  return parseClientIp(req.headers.get("x-forwarded-for")) || req.headers.get("x-real-ip") || "";
}

// IPv4/IPv6 loopback only ever resolves to the host machine itself.
// Exempting it keeps the dev/admin machine out of its own blocklist and
// stops localhost browsing from spamming the security monitor.
function isLoopback(ip: string): boolean {
  if (!ip) return false;
  return ip === "::1" || ip === "::" || ip === "127.0.0.1" || ip.startsWith("127.");
}

async function refreshBlockedIps(): Promise<void> {
  // Single-flight: concurrent requests share one in-flight refresh instead
  // of each hammering Supabase when the cache goes stale.
  if (blockedIpsInFlight) return blockedIpsInFlight;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  blockedIpsInFlight = (async () => {
    try {
      const res = await fetch(
        `${url}/rest/v1/blocked_ips?select=ip&limit=${BLOCKED_IPS_MAX}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { ip: string }[];
      blockedIps = new Set(data.map((d) => d.ip));
      blockedIpsLoadedAt = Date.now();
    } catch {
      // keep the last known list on failures
    } finally {
      blockedIpsInFlight = null;
    }
  })();
  return blockedIpsInFlight;
}

async function isIpBlocked(ip: string): Promise<boolean> {
  if (!ip) return false;
  if (Date.now() - blockedIpsLoadedAt > BLOCKED_IPS_TTL_MS) {
    await refreshBlockedIps();
  }
  return blockedIps.has(ip);
}

async function logEvent(ip: string, detail: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/security_events`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        type: "ddos",
        severity: "critical",
        ip,
        detail: detail.slice(0, 2000),
        path: "",
        method: "",
        user_agent: "",
        user_id: null,
      }),
    });
  } catch {
    // ignore
  }
}

export default clerkMiddleware(async (_auth, req) => {
  const ip = clientIp(req);

  if (!isLoopback(ip) && (await isIpBlocked(ip))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const now = Date.now();
  const arr = (burstMap.get(ip) ?? []).filter((t) => now - t < RATE_BURST_WINDOW_MS);
  arr.push(now);
  burstMap.set(ip, arr);
  if (burstMap.size > 5000) {
    burstMap = new Map([...burstMap.entries()].slice(-2000));
  }
  if (!isLoopback(ip) && arr.length === RATE_BURST_THRESHOLD) {
    void logEvent(ip, `Request burst: ${arr.length} requests in ${RATE_BURST_WINDOW_MS / 1000}s`);
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
