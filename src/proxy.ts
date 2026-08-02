import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const RATE_BURST_THRESHOLD = 30;
const RATE_BURST_WINDOW_MS = 10000;

let burstMap = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "";
  return req.headers.get("x-real-ip") ?? "";
}

async function isIpBlocked(ip: string): Promise<boolean> {
  if (!ip) return false;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(
      `${url}/rest/v1/blocked_ips?ip=eq.${encodeURIComponent(ip)}&select=ip`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { ip: string }[];
    return data.length > 0;
  } catch {
    return false;
  }
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

  if (await isIpBlocked(ip)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const now = Date.now();
  const arr = (burstMap.get(ip) ?? []).filter((t) => now - t < RATE_BURST_WINDOW_MS);
  arr.push(now);
  burstMap.set(ip, arr);
  if (burstMap.size > 5000) {
    burstMap = new Map([...burstMap.entries()].slice(-2000));
  }
  if (arr.length === RATE_BURST_THRESHOLD) {
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
