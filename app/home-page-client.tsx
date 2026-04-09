"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatStoryDate } from "./lib/dates";
import { imageObjectPosition } from "./lib/image-focus";
import type { StoryWithViews } from "./lib/types";
import { TOPICS, normalize, toTitleCase } from "./lib/vocab";

type TabKey = "popular" | "recent" | string;
type TopRange = "day" | "week" | "month";
type CustomSortMode = "top" | "new";

const PINNED_KEY = "signal:pinnedTags:v1";
const INITIAL_NOW_MS = Date.now();
const STORY_BATCH_SIZE = 10;
const TOP_RANGE_MS: Record<TopRange, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};
const TOP_RANGE_LABELS: Record<TopRange, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};
const TOP_RANGE_DESCRIPTIONS: Record<TopRange, string> = {
  day: "last 24 hours",
  week: "last 7 days",
  month: "last 30 days",
};

function TopRangeDropdown({
  value,
  onChange,
  hidden = false,
}: {
  value: TopRange;
  onChange: (range: TopRange) => void;
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`relative ${hidden ? "pointer-events-none opacity-0" : ""}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-w-[88px] items-center justify-between rounded-full border border-[#0d2438] bg-[#020b14] px-3 py-1.5 text-xs text-[#d7e2ef] transition hover:bg-[#03101b]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{TOP_RANGE_LABELS[value]}</span>
        <span className="ml-2 text-[10px]" aria-hidden="true">
          v
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 min-w-[120px] overflow-hidden rounded-2xl border border-[#163754] bg-[#020b14] shadow-[0_18px_45px_rgba(0,0,0,0.32)]">
          {(["day", "week", "month"] as TopRange[]).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => {
                onChange(range);
                setOpen(false);
              }}
              className={`block w-full px-4 py-2.5 text-left text-sm transition ${
                value === range
                  ? "bg-[#07101a] text-white"
                  : "text-neutral-300 hover:bg-[#03101b] hover:text-white"
              }`}
              role="menuitem"
            >
              {TOP_RANGE_LABELS[range]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getInitialPinned(): string[] {
  const defaultPinned = TOPICS.map((topic) => normalize(topic)).filter(Boolean);
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return defaultPinned;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultPinned;
    return parsed.map((v) => normalize(String(v))).filter(Boolean);
  } catch {
    return defaultPinned;
  }
}

function getInitialActiveTab(): TabKey {
  if (typeof window === "undefined") return "popular";
  try {
    const raw = new URLSearchParams(window.location.search).get("tab");
    const tab = normalize(raw ?? "");
    return tab ? (tab as TabKey) : "popular";
  } catch {
    return "popular";
  }
}

function publishedAtMs(story: StoryWithViews): number {
  const created = new Date(story.created_at ?? "").getTime();
  if (Number.isFinite(created) && created > 0) return created;

  const dateOnly = new Date(story.date ?? "").getTime();
  if (Number.isFinite(dateOnly) && dateOnly > 0) return dateOnly;

  return 0;
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

function updatedAtMs(story: StoryWithViews): number {
  const contentUpdated = new Date(story.content_updated_at ?? "").getTime();
  if (Number.isFinite(contentUpdated) && contentUpdated > 0) return contentUpdated;

  const created = new Date(story.created_at ?? "").getTime();
  if (Number.isFinite(created) && created > 0) return created;

  return publishedAtMs(story);
}

function isWithinTopRange(story: StoryWithViews, nowMs: number, range: TopRange): boolean {
  const publishedMs = publishedAtMs(story);
  if (!publishedMs) return false;
  return publishedMs >= nowMs - TOP_RANGE_MS[range];
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textMatchesKeyword(haystack: string, keyword: string) {
  const h = normalize(haystack);
  const k = normalize(keyword);
  if (!k) return false;

  if (k.includes(" ")) return h.includes(k);

  const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, "i");
  return re.test(h);
}

export default function HomePageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [stories, setStories] = useState<StoryWithViews[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialActiveTab);
  const [pinned, setPinned] = useState<string[]>(getInitialPinned);
  const [showManager, setShowManager] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [ghostTab, setGhostTab] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(STORY_BATCH_SIZE);
  const [customSortMode, setCustomSortMode] = useState<CustomSortMode>("new");
  const [customTopRange, setCustomTopRange] = useState<TopRange>("day");

  useEffect(() => {
    try {
      localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
    } catch {
      // ignore
    }
  }, [pinned]);

  useEffect(() => {
    setVisibleCount(STORY_BATCH_SIZE);
  }, [activeTab, customSortMode, customTopRange]);

  useEffect(() => {
    const requestedTab = normalize(searchParams.get("tab") ?? "");
    const nextTab = requestedTab || "popular";
    setActiveTab((current) => (normalize(String(current)) === nextTab ? current : nextTab));
  }, [searchParams]);

  useEffect(() => {
    const key = normalize(String(activeTab));
    if (!key || key === "popular" || key === "recent" || pinned.includes(key)) {
      setGhostTab(null);
      return;
    }

    setGhostTab(key);
  }, [activeTab, pinned]);

  useEffect(() => {
    const currentTab = normalize(searchParams.get("tab") ?? "");
    const desiredTab = normalize(String(activeTab));
    const nextParams = new URLSearchParams(searchParams.toString());

    if (!desiredTab || desiredTab === "popular") {
      if (!currentTab) return;
      nextParams.delete("tab");
    } else {
      if (currentTab === desiredTab) return;
      nextParams.set("tab", desiredTab);
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [activeTab, pathname, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stories", { cache: "no-store" });
        const data = (await res.json()) as unknown;
        if (!cancelled && Array.isArray(data)) {
          setStories(data as StoryWithViews[]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestedTopics = useMemo(() => TOPICS.map((t) => normalize(t)), []);
  const topicSet = useMemo(() => new Set(suggestedTopics), [suggestedTopics]);
  const customPinned = useMemo(() => pinned.filter((tag) => !topicSet.has(tag)), [pinned, topicSet]);

  const storyMatchesTab = useCallback((story: StoryWithViews, tab: string) => {
    const t = normalize(tab);
    if (!t) return false;

    if (topicSet.has(t)) {
      return (story.topics ?? []).map(normalize).includes(t);
    }

    for (const entity of story.entities ?? []) {
      if (normalize(entity.name) === t) return true;
      if ((entity.aliases ?? []).map(normalize).includes(t)) return true;
    }

    const haystack = [story.title, ...(story.summary ?? [])].join(" ");
    return textMatchesKeyword(haystack, t);
  }, [topicSet]);

  const trackingStories = useMemo(
    () => [...stories].filter((story) => story.pinned).sort((a, b) => updatedAtMs(b) - updatedAtMs(a)),
    [stories]
  );

  const tabs = useMemo(() => {
    const baseTabs = [
      { key: "popular" as TabKey, label: "Popular" },
      { key: "recent" as TabKey, label: "Recent" },
    ];

    const pinnedTabs = pinned.map((tag) => ({
      key: tag as TabKey,
      label: toTitleCase(tag),
    }));

    const ghostTabs =
      ghostTab && !pinned.includes(ghostTab)
        ? [{ key: ghostTab as TabKey, label: toTitleCase(ghostTab) }]
        : [];

    return [...baseTabs, ...pinnedTabs, ...ghostTabs];
  }, [pinned, ghostTab]);

  const recentStories = useMemo(
    () => [...stories].filter((story) => !story.pinned).sort((a, b) => publishedAtMs(b) - publishedAtMs(a)),
    [stories]
  );

  const topStories = useCallback((pool: StoryWithViews[], range: TopRange) => {
    const nowMs = INITIAL_NOW_MS;
    return pool
      .filter((story) => isWithinTopRange(story, nowMs, range))
      .sort((a, b) => compareByPopularity(a, b, nowMs));
  }, []);

  const customTabStories = useMemo(() => {
    if (activeTab === "popular" || activeTab === "recent") return [];
    return recentStories.filter((story) => storyMatchesTab(story, String(activeTab)));
  }, [recentStories, activeTab, storyMatchesTab]);

  const customTopStories = useMemo(() => topStories(customTabStories, customTopRange), [customTabStories, customTopRange, topStories]);
  const shouldFallbackToCustomNew =
    activeTab !== "popular" &&
    activeTab !== "recent" &&
    customSortMode === "top" &&
    customTopStories.length === 0 &&
    customTabStories.length > 0;
  const effectiveCustomSortMode: CustomSortMode =
    shouldFallbackToCustomNew ? "new" : customSortMode;

  const visible = useMemo(() => {
    if (activeTab === "recent") return recentStories;

    if (activeTab === "popular") {
      return [...recentStories].sort((a, b) => compareByPopularity(a, b, INITIAL_NOW_MS));
    }

    return effectiveCustomSortMode === "new" ? customTabStories : customTopStories;
  }, [
    activeTab,
    recentStories,
    effectiveCustomSortMode,
    customTabStories,
    customTopStories,
  ]);

  const visibleStories = useMemo(() => visible.slice(0, visibleCount), [visible, visibleCount]);
  const canLoadMore = visibleCount < visible.length;

  function togglePin(tag: string) {
    const t = normalize(tag);
    setPinned((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function addCustomTab() {
    const t = normalize(newTag);
    if (!t) return;

    setPinned((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setNewTag("");
    setActiveTab(t);
    setGhostTab(null);
  }

  return (
    <main className="min-h-screen bg-transparent p-8 text-neutral-100">
      <div className="max-w-4xl mx-auto mb-8">
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

      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between gap-4">
        <div className="flex space-x-3 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const key = normalize(String(tab.key));
            const isBuiltinTab = key === "popular" || key === "recent";
            const isGhostTab = ghostTab === key && !pinned.includes(key);

            return (
              <button
                key={String(tab.key)}
                onClick={() => {
                  setActiveTab(tab.key);

                  if (isBuiltinTab || pinned.includes(key)) {
                    setGhostTab(null);
                  } else {
                    setGhostTab(key);
                  }
                }}
                className={`whitespace-nowrap rounded-full border px-5 py-2 text-sm transition ${
                  activeTab === tab.key
                    ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                    : "border-[#0d2438] bg-[#020b14] text-[#d7e2ef] hover:bg-[#03101b]"
                }`}
                title={isGhostTab ? "Temporary (not pinned)" : undefined}
              >
                {tab.label}
                {isGhostTab ? " *" : ""}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowManager((v) => !v)}
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          {showManager ? "Done" : "Edit tabs"}
        </button>
      </div>

      <div className="max-w-4xl mx-auto mb-6 min-h-[44px]">
        {activeTab === "popular" || activeTab === "recent" ? (
          <div className="flex min-h-[44px] items-center justify-between gap-4">
            {trackingStories.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px]">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Tracking:</div>
                {trackingStories.map((story) => (
                  <Link
                    key={story.id}
                    href={`/story/${story.id}?from=${encodeURIComponent(String(activeTab))}`}
                    className="min-w-0 text-[15px] font-medium text-neutral-300 underline decoration-[#8f7740]/45 decoration-1 underline-offset-4 transition hover:text-white hover:decoration-[#b89a55]"
                  >
                    {story.title}
                  </Link>
                ))}
              </div>
            ) : (
              <div />
            )}
          </div>
        ) : (
          <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Sort by</span>
              {(["top", "new"] as CustomSortMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setCustomSortMode(mode)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    customSortMode === mode
                      ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                      : "border-[#0d2438] bg-[#020b14] text-[#d7e2ef] hover:bg-[#03101b]"
                  }`}
                >
                  {mode === "top" ? "Top" : "New"}
                </button>
              ))}
            </div>
            <div className="flex flex-col items-end gap-2">
              {customSortMode === "top" ? (
                <TopRangeDropdown value={customTopRange} onChange={setCustomTopRange} />
              ) : null}
              {shouldFallbackToCustomNew ? (
                <div className="text-right text-xs text-neutral-500">
                  No top stories in the {TOP_RANGE_DESCRIPTIONS[customTopRange]}. Showing newest instead.
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {showManager && (
        <div className="max-w-4xl mx-auto mb-8 rounded-xl border border-neutral-700 bg-[var(--surface)] p-6">
          <div className="mb-4 text-sm font-semibold uppercase text-neutral-300">
            Manage Tabs
          </div>

          <div className="mb-4 flex gap-2">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add keyword (e.g. Middle East)"
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCustomTab();
              }}
            />
            <button
              onClick={addCustomTab}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-900"
            >
              Add
            </button>
          </div>

          <div className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Suggested topics
            </h3>

            <div className="flex flex-wrap gap-2">
              {suggestedTopics.map((tag) => {
                const isPinned = pinned.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => togglePin(tag)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      isPinned
                        ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                        : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                    }`}
                    title={isPinned ? "Remove tab" : "Add tab"}
                  >
                    {isPinned ? "x " : "+ "}
                    {toTitleCase(tag)}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-xs text-neutral-500">
              These are your main sections. Pin the ones you want in the top row.
            </p>
          </div>

          <div className="mb-2 text-xs text-neutral-500">
            Custom keywords (click to remove):
          </div>
          <div className="flex flex-wrap gap-2">
            {customPinned.map((tag) => (
              <button
                key={tag}
                onClick={() => togglePin(tag)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
                title="Remove"
              >
                x {toTitleCase(tag)}
              </button>
            ))}
            {customPinned.length === 0 && <span className="text-xs text-neutral-600">No custom keywords yet</span>}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-8">
        {isLoading ? (
          <div className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-2xl font-semibold text-neutral-100">Loading stories...</h2>
            <p className="mt-3 text-neutral-400">Pulling together the latest coverage.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
              <h2 className="text-2xl font-semibold text-neutral-100">No stories yet</h2>
              <p className="mt-3 text-neutral-400">
                {activeTab === "popular" || activeTab === "recent"
                  ? activeTab === "recent"
                    ? "Check back soon for the latest stories."
                    : "Check back soon for popular stories."
                  : effectiveCustomSortMode === "new"
                    ? `There are no new stories in ${toTitleCase(String(activeTab))} yet.`
                    : `There are no top stories in ${toTitleCase(String(activeTab))} from the ${TOP_RANGE_DESCRIPTIONS[customTopRange]} yet.`}
              </p>
            </div>
        ) : (
          visibleStories.map((story) => (
            <Link
              key={story.id}
              href={`/story/${story.id}?from=${encodeURIComponent(String(activeTab))}`}
              className="block"
            >
                <div
                 className={`rounded-2xl border p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition ${
                    story.urgent
                      ? "border-red-500/70 hover:border-red-400"
                      : "border-[#0d2438] hover:border-[#163754]"
                  } bg-[var(--surface)] relative`}
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

                 <div className="mt-2 text-center text-sm text-neutral-500">
                   {formatStoryDate(story.date)}
                 </div>

                 <div className="mt-5 flex flex-wrap justify-center gap-2">
                   {(story.topics ?? []).map((topic) => {
                     const key = normalize(topic);
                     return (
                       <button
                         key={key}
                         onClick={(e) => {
                           e.preventDefault();
                           e.stopPropagation();

                           setActiveTab(key);

                           if (!pinned.includes(key)) setGhostTab(key);
                           else setGhostTab(null);
                         }}
                         className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition hover:bg-neutral-800"
                       >
                         {toTitleCase(key)}
                       </button>
                     );
                   })}
                 </div>
               </div>
            </Link>
          ))
        )}
      </div>

      {!isLoading && canLoadMore ? (
        <div className="mx-auto mt-8 flex max-w-4xl justify-center">
          <button
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
