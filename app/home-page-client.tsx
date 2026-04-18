"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FollowedInterest } from "@/app/lib/account.server";
import { ACCOUNT_FOLLOWS_UPDATED_EVENT } from "./lib/account-events";
import {
  STORY_COMMENT_COUNT_UPDATED_EVENT,
  readStoredStoryCommentCountUpdate,
  readStoryCommentCountUpdate,
} from "./lib/comment-events";
import { formatStoryDate } from "./lib/dates";
import { imageObjectPosition } from "./lib/image-focus";
import type { StoryWithViews } from "./lib/types";
import { normalize, TOPICS, toTitleCase } from "./lib/vocab";

type TabKey = "following" | "popular" | "recent" | string;

type SavedHomeState = {
  scrollY?: number;
  visibleCount?: number;
};

type HomePageClientProps = {
  initialAccountAuthenticated: boolean;
  initialFollowedInterests: FollowedInterest[];
  initialSemanticStoryIds: string[];
  initialFollowedStoryIds: string[];
  initialStories: StoryWithViews[];
};

const HOME_STATE_KEY = "signal:homeState:v2";
const MAX_SCROLL_RESTORE_ATTEMPTS = 18;
const STORY_BATCH_SIZE = 10;
const BUILTIN_TAB_KEYS: TabKey[] = ["following", "popular", "recent"];
const PRESET_TOPIC_TABS = TOPICS.map((topic) => normalize(topic)).filter(Boolean);

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

  for (const entity of story.entities ?? []) {
    if (normalize(entity.name) === normalizedQuery) return true;
    if ((entity.aliases ?? []).map(normalize).includes(normalizedQuery)) return true;
  }

  const haystack = [
    story.title,
    ...(story.summary ?? []),
    ...(story.topics ?? []),
    ...(story.primary_entities ?? []),
    ...(story.entities ?? []).flatMap((entity) => [entity.name, ...(entity.aliases ?? [])]),
  ].join(" ");

  return textMatchesKeyword(haystack, normalizedQuery);
}

export default function HomePageClient({
  initialAccountAuthenticated,
  initialFollowedInterests,
  initialSemanticStoryIds,
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
  const [followedInterests, setFollowedInterests] = useState<FollowedInterest[]>(initialFollowedInterests);
  const [semanticStoryIds, setSemanticStoryIds] = useState<string[]>(initialSemanticStoryIds);
  const [loadingFollowState, setLoadingFollowState] = useState(false);
  const pendingScrollRestoreRef = useRef<{ attempts: number; scrollY: number; tabKey: TabKey } | null>(null);

  useEffect(() => {
    setStories(initialStories);
  }, [initialStories]);

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
        interests?: FollowedInterest[];
        semanticStoryIds?: string[];
        storyIds?: string[];
      };

      setAccountAuthenticated(Boolean(data.authenticated));
      setFollowedStoryIds(Array.isArray(data.storyIds) ? data.storyIds.map((value) => String(value)) : []);
      setFollowedInterests(Array.isArray(data.interests) ? data.interests : []);
      setSemanticStoryIds(Array.isArray(data.semanticStoryIds) ? data.semanticStoryIds.map((value) => String(value)) : []);
    } catch {
      setAccountAuthenticated(false);
      setFollowedStoryIds([]);
      setFollowedInterests([]);
      setSemanticStoryIds([]);
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
  const semanticStoryIdSet = useMemo(() => new Set(semanticStoryIds), [semanticStoryIds]);
  const followedInterestQueries = useMemo(
    () => followedInterests.map((interest) => interest.normalizedQuery).filter(Boolean),
    [followedInterests]
  );
  const topicStoriesByTab = useMemo(() => {
    const entries: Array<[string, StoryWithViews[]]> = PRESET_TOPIC_TABS.map((topic) => [
      topic,
      recentStories.filter((story) => (story.topics ?? []).map(normalize).includes(topic)),
    ]);

    return new Map<string, StoryWithViews[]>(entries);
  }, [recentStories]);
  const followingStories = useMemo(
    () =>
      recentStories.filter((story) => {
        if (followedStoryIdSet.has(story.id)) return true;
        if (semanticStoryIdSet.has(story.id)) return true;
        return followedInterestQueries.some((query) => storyMatchesInterest(story, query));
      }),
    [followedInterestQueries, followedStoryIdSet, recentStories, semanticStoryIdSet]
  );
  const visible = useMemo(() => {
    if (activeTab === "following") return followingStories;
    if (activeTab === "recent") return recentStories;
    if (isPresetTopicTab(normalize(activeTab))) {
      return topicStoriesByTab.get(normalize(activeTab)) ?? [];
    }
    return [...recentStories].sort((a, b) => compareByPopularity(a, b, Date.now()));
  }, [activeTab, followingStories, recentStories, topicStoriesByTab]);
  const visibleStories = useMemo(() => visible.slice(0, visibleCount), [visible, visibleCount]);
  const canLoadMore = visibleCount < visible.length;

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
      <div className="mx-auto mb-8 max-w-4xl">
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
          <p className="mt-3 text-neutral-400">Multi-source news. Clear perspective.</p>
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

      <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between gap-4">
        <div className="flex space-x-3 overflow-x-auto pb-2">
          {[...BUILTIN_TAB_KEYS, ...PRESET_TOPIC_TABS].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTabAndUrl(tab)}
              className={`whitespace-nowrap rounded-full border px-5 py-2 text-sm transition ${
                activeTab === tab
                  ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                  : "border-[#0d2438] bg-[#020b14] text-[#d7e2ef] hover:bg-[#03101b]"
              }`}
            >
              {toTitleCase(tab)}
            </button>
          ))}
        </div>

        {activeTab === "following" && accountAuthenticated ? (
          <Link href="/account" className="text-sm text-neutral-400 transition hover:text-neutral-200">
            Manage interests
          </Link>
        ) : null}
      </div>

      <div className="mx-auto mb-6 min-h-[44px] max-w-4xl">
        {activeTab === "following" ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-h-[44px] flex-1">
              {!accountAuthenticated ? (
                <div className="text-sm text-neutral-500">Log in to follow interests and track stories.</div>
              ) : followedInterests.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Interests:</div>
                  {followedInterests.map((interest) => (
                    <span
                      key={interest.id}
                      className="rounded-full border border-[#163754] bg-[#020b14] px-3 py-1.5 text-xs text-neutral-300"
                    >
                      {interest.query}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-neutral-500">Add interests from your account page to shape this feed.</div>
              )}
            </div>

            {trackingStories.length > 0 ? (
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
            ) : null}
          </div>
        ) : activeTab === "popular" || activeTab === "recent" || isPresetTopicTab(normalize(activeTab)) ? trackingStories.length > 0 ? (
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
        ) : null : null}
      </div>

      <div className="mx-auto max-w-4xl space-y-8">
        {activeTab === "following" && loadingFollowState ? (
          <div className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-2xl font-semibold text-neutral-100">Loading stories...</h2>
            <p className="mt-3 text-neutral-400">Pulling together the latest coverage.</p>
          </div>
        ) : activeTab === "following" && !accountAuthenticated ? (
          <div className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-2xl font-semibold text-neutral-100">Log in to use Following</h2>
            <p className="mt-3 text-neutral-400">
              Save interests from your account page and track specific stories from their story pages.
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
              Add interests from your account page or track a story to populate this feed.
            </p>
            <Link
              href="/account"
              className="mt-6 inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-3 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]"
            >
              Open account
            </Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-2xl font-semibold text-neutral-100">No stories yet</h2>
            <p className="mt-3 text-neutral-400">
              {activeTab === "recent"
                ? "Check back soon for the latest stories."
                : isPresetTopicTab(normalize(activeTab))
                  ? `There are no ${toTitleCase(normalize(activeTab))} stories yet.`
                  : "Check back soon for popular stories."}
            </p>
          </div>
        ) : (
          visibleStories.map((story) => (
            <div key={story.id}>
              <Link
                href={`/story/${story.id}?from=${encodeURIComponent(activeTab)}`}
                onClick={() => persistHomeState()}
                className="block"
              >
                <div
                  className={`relative rounded-2xl border bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition ${
                    story.urgent ? "border-red-500/70 hover:border-red-400" : "border-[#0d2438] hover:border-[#163754]"
                  }`}
                >
                  {story.image_url ? (
                    story.image_display === "contain" ? (
                      <div className="mb-6 overflow-hidden rounded-xl bg-transparent">
                        <div className="flex justify-center p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={story.image_url}
                            alt={story.title}
                            loading="lazy"
                            className="block max-h-[28rem] max-w-full rounded-lg object-contain"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="mb-6 overflow-hidden rounded-xl bg-[#020b14]">
                        <div className="relative aspect-[4/3] md:aspect-[16/10]">
                          <Image
                            src={story.image_url}
                            alt={story.title}
                            fill
                            sizes="(max-width: 768px) 100vw, 896px"
                            className="object-cover"
                            style={{ objectPosition: imageObjectPosition(story) }}
                          />
                        </div>
                      </div>
                    )
                  ) : null}

                  <h2
                    className={`text-center font-semibold ${
                      story.urgent ? "text-3xl tracking-wide text-red-400 md:text-4xl" : "text-2xl"
                    }`}
                  >
                    {story.title}
                  </h2>

                  <div className="mx-auto mt-4 max-w-2xl space-y-2 text-center text-neutral-400">
                    {(story.summary ?? []).map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                  </div>

                  <div className="mt-5 text-center text-sm text-neutral-500">
                    {story.views} {story.views === 1 ? "view" : "views"} | {story.comments} comments
                  </div>

                  <div className="mt-2 text-center text-sm text-neutral-500">{formatStoryDate(story.date)}</div>

                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {(story.topics ?? []).map((topic) => (
                      <button
                        key={`${story.id}-${topic}`}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setActiveTabAndUrl(normalize(topic));
                        }}
                        className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition hover:bg-neutral-800"
                      >
                        {toTitleCase(normalize(topic))}
                      </button>
                    ))}
                  </div>
                </div>
              </Link>
            </div>
          ))
        )}
      </div>

      {canLoadMore ? (
        <div className="mx-auto mt-8 flex max-w-4xl justify-center">
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
