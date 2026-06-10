import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, storyMatchesSearch, STORY_CARD_SELECT, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";
import { TOPICS, normalize } from "@/app/lib/vocab";

const MAX_LIMIT = 40;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "We couldn't load stories.";
}

function toPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function publishedAtMs(story: StoryWithViews) {
  const created = new Date(story.created_at ?? "").getTime();
  if (Number.isFinite(created) && created > 0) return created;
  const dateOnly = new Date(story.date ?? "").getTime();
  return Number.isFinite(dateOnly) ? dateOnly : 0;
}

function updatedAtMs(story: StoryWithViews) {
  const contentUpdated = new Date(story.content_updated_at ?? "").getTime();
  if (Number.isFinite(contentUpdated) && contentUpdated > 0) return contentUpdated;
  const updated = new Date(story.updated_at ?? "").getTime();
  if (Number.isFinite(updated) && updated > 0) return updated;
  return publishedAtMs(story);
}

function popularScore(story: StoryWithViews) {
  const hoursSincePublish = Math.max(0, (Date.now() - publishedAtMs(story)) / 3_600_000);
  return Number(story.views ?? 0) / (hoursSincePublish + 2);
}

function sortStories(stories: StoryWithViews[], mode: string) {
  return [...stories].sort((left, right) => {
    if (mode === "recent" || mode === "topic-new" || mode === "search") {
      return publishedAtMs(right) - publishedAtMs(left);
    }

    if (mode === "topic-top") {
      const views = Number(right.views ?? 0) - Number(left.views ?? 0);
      if (views !== 0) return views;
      const comments = Number(right.comments ?? 0) - Number(left.comments ?? 0);
      if (comments !== 0) return comments;
      return updatedAtMs(right) - updatedAtMs(left);
    }

    const score = popularScore(right) - popularScore(left);
    if (score !== 0) return score;
    const views = Number(right.views ?? 0) - Number(left.views ?? 0);
    if (views !== 0) return views;
    return updatedAtMs(right) - updatedAtMs(left);
  });
}

function topicWindowCutoff(windowKey: string) {
  if (windowKey === "day") return Date.now() - 24 * 3_600_000;
  if (windowKey === "week") return Date.now() - 7 * 24 * 3_600_000;
  if (windowKey === "month") return Date.now() - 30 * 24 * 3_600_000;
  if (windowKey === "year") return Date.now() - 365 * 24 * 3_600_000;
  return 0;
}

function topicQueryCandidates(topic: string) {
  const canonical = TOPICS.find((candidate) => normalize(candidate) === topic);
  return [...new Set([canonical, topic].filter((candidate): candidate is string => Boolean(candidate)))];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = toPositiveInt(searchParams.get("limit"), 20, MAX_LIMIT);
    const offset = toPositiveInt(searchParams.get("offset"), 0, 10_000);
    const search = (searchParams.get("search") ?? "").trim();
    const topic = normalize(searchParams.get("topic") ?? "");
    const tab = (searchParams.get("tab") ?? "popular").trim();
    const topicOrder = (searchParams.get("topicOrder") ?? "new").trim();
    const topWindow = (searchParams.get("topWindow") ?? "day").trim();
    const publicStatuses = search ? ["published", "archived"] : ["published"];
    const needsServerFilter = Boolean(search || topic || tab === "popular" || topicOrder === "top");
    const fetchLimit = search ? Math.max(limit + offset + 160, 400) : needsServerFilter ? Math.max(limit + offset + 40, 120) : limit + 1;

    const supabase = supabaseServer();
    function createFeedQuery(topicCandidate?: string) {
      let query = supabase
        .from("stories")
        .select(STORY_CARD_SELECT)
        .in("status", publicStatuses);

      if (topicCandidate) {
        query = query.contains("topics", [topicCandidate]);
      }

      if (!search && (tab === "recent" || (topic && topicOrder !== "top"))) {
        return query.order("created_at", { ascending: false, nullsFirst: false }).limit(fetchLimit);
      }

      return query
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(fetchLimit);
    }

    const feedQueries = topic
      ? topicQueryCandidates(topic).map((candidate) => createFeedQuery(candidate))
      : [createFeedQuery()];

    const [feedResults, trackingResult] = await Promise.all([
      Promise.all(feedQueries),
      supabase
        .from("stories")
        .select(STORY_CARD_SELECT)
        .eq("status", "published")
        .eq("pinned", true)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false }),
    ]);

    const feedError = feedResults.find((result) => result.error)?.error;
    if (feedError) throw feedError;
    if (trackingResult.error) throw trackingResult.error;

    const data = feedResults.flatMap((result) => result.data ?? []);
    let stories = [...new Map(((data ?? []) as unknown as StoryDbRow[]).map(coerceStory).map((story) => [story.id, story])).values()]
      .filter((story) => search || !story.pinned);
    const trackingStories = ((trackingResult.data ?? []) as unknown as StoryDbRow[]).map(coerceStory);
    if (search) {
      stories = stories.filter((story) => storyMatchesSearch(story, search));
    }
    if (topic) {
      stories = stories.filter((story) => story.topics.map(normalize).includes(topic));
    }
    if (topic && topicOrder === "top") {
      const cutoff = topicWindowCutoff(topWindow);
      if (cutoff > 0) {
        stories = stories.filter((story) => publishedAtMs(story) >= cutoff);
      }
      stories = sortStories(stories, "topic-top");
    } else if (topic) {
      stories = sortStories(stories, "topic-new");
    } else if (search) {
      stories = sortStories(stories, "search");
    } else {
      stories = sortStories(stories, tab === "recent" ? "recent" : "popular");
    }

    const page = stories.slice(offset, offset + limit);
    return NextResponse.json({
      hasMore: stories.length > offset + limit || data.length >= fetchLimit,
      stories: page,
      trackingStories,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
