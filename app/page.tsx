"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TOPICS, normalize, toTitleCase } from "./lib/vocab";
import type { StoryWithViews } from "./lib/types";

type TabKey = "popular" | "recent" | string;

const PINNED_KEY = "signal:pinnedTags:v1";
const ACTIVE_KEY = "signal:activeTab:v1";

function getInitialPinned(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => normalize(String(value))).filter(Boolean);
  } catch {
    return [];
  }
}

function getInitialActiveTab(): TabKey {
  if (typeof window === "undefined") return "recent";
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? (raw as TabKey) : "recent";
  } catch {
    return "recent";
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textMatchesKeyword(haystack: string, keyword: string) {
  const h = normalize(haystack);
  const k = normalize(keyword);
  if (!k) return false;

  if (k.includes(" ")) return h.includes(k);

  const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, "i");
  return re.test(h);
}

function storyMatchesTab(story: StoryWithViews, tab: string) {
  const t = normalize(tab);
  if (!t) return false;

  if ((story.topics ?? []).map(normalize).includes(t)) return true;
  if ((story.primary_entities ?? []).map(normalize).includes(t)) return true;

  for (const entity of story.entities ?? []) {
    if (normalize(entity.name) === t) return true;
    if ((entity.aliases ?? []).map(normalize).includes(t)) return true;
  }

  if ((story.tags ?? []).map(normalize).includes(t)) return true;

  const haystack = [story.title, ...(story.summary ?? [])].join(" ");
  return textMatchesKeyword(haystack, t);
}

export default function Home() {
  const [stories, setStories] = useState<StoryWithViews[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialActiveTab);
  const [pinned, setPinned] = useState<string[]>(getInitialPinned);
  const [showManager, setShowManager] = useState(false);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
    } catch {
      // ignore localStorage failures
    }
  }, [pinned]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_KEY, String(activeTab));
    } catch {
      // ignore localStorage failures
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
    })().catch(() => {
      if (!cancelled) setStories([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestedTopics = useMemo(() => TOPICS.map((topic) => normalize(topic)), []);

  const ghostTab = useMemo(() => {
    const key = normalize(String(activeTab));
    if (key === "popular" || key === "recent") return null;
    if (pinned.includes(key)) return null;
    return key || null;
  }, [activeTab, pinned]);

  const tabs = useMemo(() => {
    const baseTabs = [
      { key: "popular" as TabKey, label: "Popular" },
      { key: "recent" as TabKey, label: "Recent" },
    ];
    const pinnedTabs = pinned.map((tag) => ({ key: tag as TabKey, label: toTitleCase(tag) }));
    const ghostTabs = ghostTab ? [{ key: ghostTab as TabKey, label: toTitleCase(ghostTab) }] : [];
    return [...baseTabs, ...pinnedTabs, ...ghostTabs];
  }, [pinned, ghostTab]);

  const visible = useMemo(() => {
    const recent = [...stories].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (activeTab === "recent") return recent;
    if (activeTab === "popular") return [...stories].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    return recent.filter((story) => storyMatchesTab(story, String(activeTab)));
  }, [stories, activeTab]);

  function togglePin(tag: string) {
    const normalized = normalize(tag);
    setPinned((prev) =>
      prev.includes(normalized) ? prev.filter((existing) => existing !== normalized) : [...prev, normalized]
    );
  }

  function addCustomTab() {
    const normalized = normalize(newTag);
    if (!normalized) return;
    setPinned((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setNewTag("");
    setActiveTab(normalized);
  }

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
      <div className="max-w-4xl mx-auto mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Signal</h1>
          <p className="text-neutral-400">Multi-source news. Clear perspective.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between">
        <div className="flex space-x-3 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={String(tab.key)}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 rounded-full border text-sm transition whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                  : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button onClick={() => setShowManager((value) => !value)} className="text-sm text-neutral-400 hover:text-neutral-200">
          {showManager ? "Done" : "Edit tabs"}
        </button>
      </div>

      {showManager && (
        <div className="max-w-4xl mx-auto mb-8 bg-neutral-900 border border-neutral-700 rounded-xl p-6">
          <div className="text-sm font-semibold text-neutral-300 mb-4 uppercase">Manage Tabs</div>

          <div className="flex gap-2 mb-4">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add keyword (e.g. Cuba)"
              className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCustomTab();
              }}
            />
            <button onClick={addCustomTab} className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg text-sm">
              Add
            </button>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Suggested topics</h3>
            <div className="flex flex-wrap gap-2">
              {suggestedTopics.map((tag) => {
                const isPinned = pinned.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => togglePin(tag)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      isPinned
                        ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                        : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800"
                    }`}
                    title={isPinned ? "Remove tab" : "Add tab"}
                  >
                    {isPinned ? "OK " : "+ "}
                    {toTitleCase(tag)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              These are your main sections. Pin the ones you want in the top row.
            </p>
          </div>

          <div className="text-xs text-neutral-500 mb-2">Pinned keywords (click to remove):</div>
          <div className="flex flex-wrap gap-2">
            {pinned.map((tag) => (
              <button
                key={tag}
                onClick={() => togglePin(tag)}
                className="text-xs px-3 py-1.5 rounded-full border border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                title="Remove"
              >
                {"X "}
                {toTitleCase(tag)}
              </button>
            ))}
            {pinned.length === 0 && <span className="text-xs text-neutral-600">None yet</span>}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-8">
        {visible.map((story) => (
          <Link key={story.id} href={`/story/${story.id}?from=${encodeURIComponent(String(activeTab))}`} className="block">
            <div
              className={`bg-neutral-900 p-8 rounded-2xl border transition ${
                story.urgent
                  ? "border-red-500/70 hover:border-red-400 shadow-[0_0_0_1px_rgba(239,68,68,0.25)]"
                  : "border-neutral-700 hover:border-neutral-500"
              }`}
            >
              <h2
                className={`text-center font-semibold ${
                  story.urgent ? "text-3xl md:text-4xl text-red-400 tracking-wide" : "text-2xl"
                }`}
              >
                {story.title}
              </h2>

              <div className="mt-4 space-y-2 text-neutral-400 text-center max-w-2xl mx-auto">
                {story.summary.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>

              <div className="mt-5 text-sm text-neutral-500 text-center">
                {story.views} views | {story.comments} comments
              </div>

              <div className="mt-5 flex flex-wrap gap-2 justify-center">
                {(story.topics ?? []).map((topic) => {
                  const key = normalize(topic);
                  return (
                    <button
                      key={key}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveTab(key);
                      }}
                      className="text-xs px-2 py-1 rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition"
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
