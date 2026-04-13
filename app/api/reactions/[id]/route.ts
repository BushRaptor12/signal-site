export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAccountUserIdFromCookieHeader } from "@/app/lib/account.server";
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
  id: number;
  reaction: StoryReactionKey;
  user_id: string | null;
  viewer_key: string | null;
};

function readReaction(row: Partial<ReactionRow> | null | undefined) {
  return row && isStoryReactionKey(row.reaction ?? "") ? (row.reaction as StoryReactionKey) : null;
}

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

async function loadReactionSummary(storyId: string, viewerKey: string, accountUserId: string | null): Promise<StoryReactionSummary> {
  const supabase = supabaseServer();
  const ownAccountPromise = accountUserId
    ? supabase.from("story_reactions").select("reaction").eq("story_id", storyId).eq("user_id", accountUserId).maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [{ data: rows, error: rowsError }, { data: ownAccountRow, error: ownAccountError }, { data: ownViewerRow, error: ownViewerError }] = await Promise.all([
    supabase.from("story_reactions").select("reaction").eq("story_id", storyId),
    ownAccountPromise,
    supabase.from("story_reactions").select("reaction").eq("story_id", storyId).is("user_id", null).eq("viewer_key", viewerKey).maybeSingle(),
  ]);

  if (rowsError) throw rowsError;
  if (ownAccountError) throw ownAccountError;
  if (ownViewerError) throw ownViewerError;

  const counts = emptyReactionCounts();
  for (const row of (rows ?? []) as ReactionRow[]) {
    if (isStoryReactionKey(row.reaction)) counts[row.reaction] += 1;
  }

  const selectedReaction = readReaction(ownAccountRow as Partial<ReactionRow> | null) ?? readReaction(ownViewerRow as Partial<ReactionRow> | null);

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
    const accountUserId = getAccountUserIdFromCookieHeader(req.headers.get("cookie"));
    const summary = await loadReactionSummary(storyId, viewerKey, accountUserId);
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
    const accountUserId = getAccountUserIdFromCookieHeader(req.headers.get("cookie"));

    if (accountUserId) {
      const [{ data: accountRow, error: accountError }, { data: viewerRow, error: viewerError }] = await Promise.all([
        supabase.from("story_reactions").select("id, reaction, user_id, viewer_key").eq("story_id", storyId).eq("user_id", accountUserId).maybeSingle(),
        supabase.from("story_reactions").select("id, reaction, user_id, viewer_key").eq("story_id", storyId).is("user_id", null).eq("viewer_key", viewerKey).maybeSingle(),
      ]);

      if (accountError) throw accountError;
      if (viewerError) throw viewerError;

      const existingAccountReaction = readReaction(accountRow as Partial<ReactionRow> | null);
      let migratedViewerRowToAccount = false;

      if (existingAccountReaction === reaction) {
        const { error: deleteAccountError } = await supabase
          .from("story_reactions")
          .delete()
          .eq("story_id", storyId)
          .eq("user_id", accountUserId);

        if (deleteAccountError) throw deleteAccountError;
      } else if (accountRow) {
        const { error: updateAccountError } = await supabase
          .from("story_reactions")
          .update({
            reaction,
            updated_at: new Date().toISOString(),
            viewer_key: null,
          })
          .eq("id", (accountRow as ReactionRow).id);

        if (updateAccountError) throw updateAccountError;
      } else if (viewerRow) {
        const { error: migrateViewerError } = await supabase
          .from("story_reactions")
          .update({
            reaction,
            updated_at: new Date().toISOString(),
            user_id: accountUserId,
            viewer_key: null,
          })
          .eq("id", (viewerRow as ReactionRow).id);

        if (migrateViewerError) throw migrateViewerError;
        migratedViewerRowToAccount = true;
      } else {
        const { error: insertAccountError } = await supabase.from("story_reactions").insert({
          story_id: storyId,
          reaction,
          updated_at: new Date().toISOString(),
          user_id: accountUserId,
          viewer_key: null,
        });

        if (insertAccountError) throw insertAccountError;
      }

      if (viewerRow && accountRow && !migratedViewerRowToAccount && (accountRow as ReactionRow).id !== (viewerRow as ReactionRow).id) {
        const { error: cleanupViewerError } = await supabase.from("story_reactions").delete().eq("id", (viewerRow as ReactionRow).id);
        if (cleanupViewerError) throw cleanupViewerError;
      }
    } else {
      const { data: existingViewerRow, error: existingViewerError } = await supabase
        .from("story_reactions")
        .select("id, reaction, user_id, viewer_key")
        .eq("story_id", storyId)
        .is("user_id", null)
        .eq("viewer_key", viewerKey)
        .maybeSingle();

      if (existingViewerError) throw existingViewerError;

      const existingViewerReaction = readReaction(existingViewerRow as Partial<ReactionRow> | null);

      if (existingViewerReaction === reaction) {
        const { error: deleteViewerError } = await supabase.from("story_reactions").delete().eq("id", (existingViewerRow as ReactionRow).id);
        if (deleteViewerError) throw deleteViewerError;
      } else if (existingViewerRow) {
        const { error: updateViewerError } = await supabase
          .from("story_reactions")
          .update({
            reaction,
            updated_at: new Date().toISOString(),
          })
          .eq("id", (existingViewerRow as ReactionRow).id);

        if (updateViewerError) throw updateViewerError;
      } else {
        const { error: insertViewerError } = await supabase.from("story_reactions").insert({
          story_id: storyId,
          reaction,
          updated_at: new Date().toISOString(),
          viewer_key: viewerKey,
        });

        if (insertViewerError) throw insertViewerError;
      }
    }

    const summary = await loadReactionSummary(storyId, viewerKey, accountUserId);
    const res = NextResponse.json(summary);
    return withViewerCookie(res, viewerId, shouldSetViewerCookie);
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
