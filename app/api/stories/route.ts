export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { deleteStoryImage, isStoryImagePath, storyImagePublicUrl } from "@/app/lib/story-images";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { StoryWithViews } from "@/app/lib/types";
import {
  coerceStory,
  toEntities,
  toNullableNumber,
  toNullableString,
  toSources,
  toStringArray,
  type StoryDbRow,
} from "@/app/lib/stories";

function messageFromError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token");
  return Boolean(expected && got && got === expected);
}

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { data: stories, error: storiesError } = await supabase.from("stories").select("*").order("created_at", {
      ascending: false,
    });
    if (storiesError) throw storiesError;

    const merged = ((stories ?? []) as StoryDbRow[]).map((story) => coerceStory(story));
    return NextResponse.json(merged);
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!requireAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const incoming = (await req.json()) as Partial<StoryWithViews>;
    if (!incoming?.id || !incoming?.title || !incoming?.date) {
      return NextResponse.json({ error: "Story must include id, title, date." }, { status: 400 });
    }

    const supabase = supabaseServer();
    const nowIso = new Date().toISOString();
    const { data: existingData, error: existingError } = await supabase
      .from("stories")
      .select("beacon_include, beacon_rank, summary, sources, image_path, content_updated_at, updated_at, created_at")
      .eq("id", String(incoming.id))
      .maybeSingle();
    if (existingError) throw existingError;

    const existing = existingData as {
      beacon_include?: boolean | null;
      beacon_rank?: number | null;
      summary?: unknown;
      sources?: unknown;
      image_path?: string | null;
      content_updated_at?: string | null;
      updated_at?: string | null;
      created_at?: string | null;
    } | null;
    let beaconRank = toNullableNumber(incoming.beacon_rank);
    const normalizedSummary = toStringArray(incoming.summary);
    const normalizedSources = toSources(incoming.sources);
    const normalizedImagePath = toNullableString(incoming.image_path);
    if (normalizedImagePath && !isStoryImagePath(normalizedImagePath)) {
      return NextResponse.json({ error: "Invalid story image path." }, { status: 400 });
    }

    const normalizedImageUrl = normalizedImagePath ? storyImagePublicUrl(supabase, normalizedImagePath) : null;
    const contentChanged =
      !existing ||
      JSON.stringify(toStringArray(existing.summary)) !== JSON.stringify(normalizedSummary) ||
      JSON.stringify(toSources(existing.sources)) !== JSON.stringify(normalizedSources) ||
      toNullableString(existing.image_path) !== normalizedImagePath;
    const contentUpdatedAt =
      contentChanged
        ? nowIso
        : existing?.content_updated_at ?? existing?.updated_at ?? existing?.created_at ?? nowIso;

    if (Boolean(incoming.beacon_include)) {
      if (beaconRank == null) {
        if (existing?.beacon_include && existing.beacon_rank != null) {
          beaconRank = existing.beacon_rank;
        } else {
          const { data: rankedRows, error: rankedError } = await supabase
            .from("stories")
            .select("beacon_rank")
            .eq("beacon_include", true)
            .neq("id", String(incoming.id));
          if (rankedError) throw rankedError;

          const maxRank = ((rankedRows ?? []) as Array<{ beacon_rank?: number | null }>).reduce((highest, row) => {
            const rank = typeof row.beacon_rank === "number" ? row.beacon_rank : 0;
            return Math.max(highest, rank);
          }, 0);

          beaconRank = maxRank + 1;
        }
      }
    } else {
      beaconRank = null;
    }

    const story = {
      id: String(incoming.id),
      title: String(incoming.title),
      summary: normalizedSummary,
      sources: normalizedSources,
      date: String(incoming.date),
      image_path: normalizedImagePath,
      image_url: normalizedImageUrl,
      topics: toStringArray(incoming.topics),
      tags: toStringArray(incoming.tags),
      entities: toEntities(incoming.entities),
      primary_entities: toStringArray(incoming.primary_entities),
      comments: Number(incoming.comments ?? 0),
      urgent: Boolean(incoming.urgent),
      pinned: Boolean(incoming.pinned),
      beacon_include: Boolean(incoming.beacon_include),
      beacon_rank: beaconRank,
      beacon_headline: toNullableString(incoming.beacon_headline),
      updated_at: nowIso,
      content_updated_at: contentUpdatedAt,
    };

    const { error } = await supabase.from("stories").upsert(story, { onConflict: "id" });
    if (error) throw error;

    const existingImagePath = toNullableString(existing?.image_path);
    if (existingImagePath && existingImagePath !== normalizedImagePath) {
      await deleteStoryImage(supabase, existingImagePath);
    }

    return NextResponse.json({ ok: true, story });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
