"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StoryWithViews } from "./lib/types";
import { TOPICS, normalize, toTitleCase } from "./lib/vocab";

type TabKey = "popular" | "recent" | string;

const PINNED_KEY = "signal:pinnedTags:v1";
const ACTIVE_KEY = "signal:activeTab:v2";
const INITIAL_NOW_MS = Date.now();

function getInitialPinned(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => normalize(String(v))).filter(Boolean);
  } catch {
    return [];
  }
}

function getInitialActiveTab(): TabKey {
  if (typeof window === "undefined") return "popular";
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? (raw as TabKey) : "popular";
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

export default function Home() {
  const [stories, setStories] = useState<StoryWithViews[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialActiveTab);
  const [pinned, setPinned] = useState<string[]>(getInitialPinned);
  const [showManager, setShowManager] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [ghostTab, setGhostTab] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
    } catch {
      // ignore
    }
  }, [pinned]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_KEY, String(activeTab));
    } catch {
      // ignore
    }
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/stories", { cache: "no-store" });
      const data = (await res.json()) as unknown;
      if (!cancelled && Array.isArray(data)) {
        setStories(data as StoryWithViews[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestedTopics = useMemo(() => TOPICS.map((t) => normalize(t)), []);
  const topicSet = useMemo(() => new Set(suggestedTopics), [suggestedTopics]);

  function storyMatchesTab(story: StoryWithViews, tab: string) {
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
  }

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

  const visible = useMemo(() => {
    const nowMs = INITIAL_NOW_MS;
    const recent = [...stories].sort((a, b) => publishedAtMs(b) - publishedAtMs(a));

    if (activeTab === "recent") return recent;

    if (activeTab === "popular") {
      return [...stories].sort((a, b) => {
        const byScore = popularScore(b, nowMs) - popularScore(a, nowMs);
        if (byScore !== 0) return byScore;

        const byViews = Number(b.views ?? 0) - Number(a.views ?? 0);
        if (byViews !== 0) return byViews;

        return publishedAtMs(b) - publishedAtMs(a);
      });
    }

    return recent.filter((story) => storyMatchesTab(story, String(activeTab)));
  }, [stories, activeTab, topicSet]);

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
      <div className="max-w-4xl mx-auto mb-8 flex justify-center">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/newthebeacon.png"
            alt="The Beacon"
            width={1408}
            height={736}
            priority
            className="h-auto w-full max-w-[420px] md:max-w-[520px]"
          />
          <p className="mt-3 text-neutral-400">Multi-source news. Clear perspective.</p>
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
                    : isBuiltinTab
                      ? "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                      : "border-[#12314c] bg-[#071a2c] text-[#d7e2ef] hover:bg-[#0b2238]"
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

      {showManager && (
        <div className="max-w-4xl mx-auto mb-8 rounded-xl border border-neutral-700 bg-[var(--surface)] p-6">
          <div className="mb-4 text-sm font-semibold uppercase text-neutral-300">
            Manage Tabs
          </div>

          <div className="mb-4 flex gap-2">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add keyword (e.g. Cuba)"
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
            Pinned keywords (click to remove):
          </div>
          <div className="flex flex-wrap gap-2">
            {pinned.map((tag) => (
              <button
                key={tag}
                onClick={() => togglePin(tag)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
                title="Remove"
              >
                x {toTitleCase(tag)}
              </button>
            ))}
            {pinned.length === 0 && <span className="text-xs text-neutral-600">None yet</span>}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-8">
        {visible.map((story) => (
          <Link
            key={story.id}
            href={`/story/${story.id}?from=${encodeURIComponent(String(activeTab))}`}
            className="block"
          >
            <div
              className={`rounded-2xl border bg-[var(--surface)] p-8 transition ${
                story.urgent
                  ? "border-red-500/70 hover:border-red-400"
                  : "border-neutral-700 hover:border-neutral-500"
              }`}
            >
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
        ))}
      </div>
    </main>
  );
}
