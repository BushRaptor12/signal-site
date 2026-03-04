export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";

const VIEWER_COOKIE = "signal_vid";
const VIEWER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const USER_AGENT_MAX_CHARS = 200;

type RecordStoryViewRow = {
  counted?: boolean | null;
  views?: number | null;
  blocked?: boolean | null;
};

function messageFromError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const fallback =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-client-ip") ??
    "";

  return fallback.trim() || "0.0.0.0";
}

function toIpBucket(ip: string): string {
  if (ip.includes(":")) {
    const bucket = ip
      .toLowerCase()
      .split(":")
      .filter(Boolean)
      .slice(0, 4)
      .join(":");
    return bucket ? `${bucket}::/64` : "ipv6-unknown";
  }

  const parts = ip.split(".");
  if (parts.length !== 4) return "ipv4-unknown";

  const octets = parts.map((part) => Number(part));
  const valid = octets.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
  if (!valid) return "ipv4-unknown";

  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

function normalizeUserAgent(raw: string): string {
  return raw.toLowerCase().slice(0, USER_AGENT_MAX_CHARS);
}

function isLikelyBot(userAgent: string): boolean {
  if (!userAgent.trim()) return true;
  return /(bot|spider|crawl|slurp|headless|wget|curl|python-requests|postman)/i.test(userAgent);
}

function stableHash(value: string): string {
  const secret = process.env.VIEW_HASH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = supabaseServer();
    const id = (await params).id?.trim();
    if (!id) return NextResponse.json({ error: "Invalid story id" }, { status: 400 });

    const rawUserAgent = req.headers.get("user-agent") ?? "";
    if (isLikelyBot(rawUserAgent)) {
      return NextResponse.json({ ok: true, counted: false, blocked: true, reason: "bot" });
    }

    const existingViewerId = req.cookies.get(VIEWER_COOKIE)?.value?.trim();
    const viewerId = existingViewerId || randomUUID();
    const shouldSetViewerCookie = !existingViewerId;

    const ipBucket = toIpBucket(getClientIp(req));
    const normalizedUserAgent = normalizeUserAgent(rawUserAgent);

    const viewerKey = stableHash(`${viewerId}|${ipBucket}|${normalizedUserAgent}`);
    const ipKey = stableHash(`${id}|${ipBucket}`);

    const { data, error: recordError } = await supabase.rpc("record_story_view", {
      p_story_id: id,
      p_viewer_key: viewerKey,
      p_ip_key: ipKey,
      p_user_agent: normalizedUserAgent,
    });
    if (recordError) throw recordError;

    const row = (Array.isArray(data) ? data[0] : data) as RecordStoryViewRow | null;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const counted = Boolean(row?.counted);
    const blocked = Boolean(row?.blocked);
    const views = Number(row?.views ?? 0);

    const res = NextResponse.json({ ok: true, counted, blocked, views });
    if (shouldSetViewerCookie) {
      res.cookies.set({
        name: VIEWER_COOKIE,
        value: viewerId,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: VIEWER_COOKIE_MAX_AGE_SECONDS,
        path: "/",
      });
    }

    return res;
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
