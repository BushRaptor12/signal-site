export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAccountFromRequest, requestHasAdminAccess } from "@/app/lib/admin.server";
import { sendUrgentNotificationsForStory } from "@/app/lib/notifications.server";
import { deleteStoryImage, isStoryImagePath, storyImagePublicUrl } from "@/app/lib/story-images";
import { recordStoryRevision } from "@/app/lib/story-revisions";
import { upsertStoryEmbeddingRecord } from "@/app/lib/semantic-search";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { BriefingLeadStyle, BriefingPosition, StoryImageDisplay, StoryStatus, StoryWithViews } from "@/app/lib/types";
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

function isImageCreditColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const details = error as { code?: unknown; message?: unknown };
  const message = typeof details.message === "string" ? details.message.toLowerCase() : "";
  return details.code === "42703" && (message.includes("image_credit") || message.includes("image_credit_url"));
}

function toNullableBriefingPosition(value: unknown): BriefingPosition | null {
  if (value === "lead" || value === "left" || value === "right") return value;
  return null;
}

function toNullableImageDisplay(value: unknown): StoryImageDisplay | null {
  if (value === "cover" || value === "contain") return value;
  return null;
}

function toBriefingLeadStyle(value: unknown): BriefingLeadStyle {
  return value === "alert" ? "alert" : "default";
}

function toStoryStatus(value: unknown): StoryStatus {
  return value === "draft" || value === "archived" ? value : "published";
}

function toHttpUrl(value: unknown): string | null {
  const text = toNullableString(value);
  if (!text) return null;

  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function toEasternDateInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
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

function normalizeRelatedStoryIds(value: unknown, storyId: string) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const id of toStringArray(value)) {
    const trimmed = id.trim();
    if (!trimmed || trimmed === storyId || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
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
      query = query.or(
        `title.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%,beacon_headline.ilike.%${searchTerm}%,beacon_summary.ilike.%${searchTerm}%`
      );
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
    const now = new Date();
    const nowIso = now.toISOString();
    const existingStorySelect =
      "title, date, topics, tags, entities, primary_entities, related_story_ids, beacon_include, beacon_lead_style, beacon_rank, beacon_position, beacon_order, summary, sources, image_path, image_url, image_focus_x, image_focus_y, image_display, image_show_on_homepage, image_show_on_briefing, image_show_on_story_page, content_updated_at, updated_at, created_at, urgent"
      + ", locations, organizations, people, industries, sports_teams, offices, facets, related_interest_signals, beacon_headline, beacon_summary";
    let existingResult: { data: unknown; error: unknown } = await supabase
      .from("stories")
      .select(`${existingStorySelect}, image_credit, image_credit_url`)
      .eq("id", String(incoming.id))
      .maybeSingle();
    let existingData = existingResult.data;
    let existingError = existingResult.error;
    if (existingError && isImageCreditColumnError(existingError)) {
      existingResult = await supabase
        .from("stories")
        .select(existingStorySelect)
        .eq("id", String(incoming.id))
        .maybeSingle();
      existingData = existingResult.data;
      existingError = existingResult.error;
    }
    if (existingError) throw existingError;

    const existing = existingData as {
      beacon_include?: boolean | null;
      beacon_lead_style?: BriefingLeadStyle | null;
      beacon_rank?: number | null;
      beacon_position?: BriefingPosition | null;
      beacon_order?: number | null;
      beacon_headline?: string | null;
      beacon_summary?: string | null;
      summary?: unknown;
      sources?: unknown;
      locations?: unknown;
      organizations?: unknown;
      people?: unknown;
      industries?: unknown;
      sports_teams?: unknown;
      offices?: unknown;
      facets?: unknown;
      related_interest_signals?: unknown;
      image_path?: string | null;
      image_url?: string | null;
      image_credit?: string | null;
      image_credit_url?: string | null;
      image_focus_x?: number | null;
      image_focus_y?: number | null;
      image_display?: StoryImageDisplay | null;
      image_show_on_homepage?: boolean | null;
      image_show_on_briefing?: boolean | null;
      image_show_on_story_page?: boolean | null;
      content_updated_at?: string | null;
      updated_at?: string | null;
      created_at?: string | null;
      urgent?: boolean | null;
      title?: string | null;
      date?: string | null;
      topics?: unknown;
      tags?: unknown;
      entities?: unknown;
      primary_entities?: unknown;
      related_story_ids?: unknown;
    } | null;
    let beaconRank = toNullableNumber(incoming.beacon_rank);
    let beaconPosition = toNullableBriefingPosition(incoming.beacon_position);
    let beaconOrder = toNullableNumber(incoming.beacon_order);
    const storyStatus = toStoryStatus(incoming.status);
    const normalizedSummary = toStringArray(incoming.summary);
    const normalizedSources = toSources(incoming.sources);
    const normalizedRelatedStoryIds = normalizeRelatedStoryIds(incoming.related_story_ids, String(incoming.id));
    const previousRelatedStoryIds = normalizeRelatedStoryIds(existing?.related_story_ids, String(incoming.id));
    const normalizedImagePath = toNullableString(incoming.image_path);
    const incomingImageUrl = toNullableString(incoming.image_url);
    const incomingImageCredit = toNullableString(incoming.image_credit);
    const incomingImageCreditUrl = toNullableString(incoming.image_credit_url);
    let normalizedImageDisplay =
      incoming.image_display === undefined ? toNullableImageDisplay(existing?.image_display) : toNullableImageDisplay(incoming.image_display);
    const imageShowOnHomepage =
      incoming.image_show_on_homepage === undefined ? Boolean(existing?.image_show_on_homepage ?? true) : Boolean(incoming.image_show_on_homepage);
    const imageShowOnBriefing =
      incoming.image_show_on_briefing === undefined ? Boolean(existing?.image_show_on_briefing ?? true) : Boolean(incoming.image_show_on_briefing);
    const imageShowOnStoryPage =
      incoming.image_show_on_story_page === undefined ? Boolean(existing?.image_show_on_story_page ?? false) : Boolean(incoming.image_show_on_story_page);
    let normalizedImageFocusX =
      incoming.image_focus_x === undefined ? toNullableNumber(existing?.image_focus_x) : toNullableNumber(incoming.image_focus_x);
    let normalizedImageFocusY =
      incoming.image_focus_y === undefined ? toNullableNumber(existing?.image_focus_y) : toNullableNumber(incoming.image_focus_y);
    const beaconLeadStyle =
      incoming.beacon_lead_style === undefined ? toBriefingLeadStyle(existing?.beacon_lead_style) : toBriefingLeadStyle(incoming.beacon_lead_style);
    if (normalizedImagePath && !isStoryImagePath(normalizedImagePath)) {
      return NextResponse.json({ error: "Invalid story image path." }, { status: 400 });
    }
    if (!normalizedImagePath && incomingImageUrl && !toHttpUrl(incomingImageUrl)) {
      return NextResponse.json({ error: "Embedded image URL must start with http:// or https://." }, { status: 400 });
    }
    if (incomingImageCreditUrl && !toHttpUrl(incomingImageCreditUrl)) {
      return NextResponse.json({ error: "Image credit link must start with http:// or https://." }, { status: 400 });
    }
    if (normalizedImageFocusX != null && (normalizedImageFocusX < 0 || normalizedImageFocusX > 100)) {
      return NextResponse.json({ error: "image_focus_x must be between 0 and 100." }, { status: 400 });
    }
    if (normalizedImageFocusY != null && (normalizedImageFocusY < 0 || normalizedImageFocusY > 100)) {
      return NextResponse.json({ error: "image_focus_y must be between 0 and 100." }, { status: 400 });
    }

    const normalizedImageUrl = normalizedImagePath ? storyImagePublicUrl(supabase, normalizedImagePath) : toHttpUrl(incomingImageUrl);
    const normalizedImageCredit = normalizedImageUrl ? incomingImageCredit : null;
    const normalizedImageCreditUrl = normalizedImageUrl ? toHttpUrl(incomingImageCreditUrl) : null;
    if (!normalizedImageUrl) {
      normalizedImageDisplay = null;
      normalizedImageFocusX = null;
      normalizedImageFocusY = null;
    } else if (!normalizedImageDisplay) {
      normalizedImageDisplay = "cover";
    }
    const contentChanged =
      !existing ||
      toNullableString(existing.title) !== toNullableString(incoming.title) ||
      toNullableString(existing.date) !== toNullableString(incoming.date) ||
      JSON.stringify(toStringArray(existing.summary)) !== JSON.stringify(normalizedSummary) ||
      JSON.stringify(toSources(existing.sources)) !== JSON.stringify(normalizedSources) ||
      JSON.stringify(toStringArray(existing.topics)) !== JSON.stringify(toStringArray(incoming.topics)) ||
      JSON.stringify(toStringArray(existing.tags)) !== JSON.stringify(toStringArray(incoming.tags)) ||
      JSON.stringify(toEntities(existing.entities)) !== JSON.stringify(toEntities(incoming.entities)) ||
      JSON.stringify(toStringArray(existing.primary_entities)) !== JSON.stringify(toStringArray(incoming.primary_entities)) ||
      JSON.stringify(previousRelatedStoryIds) !== JSON.stringify(normalizedRelatedStoryIds) ||
      JSON.stringify(toStringArray(existing.locations)) !== JSON.stringify(toStringArray(incoming.locations)) ||
      JSON.stringify(toStringArray(existing.organizations)) !== JSON.stringify(toStringArray(incoming.organizations)) ||
      JSON.stringify(toStringArray(existing.people)) !== JSON.stringify(toStringArray(incoming.people)) ||
      JSON.stringify(toStringArray(existing.industries)) !== JSON.stringify(toStringArray(incoming.industries)) ||
      JSON.stringify(toStringArray(existing.sports_teams)) !== JSON.stringify(toStringArray(incoming.sports_teams)) ||
      JSON.stringify(toStringArray(existing.offices)) !== JSON.stringify(toStringArray(incoming.offices)) ||
      JSON.stringify(toStringArray(existing.facets)) !== JSON.stringify(toStringArray(incoming.facets)) ||
      JSON.stringify(toStringArray(existing.related_interest_signals)) !== JSON.stringify(toStringArray(incoming.related_interest_signals)) ||
      toNullableString(existing.image_path) !== normalizedImagePath ||
      toNullableString(existing.image_url) !== normalizedImageUrl ||
      toNullableString(existing.image_credit) !== normalizedImageCredit ||
      toNullableString(existing.image_credit_url) !== normalizedImageCreditUrl ||
      toNullableImageDisplay(existing.image_display) !== normalizedImageDisplay ||
      Boolean(existing.image_show_on_homepage ?? true) !== imageShowOnHomepage ||
      Boolean(existing.image_show_on_briefing ?? true) !== imageShowOnBriefing ||
      Boolean(existing.image_show_on_story_page ?? false) !== imageShowOnStoryPage ||
      toNullableNumber(existing.image_focus_x) !== normalizedImageFocusX ||
      toNullableNumber(existing.image_focus_y) !== normalizedImageFocusY;
    const contentUpdatedAt =
      contentChanged
        ? nowIso
        : existing?.content_updated_at ?? existing?.updated_at ?? existing?.created_at ?? nowIso;
    const storyDate =
      existing && contentChanged
        ? toEasternDateInput(now)
        : String(incoming.date);

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

    const storyWithoutImageCredits = {
      id: String(incoming.id),
      status: storyStatus,
      title: String(incoming.title),
      summary: normalizedSummary,
      sources: normalizedSources,
      date: storyDate,
      image_path: normalizedImagePath,
      image_url: normalizedImageUrl,
      image_focus_x: normalizedImageFocusX,
      image_focus_y: normalizedImageFocusY,
      image_display: normalizedImageDisplay,
      image_show_on_homepage: imageShowOnHomepage,
      image_show_on_briefing: imageShowOnBriefing,
      image_show_on_story_page: imageShowOnStoryPage,
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
      related_interest_signals: toStringArray(incoming.related_interest_signals),
      related_story_ids: normalizedRelatedStoryIds,
      comments: Number(incoming.comments ?? 0),
      urgent: Boolean(incoming.urgent),
      pinned: Boolean(incoming.pinned),
      beacon_include: Boolean(incoming.beacon_include),
      beacon_lead_style: beaconLeadStyle,
      beacon_rank: beaconRank,
      beacon_position: beaconPosition,
      beacon_order: beaconOrder,
      beacon_headline: toNullableString(incoming.beacon_headline),
      beacon_summary: toNullableString(incoming.beacon_summary),
      updated_at: nowIso,
      content_updated_at: contentUpdatedAt,
    };
    const story = {
      ...storyWithoutImageCredits,
      image_credit: normalizedImageCredit,
      image_credit_url: normalizedImageCreditUrl,
    };

    let savedStory = story;
    const { error } = await supabase.from("stories").upsert(story, { onConflict: "id" });
    if (error) {
      if (!isImageCreditColumnError(error)) throw error;

      const { error: fallbackError } = await supabase.from("stories").upsert(storyWithoutImageCredits, { onConflict: "id" });
      if (fallbackError) throw fallbackError;
      savedStory = {
        ...storyWithoutImageCredits,
        image_credit: null,
        image_credit_url: null,
      };
    }

    const impactedRelatedStoryIds = Array.from(new Set([...previousRelatedStoryIds, ...normalizedRelatedStoryIds]));
    if (impactedRelatedStoryIds.length > 0) {
      const { data: impactedRows, error: impactedError } = await supabase
        .from("stories")
        .select("*")
        .in("id", impactedRelatedStoryIds);
      if (impactedError) throw impactedError;

      const impactedStories = ((impactedRows ?? []) as StoryDbRow[]).map(coerceStory);
      for (const impactedStory of impactedStories) {
        const currentRelatedIds = normalizeRelatedStoryIds(impactedStory.related_story_ids, impactedStory.id);
        const shouldIncludeStory = normalizedRelatedStoryIds.includes(impactedStory.id);
        const nextRelatedIds = shouldIncludeStory
          ? Array.from(new Set([...currentRelatedIds, story.id]))
          : currentRelatedIds.filter((id) => id !== story.id);

        if (JSON.stringify(currentRelatedIds) === JSON.stringify(nextRelatedIds)) continue;

        const reciprocalUpdatedAt = new Date().toISOString();
        const reciprocalStory = {
          ...impactedStory,
          related_story_ids: nextRelatedIds,
          updated_at: reciprocalUpdatedAt,
          content_updated_at: reciprocalUpdatedAt,
        };

        const { error: reciprocalError } = await supabase
          .from("stories")
          .update({
            related_story_ids: nextRelatedIds,
            updated_at: reciprocalUpdatedAt,
            content_updated_at: reciprocalUpdatedAt,
          })
          .eq("id", impactedStory.id);
        if (reciprocalError) throw reciprocalError;

        await recordStoryRevision({
          action: "saved",
          actorUserId: admin.userId,
          snapshot: reciprocalStory as StoryDbRow,
          storyId: impactedStory.id,
        });
      }
    }

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
        related_interest_signals: story.related_interest_signals,
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
        ...savedStory,
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
        ...savedStory,
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

    return NextResponse.json({ ok: true, story: savedStory });
  } catch (e: unknown) {
    return NextResponse.json({ error: messageFromError(e) }, { status: 500 });
  }
}
