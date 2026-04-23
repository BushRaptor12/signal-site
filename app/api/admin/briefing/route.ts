export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { sortBriefingStories } from "@/app/lib/briefing-layout";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { BriefingPosition, StoryWithViews } from "@/app/lib/types";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function loadAllStories() {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("stories").select("*").order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as StoryDbRow[]).map(coerceStory);
}

function splitStories(stories: StoryWithViews[]) {
  const publishedStories = stories.filter((story) => story.status === "published");
  const briefing = sortBriefingStories(publishedStories.filter((story) => story.beacon_include));
  const library = publishedStories.filter((story) => !story.beacon_include);
  return { briefing, library };
}

export async function GET(req: Request) {
  try {
    if (!(await requestHasAdminAccess(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stories = await loadAllStories();
    return NextResponse.json(splitStories(stories));
  } catch (error: unknown) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}

type ReorderPayload = {
  briefing?: unknown;
};

function toNullableBriefingPosition(value: unknown): BriefingPosition | null {
  if (value === "lead" || value === "left" || value === "right") return value;
  return null;
}

function toNullableInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export async function PUT(req: Request) {
  try {
    if (!(await requestHasAdminAccess(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as ReorderPayload;
    if (!Array.isArray(body.briefing)) {
      return NextResponse.json({ error: "briefing must be an array." }, { status: 400 });
    }

    const briefingItems = body.briefing
      .map((value) => {
        if (typeof value !== "object" || value === null) return null;
        const row = value as {
          id?: unknown;
          beacon_headline?: unknown;
          beacon_summary?: unknown;
          beacon_position?: unknown;
          beacon_order?: unknown;
        };
        if (!row.id) return null;

        const headline =
          typeof row.beacon_headline === "string"
            ? row.beacon_headline.trim() || null
            : row.beacon_headline == null
              ? null
              : String(row.beacon_headline).trim() || null;
        const summary =
          typeof row.beacon_summary === "string"
            ? row.beacon_summary.trim() || null
            : row.beacon_summary == null
              ? null
              : String(row.beacon_summary).trim() || null;
        const position = toNullableBriefingPosition(row.beacon_position);
        const order = toNullableInteger(row.beacon_order);

        if (!position || !order) return null;

        return {
          id: String(row.id),
          beacon_headline: headline,
          beacon_summary: summary,
          beacon_position: position,
          beacon_order: order,
        };
      })
      .filter(
        (
          item
        ): item is {
          id: string;
          beacon_headline: string | null;
          beacon_summary: string | null;
          beacon_position: BriefingPosition;
          beacon_order: number;
        } => Boolean(item)
      );

    if (briefingItems.length !== body.briefing.length) {
      return NextResponse.json(
        { error: "Each briefing item must include an id, beacon_position, and beacon_order." },
        { status: 400 }
      );
    }

    const briefingIds = briefingItems.map((item) => item.id);
    const uniqueIds = new Set(briefingIds);
    if (briefingIds.length !== uniqueIds.size) {
      return NextResponse.json({ error: "briefing must not contain duplicate story ids." }, { status: 400 });
    }

    const allStories = await loadAllStories();
    const allIds = new Set(allStories.map((story) => story.id));
    const hasMissingStory = briefingIds.some((id) => !allIds.has(id));
    if (hasMissingStory) {
      return NextResponse.json({ error: "One or more selected stories no longer exist. Refresh and try again." }, { status: 409 });
    }

    const selectedStories = allStories.filter((story) => briefingIds.includes(story.id));
    const hasUnpublishedStory = selectedStories.some((story) => story.status !== "published");
    if (hasUnpublishedStory) {
      return NextResponse.json({ error: "Only published stories can be placed in The Briefing." }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const supabase = supabaseServer();
    const includedIds = new Set(briefingIds);
    const headlineById = new Map(briefingItems.map((item) => [item.id, item.beacon_headline]));
    const summaryById = new Map(briefingItems.map((item) => [item.id, item.beacon_summary]));
    const positionById = new Map(briefingItems.map((item) => [item.id, item.beacon_position]));
    const orderById = new Map(briefingItems.map((item) => [item.id, item.beacon_order]));

    const leadCount = briefingItems.filter((item) => item.beacon_position === "lead").length;
    if (briefingItems.length > 0 && leadCount !== 1) {
      return NextResponse.json({ error: "Exactly one lead story is required." }, { status: 400 });
    }

    for (const position of ["left", "right"] as const) {
      const orders = briefingItems
        .filter((item) => item.beacon_position === position)
        .map((item) => item.beacon_order);
      if (orders.length !== new Set(orders).size) {
        return NextResponse.json({ error: `Duplicate ${position} column positions are not allowed.` }, { status: 400 });
      }
    }

    for (const story of allStories) {
      const nextInclude = includedIds.has(story.id);
      const nextHeadline = nextInclude ? (headlineById.get(story.id) ?? null) : story.beacon_headline ?? null;
      const nextSummary = nextInclude ? (summaryById.get(story.id) ?? null) : story.beacon_summary ?? null;
      const nextPosition = nextInclude ? (positionById.get(story.id) ?? null) : null;
      const nextOrder = nextInclude ? (orderById.get(story.id) ?? null) : null;
      const changed =
        story.beacon_include !== nextInclude ||
        (story.beacon_position ?? null) !== nextPosition ||
        (story.beacon_order ?? null) !== nextOrder ||
        (story.beacon_headline ?? null) !== nextHeadline ||
        (story.beacon_summary ?? null) !== nextSummary;

      if (!changed) continue;

      const { error } = await supabase
        .from("stories")
        .update({
          beacon_include: nextInclude,
          beacon_rank: null,
          beacon_position: nextPosition,
          beacon_order: nextOrder,
          beacon_headline: nextHeadline,
          beacon_summary: nextSummary,
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
