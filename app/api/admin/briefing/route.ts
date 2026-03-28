export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token");
  return Boolean(expected && got && got === expected);
}

async function loadAllStories() {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("stories").select("*").order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as StoryDbRow[]).map(coerceStory);
}

function splitStories(stories: StoryWithViews[]) {
  const briefing = stories
    .filter((story) => story.beacon_include)
    .sort((left, right) => {
      const leftRank = left.beacon_rank ?? Number.MAX_SAFE_INTEGER;
      const rightRank = right.beacon_rank ?? Number.MAX_SAFE_INTEGER;

      if (leftRank !== rightRank) return leftRank - rightRank;

      const leftCreated = Date.parse(left.created_at ?? left.date);
      const rightCreated = Date.parse(right.created_at ?? right.date);
      return rightCreated - leftCreated;
    });

  const library = stories.filter((story) => !story.beacon_include);
  return { briefing, library };
}

export async function GET(req: Request) {
  try {
    if (!requireAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stories = await loadAllStories();
    return NextResponse.json(splitStories(stories));
  } catch (error: unknown) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}

type ReorderPayload = {
  briefingIds?: unknown;
};

export async function PUT(req: Request) {
  try {
    if (!requireAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as ReorderPayload;
    if (!Array.isArray(body.briefingIds)) {
      return NextResponse.json({ error: "briefingIds must be an array." }, { status: 400 });
    }

    const briefingIds = body.briefingIds.map((value) => String(value));
    const uniqueIds = new Set(briefingIds);
    if (briefingIds.length !== uniqueIds.size) {
      return NextResponse.json({ error: "briefingIds must not contain duplicates." }, { status: 400 });
    }

    const allStories = await loadAllStories();
    const allIds = new Set(allStories.map((story) => story.id));
    const hasMissingStory = briefingIds.some((id) => !allIds.has(id));
    if (hasMissingStory) {
      return NextResponse.json({ error: "One or more selected stories no longer exist. Refresh and try again." }, { status: 409 });
    }

    const timestamp = new Date().toISOString();
    const supabase = supabaseServer();
    const includedIds = new Set(briefingIds);

    for (const story of allStories) {
      const nextInclude = includedIds.has(story.id);
      const nextRank = nextInclude ? briefingIds.indexOf(story.id) + 1 : null;
      const changed = story.beacon_include !== nextInclude || (story.beacon_rank ?? null) !== nextRank;

      if (!changed) continue;

      const { error } = await supabase
        .from("stories")
        .update({
          beacon_include: nextInclude,
          beacon_rank: nextRank,
          updated_at: timestamp,
        })
        .eq("id", story.id);

      if (error) throw error;
    }

    const stories = await loadAllStories();
    return NextResponse.json({ ok: true, ...splitStories(stories) });
  } catch (error: unknown) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}
