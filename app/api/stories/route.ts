export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAccountFromRequest, requestHasAdminAccess } from "@/app/lib/admin.server";
import { sendUrgentNotificationsForStory } from "@/app/lib/notifications.server";
import { deleteStoryImage, isStoryImagePath, storyImagePublicUrl } from "@/app/lib/story-images";
import { recordStoryRevision } from "@/app/lib/story-revisions";
import { upsertStoryEmbeddingRecord } from "@/app/lib/semantic-search";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { BriefingPosition, StoryImageDisplay, StoryStatus, StoryWithViews } from "@/app/lib/types";
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

function toNullableBriefingPosition(value: unknown): BriefingPosition | null {
  if (value === "lead" || value === "left" || value === "right") return value;
  return null;
}

function toNullableImageDisplay(value: unknown): StoryImageDisplay | null {
  if (value === "cover" || value === "contain") return value;
  return null;
}

function toStoryStatus(value: unknown): StoryStatus {
  return value === "draft" || value === "archived" ? value : "published";
}

function toStatusFilterList(rawValue: string | null, adminAccess: boolean): StoryStatus[] {
  if (!adminAccess) return ["published"];

  const parsed = (rawValue ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is StoryStatus => value === "draft" || value === "published" || value === "archived");

  return parsed.length > 0 ? parsed : ["draft", "published", "archived"];
}

function sanitizeSearchTerm(value: string | null) {
  return (value ?? "").replace(/[,%]/g, " ").trim();
}

export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseServer();
    const adminAccess = await requestHasAdminAccess(request);
    const searchTerm = sanitizeSearchTerm(request.nextUrl.searchParams.get("search"));
    const statuses = toStatusFilterList(request.nextUrl.searchParams.get("statuses"), adminAccess);
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 250) : null;

    let query = supabase.from("stories").select("*").in("status", statuses);

    if (searchTerm) {
      query = query.or(`title.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%,beacon_headline.ilike.%${searchTerm}%`);
    }

    query = query.order("updated_at", { ascending: false, nullsFirst: false }).order("created_at", {
      ascending: false,
      nullsFirst: false,
    });

    if (limit) {
      query = query.limit(limit);
    }

    const { data: stories, error: storiesError } = await query;
    if (storiesError) throw storiesError;

    const merged = ((stories ?? []) as StoryDbRow[]).map((story) => coerceStory(story));
    return NextResponse.json(merged);
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await getAdminAccountFromRequest(req);
    if (!admin) {
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
      .select(
        "beacon_include, beacon_rank, beacon_position, beacon_order, summary, sources, image_path, image_focus_x, image_focus_y, image_display, content_updated_at, updated_at, created_at, urgent"
        + ", locations, organizations, people, industries, sports_teams, offices, facets"
      )
      .eq("id", String(incoming.id))
      .maybeSingle();
    if (existingError) throw existingError;

    const existing = existingData as {
      beacon_include?: boolean | null;
      beacon_rank?: number | null;
      beacon_position?: BriefingPosition | null;
      beacon_order?: number | null;
      summary?: unknown;
      sources?: unknown;
      locations?: unknown;
      organizations?: unknown;
      people?: unknown;
      industries?: unknown;
      sports_teams?: unknown;
      offices?: unknown;
      facets?: unknown;
      image_path?: string | null;
      image_focus_x?: number | null;
      image_focus_y?: number | null;
      image_display?: StoryImageDisplay | null;
      content_updated_at?: string | null;
      updated_at?: string | null;
      created_at?: string | null;
      urgent?: boolean | null;
    } | null;
    let beaconRank = toNullableNumber(incoming.beacon_rank);
    let beaconPosition = toNullableBriefingPosition(incoming.beacon_position);
    let beaconOrder = toNullableNumber(incoming.beacon_order);
    const storyStatus = toStoryStatus(incoming.status);
    const normalizedSummary = toStringArray(incoming.summary);
    const normalizedSources = toSources(incoming.sources);
    const normalizedImagePath = toNullableString(incoming.image_path);
    let normalizedImageDisplay =
      incoming.image_display === undefined ? toNullableImageDisplay(existing?.image_display) : toNullableImageDisplay(incoming.image_display);
    let normalizedImageFocusX =
      incoming.image_focus_x === undefined ? toNullableNumber(existing?.image_focus_x) : toNullableNumber(incoming.image_focus_x);
    let normalizedImageFocusY =
      incoming.image_focus_y === undefined ? toNullableNumber(existing?.image_focus_y) : toNullableNumber(incoming.image_focus_y);
    if (normalizedImagePath && !isStoryImagePath(normalizedImagePath)) {
      return NextResponse.json({ error: "Invalid story image path." }, { status: 400 });
    }
    if (normalizedImageFocusX != null && (normalizedImageFocusX < 0 || normalizedImageFocusX > 100)) {
      return NextResponse.json({ error: "image_focus_x must be between 0 and 100." }, { status: 400 });
    }
    if (normalizedImageFocusY != null && (normalizedImageFocusY < 0 || normalizedImageFocusY > 100)) {
      return NextResponse.json({ error: "image_focus_y must be between 0 and 100." }, { status: 400 });
    }

    const normalizedImageUrl = normalizedImagePath ? storyImagePublicUrl(supabase, normalizedImagePath) : null;
    if (!normalizedImageUrl) {
      normalizedImageDisplay = null;
      normalizedImageFocusX = null;
      normalizedImageFocusY = null;
    } else if (!normalizedImageDisplay) {
      normalizedImageDisplay = "cover";
    }
    const contentChanged =
      !existing ||
      JSON.stringify(toStringArray(existing.summary)) !== JSON.stringify(normalizedSummary) ||
      JSON.stringify(toSources(existing.sources)) !== JSON.stringify(normalizedSources) ||
      JSON.stringify(toStringArray(existing.locations)) !== JSON.stringify(toStringArray(incoming.locations)) ||
      JSON.stringify(toStringArray(existing.organizations)) !== JSON.stringify(toStringArray(incoming.organizations)) ||
      JSON.stringify(toStringArray(existing.people)) !== JSON.stringify(toStringArray(incoming.people)) ||
      JSON.stringify(toStringArray(existing.industries)) !== JSON.stringify(toStringArray(incoming.industries)) ||
      JSON.stringify(toStringArray(existing.sports_teams)) !== JSON.stringify(toStringArray(incoming.sports_teams)) ||
      JSON.stringify(toStringArray(existing.offices)) !== JSON.stringify(toStringArray(incoming.offices)) ||
      JSON.stringify(toStringArray(existing.facets)) !== JSON.stringify(toStringArray(incoming.facets)) ||
      toNullableString(existing.image_path) !== normalizedImagePath;
    const contentUpdatedAt =
      contentChanged
        ? nowIso
        : existing?.content_updated_at ?? existing?.updated_at ?? existing?.created_at ?? nowIso;

    if (Boolean(incoming.beacon_include)) {
      const { data: briefingRows, error: briefingError } = await supabase
            .from("stories")
            .select("id, beacon_position, beacon_order")
            .eq("beacon_include", true)
            .neq("id", String(incoming.id));
      if (briefingError) throw briefingError;

      const placementRows = (briefingRows ?? []) as Array<{
        id?: string | null;
        beacon_position?: BriefingPosition | null;
        beacon_order?: number | null;
      }>;

      if (!beaconPosition && existing?.beacon_include) {
        beaconPosition = existing.beacon_position ?? null;
      }
      if (beaconOrder == null && existing?.beacon_include) {
        beaconOrder = existing.beacon_order ?? null;
      }

      if (!beaconPosition) {
        const hasLead = placementRows.some((row) => row.beacon_position === "lead");
        beaconPosition = hasLead ? "left" : "lead";
      }

      if (beaconOrder == null) {
        if (beaconPosition === "lead") {
          beaconOrder = 1;
        } else {
          const maxOrderForPosition = placementRows.reduce((highest, row) => {
            if (row.beacon_position !== beaconPosition) return highest;
            return Math.max(highest, Number(row.beacon_order ?? 0));
          }, 0);
          beaconOrder = maxOrderForPosition + 1;
        }
      }

      beaconRank = null;
    } else {
      beaconRank = null;
      beaconPosition = null;
      beaconOrder = null;
    }

    const story = {
      id: String(incoming.id),
      status: storyStatus,
      title: String(incoming.title),
      summary: normalizedSummary,
      sources: normalizedSources,
      date: String(incoming.date),
      image_path: normalizedImagePath,
      image_url: normalizedImageUrl,
      image_focus_x: normalizedImageFocusX,
      image_focus_y: normalizedImageFocusY,
      image_display: normalizedImageDisplay,
      topics: toStringArray(incoming.topics),
      tags: toStringArray(incoming.tags),
      entities: toEntities(incoming.entities),
      primary_entities: toStringArray(incoming.primary_entities),
      locations: toStringArray(incoming.locations),
      organizations: toStringArray(incoming.organizations),
      people: toStringArray(incoming.people),
      industries: toStringArray(incoming.industries),
      sports_teams: toStringArray(incoming.sports_teams),
      offices: toStringArray(incoming.offices),
      facets: toStringArray(incoming.facets),
      related_story_ids: toStringArray(incoming.related_story_ids),
      comments: Number(incoming.comments ?? 0),
      urgent: Boolean(incoming.urgent),
      pinned: Boolean(incoming.pinned),
      beacon_include: Boolean(incoming.beacon_include),
      beacon_rank: beaconRank,
      beacon_position: beaconPosition,
      beacon_order: beaconOrder,
      beacon_headline: toNullableString(incoming.beacon_headline),
      updated_at: nowIso,
      content_updated_at: contentUpdatedAt,
    };

    const { error } = await supabase.from("stories").upsert(story, { onConflict: "id" });
    if (error) throw error;

    if (contentChanged) {
      await upsertStoryEmbeddingRecord(story.id, {
        entities: story.entities,
        facets: story.facets,
        industries: story.industries,
        locations: story.locations,
        offices: story.offices,
        organizations: story.organizations,
        people: story.people,
        primary_entities: story.primary_entities,
        sources: story.sources,
        sports_teams: story.sports_teams,
        summary: story.summary,
        tags: story.tags,
        title: story.title,
        topics: story.topics,
      });
    }

    await recordStoryRevision({
      action: "saved",
      actorUserId: admin.userId,
      snapshot: {
        ...story,
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        views: Number(incoming.views ?? 0),
      } as StoryDbRow,
      storyId: story.id,
    });

    const existingImagePath = toNullableString(existing?.image_path);
    if (existingImagePath && existingImagePath !== normalizedImagePath) {
      await deleteStoryImage(supabase, existingImagePath);
    }

    const shouldSendUrgentNotification = Boolean(story.urgent) && !Boolean(existing?.urgent);
    if (shouldSendUrgentNotification) {
      const pushedStory = coerceStory({
        ...story,
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        content_updated_at: contentUpdatedAt,
        views: Number(incoming.views ?? 0),
      } as StoryDbRow);

      try {
        await sendUrgentNotificationsForStory(pushedStory);
      } catch {
        // story save should still succeed even if push fanout fails
      }
    }

    return NextResponse.json({ ok: true, story });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
