"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FollowedInterestWithMatches } from "@/app/lib/account.server";
import { shouldUseContainedStoryImage } from "@/app/lib/story-image-layout";
import { ACCOUNT_FOLLOWS_UPDATED_EVENT } from "./lib/account-events";
import {
  STORY_COMMENT_COUNT_UPDATED_EVENT,
  readStoredStoryCommentCountUpdate,
  readStoryCommentCountUpdate,
} from "./lib/comment-events";
import { formatStoryDate, formatUpdatedAgo } from "./lib/dates";
import { imageObjectPosition } from "./lib/image-focus";
import type { StoryWithViews } from "./lib/types";
import { normalize, TOPICS, toTitleCase } from "./lib/vocab";

type TabKey = "following" | "popular" | "recent" | string;
type TopicOrderKey = "new" | "top";
type TopicTopWindowKey = "day" | "week" | "month" | "year";

type SavedHomeState = {
  scrollY?: number;
  visibleCount?: number;
};

type HomePageClientProps = {
  initialAccountAuthenticated: boolean;
  initialFollowedInterests: FollowedInterestWithMatches[];
  initialFollowedStoryIds: string[];
  initialStories: StoryWithViews[];
};

const HOME_STATE_KEY = "signal:homeState:v2";
const MAX_SCROLL_RESTORE_ATTEMPTS = 18;
const STORY_BATCH_SIZE = 10;
const BUILTIN_TAB_KEYS: TabKey[] = ["following", "popular", "recent"];
const PRESET_TOPIC_TABS = TOPICS.map((topic) => normalize(topic)).filter(Boolean);
const TOPIC_TOP_WINDOW_LABELS: Record<TopicTopWindowKey, string> = {
  day: "Top of day",
  week: "Top of week",
  month: "Top of month",
  year: "Top of year",
};

function isBuiltinTabKey(value: string): value is TabKey {
  return BUILTIN_TAB_KEYS.includes(value as TabKey);
}

function isPresetTopicTab(value: string) {
  return PRESET_TOPIC_TABS.includes(value);
}

function getInitialActiveTab(): TabKey {
  if (typeof window === "undefined") return "popular";

  try {
    const raw = new URLSearchParams(window.location.search).get("tab");
    const normalized = normalize(raw ?? "");
    if (isBuiltinTabKey(normalized) || isPresetTopicTab(normalized)) {
      return normalized;
    }

    return "popular";
  } catch {
    return "popular";
  }
}

function readHomeStateMap(): Record<string, SavedHomeState> {
  if (typeof window === "undefined") return {};

  try {
    const raw = sessionStorage.getItem(HOME_STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, SavedHomeState>) : {};
  } catch {
    return {};
  }
}

function writeHomeStateMap(state: Record<string, SavedHomeState>) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function publishedAtMs(story: StoryWithViews): number {
  const created = new Date(story.created_at ?? "").getTime();
  if (Number.isFinite(created) && created > 0) return created;

  const dateOnly = new Date(story.date ?? "").getTime();
  if (Number.isFinite(dateOnly) && dateOnly > 0) return dateOnly;

  return 0;
}

function updatedAtMs(story: StoryWithViews): number {
  const contentUpdated = new Date(story.content_updated_at ?? "").getTime();
  if (Number.isFinite(contentUpdated) && contentUpdated > 0) return contentUpdated;

  const created = new Date(story.created_at ?? "").getTime();
  if (Number.isFinite(created) && created > 0) return created;

  return publishedAtMs(story);
}

function popularScore(story: StoryWithViews, nowMs: number): number {
  const hoursSincePublish = Math.max(0, (nowMs - publishedAtMs(story)) / 3_600_000);
  return Number(story.views ?? 0) / (hoursSincePublish + 2);
}

function compareByPopularity(left: StoryWithViews, right: StoryWithViews, nowMs: number): number {
  const byScore = popularScore(right, nowMs) - popularScore(left, nowMs);
  if (byScore !== 0) return byScore;

  const byViews = Number(right.views ?? 0) - Number(left.views ?? 0);
  if (byViews !== 0) return byViews;

  const byUpdated = updatedAtMs(right) - updatedAtMs(left);
  if (byUpdated !== 0) return byUpdated;

  return publishedAtMs(right) - publishedAtMs(left);
}

function compareByTop(left: StoryWithViews, right: StoryWithViews): number {
  const byViews = Number(right.views ?? 0) - Number(left.views ?? 0);
  if (byViews !== 0) return byViews;

  const byComments = Number(right.comments ?? 0) - Number(left.comments ?? 0);
  if (byComments !== 0) return byComments;

  const byUpdated = updatedAtMs(right) - updatedAtMs(left);
  if (byUpdated !== 0) return byUpdated;

  return publishedAtMs(right) - publishedAtMs(left);
}

function topicTopWindowDurationMs(window: TopicTopWindowKey) {
  if (window === "day") return 24 * 3_600_000;
  if (window === "week") return 7 * 24 * 3_600_000;
  if (window === "month") return 30 * 24 * 3_600_000;
  return 365 * 24 * 3_600_000;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textMatchesKeyword(haystack: string, keyword: string) {
  const normalizedHaystack = normalize(haystack);
  const normalizedKeyword = normalize(keyword);
  if (!normalizedKeyword) return false;

  if (normalizedKeyword.includes(" ")) {
    return normalizedHaystack.includes(normalizedKeyword);
  }

  const re = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, "i");
  return re.test(haystack);
}

function storyMatchesInterest(story: StoryWithViews, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return false;

  if ((story.topics ?? []).map(normalize).includes(normalizedQuery)) {
    return true;
  }

  if ((story.primary_entities ?? []).map(normalize).includes(normalizedQuery)) {
    return true;
  }

  if ((story.locations ?? []).map(normalize).includes(normalizedQuery)) return true;
  if ((story.organizations ?? []).map(normalize).includes(normalizedQuery)) return true;
  if ((story.people ?? []).map(normalize).includes(normalizedQuery)) return true;
  if ((story.industries ?? []).map(normalize).includes(normalizedQuery)) return true;
  if ((story.sports_teams ?? []).map(normalize).includes(normalizedQuery)) return true;
  if ((story.offices ?? []).map(normalize).includes(normalizedQuery)) return true;
  if ((story.facets ?? []).map(normalize).includes(normalizedQuery)) return true;

  for (const entity of story.entities ?? []) {
    if (normalize(entity.name) === normalizedQuery) return true;
    if ((entity.aliases ?? []).map(normalize).includes(normalizedQuery)) return true;
  }

  const haystack = [
    story.title,
    ...(story.summary ?? []),
    ...(story.topics ?? []),
    ...(story.primary_entities ?? []),
    ...(story.locations ?? []),
    ...(story.organizations ?? []),
    ...(story.people ?? []),
    ...(story.industries ?? []),
    ...(story.sports_teams ?? []),
    ...(story.offices ?? []),
    ...(story.facets ?? []),
    ...(story.entities ?? []).flatMap((entity) => [entity.name, ...(entity.aliases ?? [])]),
  ].join(" ");

  return textMatchesKeyword(haystack, normalizedQuery);
}

function storyMatchesRelatedInterestSignal(story: StoryWithViews, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return false;

  if ((story.related_interest_signals ?? []).map(normalize).includes(normalizedQuery)) {
    return true;
  }

  return textMatchesKeyword((story.related_interest_signals ?? []).join(" "), normalizedQuery);
}

function getStoryUpdateLabel(story: StoryWithViews) {
  const updatedValue = story.content_updated_at ?? story.created_at ?? "";
  if (updatedValue) {
    const relative = formatUpdatedAgo(updatedValue);
    if (relative && relative !== "recently") {
      return `Updated ${relative}`;
    }
  }

  return formatStoryDate(story.date);
}

function shouldShowStoryImageOnHomepage(story: StoryWithViews) {
  return Boolean(story.image_url) && (story.image_show_on_homepage ?? true);
}

export default function HomePageClient({
  initialAccountAuthenticated,
  initialFollowedInterests,
  initialFollowedStoryIds,
  initialStories,
}: HomePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [stories, setStories] = useState(initialStories);
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialActiveTab);
  const [visibleCount, setVisibleCount] = useState(STORY_BATCH_SIZE);
  const [accountAuthenticated, setAccountAuthenticated] = useState(initialAccountAuthenticated);
  const [followedStoryIds, setFollowedStoryIds] = useState<string[]>(initialFollowedStoryIds);
  const [followedInterests, setFollowedInterests] = useState<FollowedInterestWithMatches[]>(initialFollowedInterests);
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});
  const [loadingFollowState, setLoadingFollowState] = useState(false);
  const [topicOrder, setTopicOrder] = useState<TopicOrderKey>("new");
  const [topicTopWindow, setTopicTopWindow] = useState<TopicTopWindowKey>("day");
  const pendingScrollRestoreRef = useRef<{ attempts: number; scrollY: number; tabKey: TabKey } | null>(null);

  useEffect(() => {
    setStories(initialStories);
  }, [initialStories]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cleanups: Array<() => void> = [];

    for (const story of stories) {
      if (!shouldShowStoryImageOnHomepage(story) || !story.image_url || imageAspectRatios[story.id]) continue;

      const image = new window.Image();
      const onLoad = () => {
        if (!image.naturalWidth || !image.naturalHeight) return;

        setImageAspectRatios((current) => {
          if (current[story.id]) return current;
          return { ...current, [story.id]: image.naturalWidth / image.naturalHeight };
        });
      };

      image.addEventListener("load", onLoad);
      image.src = story.image_url;

      cleanups.push(() => {
        image.removeEventListener("load", onLoad);
      });
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [imageAspectRatios, stories]);

  useEffect(() => {
    const applyUpdate = (payload: { commentCount: number; storyId: string } | null) => {
      if (!payload) return;

      setStories((current) =>
        current.map((story) =>
          story.id === payload.storyId
            ? {
                ...story,
                comments: payload.commentCount,
              }
            : story
        )
      );
    };

    const onWindowEvent = (event: Event) => {
      applyUpdate(readStoryCommentCountUpdate((event as CustomEvent).detail));
    };
    const onStorage = () => {
      applyUpdate(readStoredStoryCommentCountUpdate());
    };

    window.addEventListener(STORY_COMMENT_COUNT_UPDATED_EVENT, onWindowEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(STORY_COMMENT_COUNT_UPDATED_EVENT, onWindowEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const requestedTab = normalize(searchParams.get("tab") ?? "");
    const nextTab = isBuiltinTabKey(requestedTab) || isPresetTopicTab(requestedTab) ? requestedTab : "popular";
    const savedState = readHomeStateMap()[nextTab];
    const nextVisibleCount =
      typeof savedState?.visibleCount === "number" && savedState.visibleCount > STORY_BATCH_SIZE
        ? savedState.visibleCount
        : STORY_BATCH_SIZE;

    setActiveTab((current) => (current === nextTab ? current : nextTab));
    setVisibleCount(nextVisibleCount);
    pendingScrollRestoreRef.current = {
      attempts: 0,
      scrollY: typeof savedState?.scrollY === "number" && savedState.scrollY > 0 ? savedState.scrollY : 0,
      tabKey: nextTab,
    };
  }, [searchParams]);

  const persistHomeState = useCallback(
    (tabOverride?: TabKey) => {
      if (typeof window === "undefined") return;

      const tabKey = tabOverride ?? activeTab;
      const currentMap = readHomeStateMap();
      currentMap[tabKey] = {
        scrollY: window.scrollY,
        visibleCount,
      };
      writeHomeStateMap(currentMap);
    },
    [activeTab, visibleCount]
  );

  useEffect(() => {
    persistHomeState();
  }, [persistHomeState]);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        persistHomeState();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [persistHomeState]);

  useEffect(() => {
    const persist = () => {
      persistHomeState();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persist();
      }
    };

    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [persistHomeState]);

  const setActiveTabAndUrl = useCallback(
    (nextTab: TabKey) => {
      persistHomeState();
      const currentTab = normalize(searchParams.get("tab") ?? "");
      const nextParams = new URLSearchParams(searchParams.toString());

      setActiveTab(nextTab);

      if (nextTab === "popular") {
        if (!currentTab) return;
        nextParams.delete("tab");
      } else {
        if (currentTab === nextTab) return;
        nextParams.set("tab", nextTab);
      }

      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, persistHomeState, router, searchParams]
  );

  const loadFollowState = useCallback(async () => {
    setLoadingFollowState(true);

    try {
      const response = await fetch("/api/account/follows", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        authenticated?: boolean;
        interests?: FollowedInterestWithMatches[];
        storyIds?: string[];
      };

      setAccountAuthenticated(Boolean(data.authenticated));
      setFollowedStoryIds(Array.isArray(data.storyIds) ? data.storyIds.map((value) => String(value)) : []);
      setFollowedInterests(Array.isArray(data.interests) ? data.interests : []);
    } catch {
      setAccountAuthenticated(false);
      setFollowedStoryIds([]);
      setFollowedInterests([]);
    } finally {
      setLoadingFollowState(false);
    }
  }, []);

  useEffect(() => {
    void loadFollowState();

    const refresh = () => {
      void loadFollowState();
    };

    window.addEventListener(ACCOUNT_FOLLOWS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener(ACCOUNT_FOLLOWS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [loadFollowState]);

  const trackingStories = useMemo(
    () => [...stories].filter((story) => story.pinned).sort((a, b) => updatedAtMs(b) - updatedAtMs(a)),
    [stories]
  );
  const recentStories = useMemo(
    () => [...stories].filter((story) => !story.pinned).sort((a, b) => publishedAtMs(b) - publishedAtMs(a)),
    [stories]
  );
  const followedStoryIdSet = useMemo(() => new Set(followedStoryIds), [followedStoryIds]);
  const followedInterestQueries = useMemo(
    () => followedInterests.map((interest) => interest.normalizedQuery).filter(Boolean),
    [followedInterests]
  );
  const semanticInterestMatchesByStoryId = useMemo(() => {
    const map = new Map<string, Array<{ query: string; reasons: string[]; tier: "direct" | "related" }>>();

    for (const interest of followedInterests) {
      for (const match of interest.matches ?? []) {
        const current = map.get(match.story.id) ?? [];
        current.push({
          query: interest.query,
          reasons: match.reasons,
          tier: match.tier,
        });
        map.set(match.story.id, current);
      }
    }

    return map;
  }, [followedInterests]);
  const hiddenInterestStoryIdsByQuery = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const interest of followedInterests) {
      map.set(interest.normalizedQuery, new Set(interest.hiddenStoryIds ?? []));
    }
    return map;
  }, [followedInterests]);
  const topicStoriesByTab = useMemo(() => {
    const entries: Array<[string, StoryWithViews[]]> = PRESET_TOPIC_TABS.map((topic) => [
      topic,
      recentStories.filter((story) => (story.topics ?? []).map(normalize).includes(topic)),
    ]);

    return new Map<string, StoryWithViews[]>(entries);
  }, [recentStories]);
  const followingInterestMatchesByStoryId = useMemo(() => {
    const next = new Map<string, Array<{ query: string; reasons: string[]; tier: "direct" | "related" }>>();

    function upsertMatch(
      storyId: string,
      match: { query: string; reasons: string[]; tier: "direct" | "related" }
    ) {
      const current = next.get(storyId) ?? [];
      const existingIndex = current.findIndex((item) => normalize(item.query) === normalize(match.query));

      if (existingIndex === -1) {
        current.push(match);
        next.set(storyId, current);
        return;
      }

      const existing = current[existingIndex];
      current[existingIndex] = {
        query: existing.query,
        reasons: [...new Set([...existing.reasons, ...match.reasons])],
        tier: existing.tier === "direct" || match.tier === "direct" ? "direct" : "related",
      };
      next.set(storyId, current);
    }

    for (const [storyId, matches] of semanticInterestMatchesByStoryId.entries()) {
      for (const match of matches) {
        upsertMatch(storyId, match);
      }
    }

    for (const story of recentStories) {
      for (const query of followedInterestQueries) {
        if (hiddenInterestStoryIdsByQuery.get(query)?.has(story.id)) {
          continue;
        }

        if (storyMatchesInterest(story, query)) {
          upsertMatch(story.id, { query, reasons: ["Direct interest"], tier: "direct" });
          continue;
        }

        if (storyMatchesRelatedInterestSignal(story, query)) {
          upsertMatch(story.id, { query, reasons: ["Related interest signal"], tier: "related" });
        }
      }
    }

    return next;
  }, [followedInterestQueries, hiddenInterestStoryIdsByQuery, recentStories, semanticInterestMatchesByStoryId]);
  const followingStories = useMemo(
    () => {
      const directMatches: StoryWithViews[] = [];
      const relatedMatches: StoryWithViews[] = [];

      for (const story of recentStories) {
        if (followedStoryIdSet.has(story.id)) {
          directMatches.push(story);
          continue;
        }

        const matches = followingInterestMatchesByStoryId.get(story.id) ?? [];
        if (matches.some((match) => match.tier === "direct")) {
          directMatches.push(story);
          continue;
        }

        if (matches.some((match) => match.tier === "related")) {
          relatedMatches.push(story);
        }
      }

      return [...directMatches, ...relatedMatches];
    },
    [followedStoryIdSet, followingInterestMatchesByStoryId, recentStories]
  );
  const visible = useMemo(() => {
    if (activeTab === "following") return followingStories;
    if (activeTab === "recent") return recentStories;
    if (isPresetTopicTab(normalize(activeTab))) {
      const topicStories = topicStoriesByTab.get(normalize(activeTab)) ?? [];
      if (topicOrder === "new") {
        return topicStories;
      }

      const durationMs = topicTopWindowDurationMs(topicTopWindow);
      const cutoffMs = Date.now() - durationMs;
      return topicStories
        .filter((story) => publishedAtMs(story) >= cutoffMs)
        .sort(compareByTop);
    }
    return [...recentStories].sort((a, b) => compareByPopularity(a, b, Date.now()));
  }, [activeTab, followingStories, recentStories, topicOrder, topicStoriesByTab, topicTopWindow]);
  const visibleStories = useMemo(() => visible.slice(0, visibleCount), [visible, visibleCount]);
  const canLoadMore = visibleCount < visible.length;
  const activeTopicTab = isPresetTopicTab(normalize(activeTab));
  useEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending || pending.tabKey !== activeTab) return;

    let cancelled = false;
    let retryId = 0;

    const attemptRestore = () => {
      if (cancelled) return;

      const nextPending = pendingScrollRestoreRef.current;
      if (!nextPending || nextPending.tabKey !== activeTab) return;

      const viewportHeight = window.innerHeight;
      const maxScrollableTop = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
      const targetTop = Math.min(nextPending.scrollY, maxScrollableTop);
      window.scrollTo({ top: targetTop, behavior: "auto" });

      const closeEnough = Math.abs(window.scrollY - nextPending.scrollY) <= 24 || nextPending.scrollY <= 0;
      if (closeEnough || nextPending.attempts >= MAX_SCROLL_RESTORE_ATTEMPTS) {
        pendingScrollRestoreRef.current = null;
        return;
      }

      pendingScrollRestoreRef.current = {
        ...nextPending,
        attempts: nextPending.attempts + 1,
      };

      retryId = window.setTimeout(() => {
        window.requestAnimationFrame(attemptRestore);
      }, 120);
    };

    window.requestAnimationFrame(attemptRestore);

    return () => {
      cancelled = true;
      if (retryId) window.clearTimeout(retryId);
    };
  }, [activeTab, visible, visibleCount]);

  return (
    <main className="min-h-screen bg-transparent p-8 text-neutral-100">
      <div className="mx-auto mb-8 max-w-5xl">
        <div className="flex flex-col items-center text-center">
          <Link href="/" aria-label="Go to The Beacon home page">
            <Image
              src="/psbeacon.png"
              alt="The Briefing"
              width={1920}
              height={1080}
              priority
              className="h-auto w-full max-w-[420px] md:max-w-[520px]"
            />
          </Link>
          <p className="mt-3 text-neutral-400">One Story, Multiple Perspectives.</p>
        </div>
        <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-[#163754] to-transparent opacity-80" />
        <div className="mt-6 flex justify-center">
          <Link
            href="/briefing"
            className="inline-flex min-w-[260px] justify-center rounded-2xl border border-[#8f7740]/70 bg-[var(--surface)] px-8 py-4 text-base font-semibold text-neutral-100 shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition hover:border-[#b89a55] hover:bg-[#07101a] hover:text-white"
          >
            Read The Briefing
          </Link>
        </div>
      </div>

      <div className="mx-auto mb-6 max-w-5xl">
        <div className="border-b border-[#163754]/70">
          <div className="flex items-center gap-6 overflow-x-auto pb-1">
          {[...BUILTIN_TAB_KEYS, ...PRESET_TOPIC_TABS].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTabAndUrl(tab)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition ${
                activeTab === tab
                  ? "border-[#d7c08d] text-neutral-100"
                  : "border-transparent text-[#c5d3e1] hover:border-[#214765] hover:text-white"
              }`}
            >
              {toTitleCase(tab)}
            </button>
          ))}
        </div>
      </div>
      </div>

      <div className="mx-auto mb-6 max-w-5xl">
        {activeTab === "following" ? (
          <div className="flex min-h-[44px] items-center justify-between gap-4">
            <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2 text-[17px]">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Tracking:</div>
              {trackingStories.map((story) => (
                <Link
                  key={story.id}
                  href={`/story/${story.id}?from=${encodeURIComponent(activeTab)}`}
                  onClick={() => persistHomeState()}
                  className="min-w-0 text-[17px] font-medium text-neutral-300 underline decoration-[#8f7740]/45 decoration-1 underline-offset-4 transition hover:text-white hover:decoration-[#b89a55]"
                >
                  {story.title}
                </Link>
              ))}
            </div>

            {accountAuthenticated ? (
              <Link
                href="/account/interests"
                className="inline-flex shrink-0 rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]"
              >
                Manage interests
              </Link>
            ) : <div className="w-[150px]" />}
          </div>
        ) : activeTab === "popular" || activeTab === "recent" ? trackingStories.length > 0 ? (
          <div className="flex min-h-[44px] items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[17px]">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Tracking:</div>
              {trackingStories.map((story) => (
                <Link
                  key={story.id}
                  href={`/story/${story.id}?from=${encodeURIComponent(activeTab)}`}
                  onClick={() => persistHomeState()}
                  className="min-w-0 text-[17px] font-medium text-neutral-300 underline decoration-[#8f7740]/45 decoration-1 underline-offset-4 transition hover:text-white hover:decoration-[#b89a55]"
                >
                  {story.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null : activeTopicTab ? (
          <div className="flex min-h-[44px] flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              {(["new", "top"] as TopicOrderKey[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTopicOrder(value)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    topicOrder === value
                      ? "border-[#8f7740]/70 bg-[#07101a] text-neutral-100"
                      : "border-[#163754] bg-[#020b14] text-neutral-300 hover:border-[#30516d] hover:text-white"
                  }`}
                >
                  {value === "new" ? "New" : "Top"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm text-neutral-300">
              <span className="font-semibold uppercase tracking-[0.14em] text-neutral-500">Window</span>
              <select
                value={topicTopWindow}
                onChange={(event) => setTopicTopWindow(event.target.value as TopicTopWindowKey)}
                disabled={topicOrder !== "top"}
                className="rounded-xl border border-[#163754] bg-[#020b14] px-4 py-2 text-sm text-neutral-100 outline-none transition hover:border-[#30516d] focus:border-[#8f7740]/70 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {(Object.entries(TOPIC_TOP_WINDOW_LABELS) as Array<[TopicTopWindowKey, string]>).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mx-auto max-w-5xl space-y-6">
        {activeTab === "following" && loadingFollowState ? (
          <div className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-2xl font-semibold text-neutral-100">Loading stories...</h2>
            <p className="mt-3 text-neutral-400">Pulling together the latest coverage.</p>
          </div>
        ) : activeTab === "following" && !accountAuthenticated ? (
          <div className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-2xl font-semibold text-neutral-100">Log in to use Following</h2>
            <p className="mt-3 text-neutral-400">
              Save interests from your interests page and track specific stories from their story pages.
            </p>
            <Link
              href="/account/login"
              className="mt-6 inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]"
            >
              Log in
            </Link>
          </div>
        ) : activeTab === "following" && followingStories.length === 0 ? (
          <div className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-2xl font-semibold text-neutral-100">Nothing followed yet</h2>
            <p className="mt-3 text-neutral-400">
              Add interests from your interests page or track a story to populate this feed.
            </p>
            <Link
              href="/account/interests"
              className="mt-6 inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]"
            >
              Manage interests
            </Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-2xl font-semibold text-neutral-100">No stories yet</h2>
            <p className="mt-3 text-neutral-400">
              {activeTab === "recent"
                ? "Check back soon for the latest stories."
                : isPresetTopicTab(normalize(activeTab))
                  ? topicOrder === "new"
                    ? `There are no ${toTitleCase(normalize(activeTab))} stories yet.`
                    : `There are no ${toTitleCase(normalize(activeTab))} stories in ${TOPIC_TOP_WINDOW_LABELS[topicTopWindow].toLowerCase()}.`
                  : "Check back soon for popular stories."}
            </p>
          </div>
        ) : (
          visibleStories.map((story, index) => {
            const matchedInterests = followingInterestMatchesByStoryId.get(story.id) ?? [];
            const primaryInterestMatch =
              matchedInterests.find((match) => match.tier === "direct") ?? matchedInterests[0] ?? null;
            const followedDirectly = followedStoryIdSet.has(story.id);
            const isLeadCard = index === 0;
            const useContainedHomeImage = shouldUseContainedStoryImage(
              story.image_display,
              imageAspectRatios[story.id] ?? null,
              isLeadCard ? "home-lead" : "home-card"
            );
            const followContextItems = [
              followedDirectly ? "Tracked story" : null,
              primaryInterestMatch?.query ? primaryInterestMatch.query : null,
            ].filter(Boolean);
            return (
              <div key={story.id} className="mx-auto max-w-4xl">
                <div
                  className={`group relative overflow-hidden border bg-[#06131e] px-5 py-6 shadow-[0_14px_30px_rgba(0,0,0,0.18)] transition md:px-7 ${
                    story.urgent
                      ? "border-red-500/55 hover:border-red-400"
                      : "border-[#183149]/65 hover:border-[#28445d]"
                  } ${isLeadCard ? "rounded-[14px]" : "rounded-[12px]"}`}
                >
                  <Link
                    href={`/story/${story.id}?from=${encodeURIComponent(activeTab)}`}
                    onClick={() => persistHomeState()}
                    className="relative block"
                  >
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#1d3b56]/75 pb-4">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-neutral-400">
                        <span>{formatStoryDate(story.date)}</span>
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                        {getStoryUpdateLabel(story)}
                      </div>
                    </div>

                    <div className="grid gap-6">
                      <div className="text-center">
                        <h2
                          className={`mx-auto font-semibold tracking-tight text-neutral-50 ${
                            story.urgent
                              ? "max-w-[42rem] text-3xl text-red-500 md:text-4xl"
                              : isLeadCard
                                ? "max-w-[42rem] text-[2rem] leading-tight md:text-[2.35rem]"
                                : "max-w-[40rem] text-[1.85rem] leading-tight"
                          }`}
                        >
                          {story.title}
                        </h2>

                        <div className={`mx-auto mt-4 space-y-2.5 text-[15px] leading-7 text-neutral-300 ${isLeadCard ? "max-w-[42rem]" : "max-w-[40rem]"}`}>
                          {(story.summary ?? []).map((line, index) => (
                            <p key={index}>{line}</p>
                          ))}
                        </div>

                        {activeTab === "following" && followContextItems.length > 0 ? (
                          <div className="mt-5 text-sm leading-6 text-neutral-400">
                            <span className="uppercase tracking-[0.14em] text-neutral-500">Following</span>
                            <span className="mx-2 text-[#35556f]">/</span>
                            {followedDirectly ? <span>Tracked story</span> : null}
                            {followedDirectly && primaryInterestMatch?.query ? <span className="mx-2 text-[#35556f]">/</span> : null}
                            {primaryInterestMatch?.query ? (
                              <span>
                                {primaryInterestMatch.tier === "related" ? "Related to " : "Because you follow "}
                                <span className="text-neutral-300">{primaryInterestMatch.query}</span>
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        {(story.topics ?? []).length > 0 ? (
                          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                            <span>In</span>
                            {(story.topics ?? []).map((topic, topicIndex) => (
                              <div key={`${story.id}-${topic}`} className="flex items-center gap-x-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setActiveTabAndUrl(normalize(topic));
                                  }}
                                  className="text-[#c8d4df] underline decoration-[#35556f]/65 decoration-1 underline-offset-4 transition hover:text-white hover:decoration-[#8f7740]/65"
                                >
                                  {toTitleCase(normalize(topic))}
                                </button>
                                {topicIndex < (story.topics ?? []).length - 1 ? <span className="text-[#35556f]">/</span> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {shouldShowStoryImageOnHomepage(story) ? (
                        useContainedHomeImage ? (
                          <div className="flex justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={story.image_url!}
                              alt={story.title}
                              loading="lazy"
                              className={`block max-w-full object-contain ${isLeadCard ? "max-h-[36rem]" : "max-h-[32rem]"}`}
                            />
                          </div>
                        ) : (
                          <div
                            className={`relative overflow-hidden ${
                              isLeadCard
                                ? "aspect-[4/3] md:aspect-[16/11]"
                                : "mx-auto w-full max-w-[40rem] aspect-[4/3] md:aspect-[16/10]"
                             }`}
                          >
                            <Image
                              src={story.image_url!}
                              alt={story.title}
                              fill
                              quality={90}
                              sizes={isLeadCard ? "(max-width: 1024px) 100vw, 896px" : "(max-width: 1024px) 100vw, 640px"}
                              className="object-cover transition duration-500 group-hover:scale-[1.015]"
                              style={{ objectPosition: imageObjectPosition(story) }}
                            />
                          </div>
                        )
                      ) : null}
                    </div>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canLoadMore ? (
        <div className="mx-auto mt-8 flex max-w-5xl justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + STORY_BATCH_SIZE)}
            className="rounded-2xl border border-[#8f7740]/70 bg-[var(--surface)] px-8 py-4 text-base font-semibold text-neutral-100 shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition hover:border-[#b89a55] hover:bg-[#07101a] hover:text-white"
          >
            Read more
          </button>
        </div>
      ) : null}
    </main>
  );
}
