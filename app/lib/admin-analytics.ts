import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import { normalize, toTitleCase } from "@/app/lib/vocab";

export type AdminAnalyticsWindow = 7 | 30 | 90;

type StoryAnalyticsRow = Pick<
  StoryDbRow,
  "comments" | "content_updated_at" | "created_at" | "date" | "id" | "status" | "title" | "topics" | "updated_at" | "views"
>;

type TimestampRow = {
  created_at?: string | null;
};

type StoryActivityRow = TimestampRow & {
  reaction?: string | null;
  story_id?: string | null;
};

export type AdminAnalyticsData = {
  dailyActivity: Array<{
    comments: number;
    date: string;
    follows: number;
    reactions: number;
    seen: number;
    views: number;
  }>;
  interestDemand: Array<{
    query: string;
    readers: number;
    updatedAt: string | null;
  }>;
  reactionMix: Array<{
    count: number;
    label: string;
  }>;
  summary: {
    comments: number;
    follows: number;
    publishedStories: number;
    reactions: number;
    seen: number;
    totalStoryViews: number;
    views: number;
  };
  storyPerformance: Array<{
    allTimeViews: number;
    comments: number;
    completionRate: number;
    engagementRate: number;
    id: string;
    publishedAt: string;
    reactions: number;
    seen: number;
    score: number;
    status: string;
    title: string;
    topics: string[];
    totalComments: number;
    updatedAt: string | null;
    views: number;
  }>;
  topicPerformance: Array<{
    comments: number;
    reactions: number;
    stories: number;
    topic: string;
    views: number;
  }>;
  topStories: Array<{
    comments: number;
    id: string;
    reactions: number;
    status: string;
    title: string;
    topics: string[];
    views: number;
  }>;
  windowDays: AdminAnalyticsWindow;
};

function relationMissing(error: unknown, relationName: string) {
  return error instanceof Error && new RegExp(`relation .*${relationName}.* does not exist`, "i").test(error.message);
}

function clampWindowDays(value: number | string | null | undefined): AdminAnalyticsWindow {
  const parsed = Number(value ?? 30);
  if (parsed === 7 || parsed === 90) return parsed;
  return 30;
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateFromTimestamp(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function countByStoryId(rows: StoryActivityRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const storyId = row.story_id?.trim();
    if (!storyId) continue;
    counts.set(storyId, (counts.get(storyId) ?? 0) + 1);
  }
  return counts;
}

function countRowsByDay(rows: TimestampRow[], start: Date, windowDays: number) {
  const counts = new Map<string, number>();
  for (let index = 0; index < windowDays; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    counts.set(dayKey(date), 0);
  }

  for (const row of rows) {
    const date = dateFromTimestamp(row.created_at);
    if (!date) continue;
    const key = dayKey(date);
    if (!counts.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

async function maybeRows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, relationName: string) {
  const { data, error } = await query;
  if (error) {
    const asError = new Error(error.message);
    if (relationMissing(asError, relationName)) return [] as T[];
    throw asError;
  }

  return (data ?? []) as T[];
}

export async function getAdminAnalyticsData(input?: { windowDays?: number | string | null }): Promise<AdminAnalyticsData> {
  const windowDays = clampWindowDays(input?.windowDays);
  const supabase = supabaseServer();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  const sinceIso = start.toISOString();

  const [
    storyRows,
    viewRows,
    commentRows,
    reactionRows,
    seenRows,
    interestRows,
  ] = await Promise.all([
    maybeRows<StoryAnalyticsRow>(
      supabase
        .from("stories")
        .select("id, title, status, topics, views, comments, date, created_at, updated_at, content_updated_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      "stories"
    ),
    maybeRows<StoryActivityRow>(
      supabase.from("story_view_events").select("story_id, created_at").gte("created_at", sinceIso).limit(10000),
      "story_view_events"
    ),
    maybeRows<StoryActivityRow>(
      supabase.from("user_comments").select("story_id, created_at").gte("created_at", sinceIso).is("deleted_at", null).limit(10000),
      "user_comments"
    ),
    maybeRows<StoryActivityRow>(
      supabase.from("story_reactions").select("story_id, reaction, created_at").gte("created_at", sinceIso).limit(10000),
      "story_reactions"
    ),
    maybeRows<StoryActivityRow>(
      supabase.from("user_story_seen").select("story_id, created_at").gte("created_at", sinceIso).limit(10000),
      "user_story_seen"
    ),
    maybeRows<{ created_at: string; normalized_query: string; query: string; updated_at: string; user_id: string }>(
      supabase.from("user_interest_follows").select("user_id, query, normalized_query, created_at, updated_at").limit(5000),
      "user_interest_follows"
    ),
  ]);

  const stories = storyRows.map((row) => coerceStory(row as StoryDbRow));
  const storyById = new Map(stories.map((story) => [story.id, story]));
  const viewsByStoryId = countByStoryId(viewRows);
  const commentsByStoryId = countByStoryId(commentRows);
  const reactionsByStoryId = countByStoryId(reactionRows);
  const seenByStoryId = countByStoryId(seenRows);

  const viewsByDay = countRowsByDay(viewRows, start, windowDays);
  const commentsByDay = countRowsByDay(commentRows, start, windowDays);
  const reactionsByDay = countRowsByDay(reactionRows, start, windowDays);
  const seenByDay = countRowsByDay(seenRows, start, windowDays);
  const followsByDay = countRowsByDay(interestRows.filter((row) => row.created_at >= sinceIso), start, windowDays);

  const dailyActivity = [...viewsByDay.keys()].map((date) => ({
    comments: commentsByDay.get(date) ?? 0,
    date,
    follows: followsByDay.get(date) ?? 0,
    reactions: reactionsByDay.get(date) ?? 0,
    seen: seenByDay.get(date) ?? 0,
    views: viewsByDay.get(date) ?? 0,
  }));

  const storyPerformance = [...storyById.values()]
    .map((story) => ({
      allTimeViews: Number(story.views ?? 0),
      comments: commentsByStoryId.get(story.id) ?? 0,
      completionRate: 0,
      engagementRate: 0,
      id: story.id,
      publishedAt: story.date,
      reactions: reactionsByStoryId.get(story.id) ?? 0,
      seen: seenByStoryId.get(story.id) ?? 0,
      score: 0,
      status: story.status,
      title: story.title,
      topics: story.topics,
      totalComments: Number(story.comments ?? 0),
      updatedAt: story.content_updated_at ?? story.updated_at ?? story.created_at ?? null,
      views: viewsByStoryId.get(story.id) ?? 0,
    }))
    .map((story) => {
      const score = story.views + story.comments * 3 + story.reactions * 2;
      const engagementRate =
        story.views > 0 ? Math.round(((story.comments + story.reactions) / story.views) * 1000) / 10 : story.comments + story.reactions > 0 ? 100 : 0;
      const completionRate = story.views > 0 ? Math.round((story.seen / story.views) * 1000) / 10 : story.seen > 0 ? 100 : 0;

      return {
        ...story,
        completionRate,
        engagementRate,
        score,
      };
    })
    .filter((story) => story.views + story.comments + story.reactions + story.seen > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.views - left.views;
    })
    .slice(0, 30);

  const topStories = storyPerformance.slice(0, 12);

  const topicStats = new Map<string, { comments: number; reactions: number; stories: Set<string>; views: number }>();
  for (const story of stories) {
    const storyViews = viewsByStoryId.get(story.id) ?? 0;
    const storyComments = commentsByStoryId.get(story.id) ?? 0;
    const storyReactions = reactionsByStoryId.get(story.id) ?? 0;
    if (storyViews + storyComments + storyReactions === 0) continue;

    const topics = story.topics.length > 0 ? story.topics : ["Uncategorized"];
    for (const topic of topics) {
      const key = toTitleCase(normalize(topic) || topic);
      const current = topicStats.get(key) ?? { comments: 0, reactions: 0, stories: new Set<string>(), views: 0 };
      current.comments += storyComments;
      current.reactions += storyReactions;
      current.stories.add(story.id);
      current.views += storyViews;
      topicStats.set(key, current);
    }
  }

  const topicPerformance = [...topicStats.entries()]
    .map(([topic, stats]) => ({
      comments: stats.comments,
      reactions: stats.reactions,
      stories: stats.stories.size,
      topic,
      views: stats.views,
    }))
    .sort((left, right) => right.views + right.comments * 3 + right.reactions * 2 - (left.views + left.comments * 3 + left.reactions * 2))
    .slice(0, 10);

  const reactionCounts = new Map<string, number>();
  for (const row of reactionRows) {
    if (!row.reaction) continue;
    increment(reactionCounts, row.reaction);
  }

  const reactionMix = [...reactionCounts.entries()]
    .map(([label, count]) => ({ count, label: toTitleCase(label) }))
    .sort((left, right) => right.count - left.count);

  const interests = new Map<string, { query: string; readerIds: Set<string>; updatedAt: string | null }>();
  for (const row of interestRows) {
    const key = normalize(row.normalized_query || row.query);
    if (!key) continue;
    const current = interests.get(key) ?? { query: row.query, readerIds: new Set<string>(), updatedAt: null };
    current.readerIds.add(row.user_id);
    if (!current.updatedAt || Date.parse(row.updated_at) > Date.parse(current.updatedAt)) {
      current.query = row.query;
      current.updatedAt = row.updated_at;
    }
    interests.set(key, current);
  }

  const interestDemand = [...interests.values()]
    .map((interest) => ({
      query: interest.query,
      readers: interest.readerIds.size,
      updatedAt: interest.updatedAt,
    }))
    .sort((left, right) => right.readers - left.readers || Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))
    .slice(0, 12);

  return {
    dailyActivity,
    interestDemand,
    reactionMix,
    summary: {
      comments: commentRows.length,
      follows: interestRows.filter((row) => row.created_at >= sinceIso).length,
      publishedStories: stories.filter((story) => story.status === "published").length,
      reactions: reactionRows.length,
      seen: seenRows.length,
      totalStoryViews: stories.reduce((sum, story) => sum + Number(story.views ?? 0), 0),
      views: viewRows.length,
    },
    storyPerformance,
    topicPerformance,
    topStories,
    windowDays,
  };
}
