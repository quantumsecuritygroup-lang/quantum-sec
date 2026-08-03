import { headers } from "next/headers";
import { getServerClient } from "./supabase";
import { parseClientIp } from "./ip";

export type SecurityEventType =
  | "ddos"
  | "tamper"
  | "rate_limit"
  | "unauthorized"
  | "banned_attempt"
  | "blocked_ip"
  | "manual";

export type SecuritySeverity = "info" | "warn" | "critical";

export interface SecurityEventInput {
  type: SecurityEventType;
  severity?: SecuritySeverity;
  detail?: string;
  path?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
  userId?: string | null;
}

async function getIp(): Promise<string> {
  const h = await headers();
  return parseClientIp(h.get("x-forwarded-for")) || h.get("x-real-ip") || "";
}

export async function logSecurityEvent(input: SecurityEventInput): Promise<void> {
  const sb = getServerClient();
  if (!sb) return;
  try {
    const h = await headers();
    await sb.from("security_events").insert({
      type: input.type,
      severity: input.severity ?? "warn",
      detail: (input.detail ?? "").slice(0, 2000),
      path: (input.path ?? h.get("x-pathname") ?? "").slice(0, 500),
      method: input.method ?? "",
      user_agent: (input.userAgent ?? h.get("user-agent") ?? "").slice(0, 500),
      ip: input.ip ?? (await getIp()),
      user_id: input.userId ?? null,
    });
  } catch {
    // never let logging break the request
  }
}
