// Client IP extraction shared by the edge middleware (src/proxy.ts) and
// server code (src/lib/security.ts). Pure module — no next/headers imports,
// so it is safe to bundle into the edge runtime.
//
// X-Forwarded-For is attacker-controlled: a naive split(",")[0] trusts the
// leftmost (client-supplied) value. We walk the list from the right so we
// land on the value appended by the trusted forwarding proxy, skipping
// private/reserved rewrite landmarks. This prevents spoofing by a client
// insisting on a forged leading entry.

const GLOBAL_IP_RE = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;

function isGlobalIp(ip: string): boolean {
  if (!GLOBAL_IP_RE.test(ip)) return false;
  const [a, b] = ip.split(".").map((n) => Number(n));
  const lo = (n: number) => ((n === undefined ? 0 : n) & 255) >>> 0;
  if (lo(a) === 10) return false;
  if (lo(a) === 127) return false;
  if (lo(a) === 0) return false;
  if (lo(a) === 169 && lo(b) === 254) return false;
  if (lo(a) === 172 && lo(b) >= 16 && lo(b) <= 31) return false;
  if (lo(a) === 192 && lo(b) === 168) return false;
  if (lo(a) >= 224) return false; // multicast + reserved
  return true;
}

export function parseClientIp(input: string | null | undefined): string {
  if (!input) return "";
  const candidates = input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (candidates.length === 0) return "";
  // Trail-end walk: prefer the rightmost public address (appended by the
  // nearest trusted proxy), falling back to the final value.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const ip = candidates[i];
    if (ip.startsWith("::ffff:")) {
      return ip.slice("::ffff:".length);
    }
    if (isGlobalIp(ip)) return ip;
  }
  const last = candidates[candidates.length - 1];
  return last.startsWith("::ffff:") ? last.slice("::ffff:".length) : last;
}