export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";
import {
  emptyReactionCounts,
  isStoryReactionKey,
  type StoryReactionKey,
  type StoryReactionSummary,
} from "@/app/lib/reactions";

const VIEWER_COOKIE = "signal_vid";
const VIEWER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const USER_AGENT_MAX_CHARS = 200;

type ReactionRow = {
  reaction: StoryReactionKey;
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

function stableHash(value: string): string {
  const secret = process.env.VIEW_HASH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

function resolveViewer(req: NextRequest) {
  const existingViewerId = req.cookies.get(VIEWER_COOKIE)?.value?.trim();
  const viewerId = existingViewerId || randomUUID();
  const shouldSetViewerCookie = !existingViewerId;
  const ipBucket = toIpBucket(getClientIp(req));
  const normalizedUserAgent = normalizeUserAgent(req.headers.get("user-agent") ?? "");
  const viewerKey = stableHash(`${viewerId}|${ipBucket}|${normalizedUserAgent}`);

  return { viewerId, viewerKey, shouldSetViewerCookie };
}

async function loadReactionSummary(storyId: string, viewerKey: string): Promise<StoryReactionSummary> {
  const supabase = supabaseServer();
  const [{ data: rows, error: rowsError }, { data: ownRow, error: ownError }] = await Promise.all([
    supabase.from("story_reactions").select("reaction").eq("story_id", storyId),
    supabase.from("story_reactions").select("reaction").eq("story_id", storyId).eq("viewer_key", viewerKey).maybeSingle(),
  ]);

  if (rowsError) throw rowsError;
  if (ownError) throw ownError;

  const counts = emptyReactionCounts();
  for (const row of (rows ?? []) as ReactionRow[]) {
    if (isStoryReactionKey(row.reaction)) counts[row.reaction] += 1;
  }

  const selectedReaction =
    ownRow && isStoryReactionKey((ownRow as Partial<ReactionRow>).reaction ?? "")
      ? ((ownRow as ReactionRow).reaction as StoryReactionKey)
      : null;

  return { counts, selectedReaction };
}

function withViewerCookie(
  res: NextResponse,
  viewerId: string,
  shouldSetViewerCookie: boolean
) {
  if (!shouldSetViewerCookie) return res;

  res.cookies.set({
    name: VIEWER_COOKIE,
    value: viewerId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: VIEWER_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storyId = (await params).id?.trim();
    if (!storyId) {
      return NextResponse.json({ error: "Invalid story id" }, { status: 400 });
    }

    const { viewerId, viewerKey, shouldSetViewerCookie } = resolveViewer(req);
    const summary = await loadReactionSummary(storyId, viewerKey);
    const res = NextResponse.json(summary);
    return withViewerCookie(res, viewerId, shouldSetViewerCookie);
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storyId = (await params).id?.trim();
    if (!storyId) {
      return NextResponse.json({ error: "Invalid story id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { reaction?: string };
    const reaction = String(body.reaction ?? "").trim();
    if (!isStoryReactionKey(reaction)) {
      return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { viewerId, viewerKey, shouldSetViewerCookie } = resolveViewer(req);

    const { data: existing, error: existingError } = await supabase
      .from("story_reactions")
      .select("reaction")
      .eq("story_id", storyId)
      .eq("viewer_key", viewerKey)
      .maybeSingle();

    if (existingError) throw existingError;

    const existingReaction =
      existing && isStoryReactionKey((existing as Partial<ReactionRow>).reaction ?? "")
        ? ((existing as ReactionRow).reaction as StoryReactionKey)
        : null;

    if (existingReaction === reaction) {
      const { error: deleteError } = await supabase
        .from("story_reactions")
        .delete()
        .eq("story_id", storyId)
        .eq("viewer_key", viewerKey);

      if (deleteError) throw deleteError;
    } else {
      const { error: upsertError } = await supabase.from("story_reactions").upsert(
        {
          story_id: storyId,
          viewer_key: viewerKey,
          reaction,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "story_id,viewer_key" }
      );

      if (upsertError) throw upsertError;
    }

    const summary = await loadReactionSummary(storyId, viewerKey);
    const res = NextResponse.json(summary);
    return withViewerCookie(res, viewerId, shouldSetViewerCookie);
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}

