"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { normalize, toTitleCase } from "./lib/vocab";
import type { StoryWithViews } from "./lib/types";

type TabKey = "popular" | "recent" | string;

const PINNED_KEY = "signal:pinnedTags:v1";
const ACTIVE_KEY = "signal:activeTab:v1";
const [ghostTab, setGhostTab] = useState<string | null>(null);
function storyMatchesTab(story: StoryWithViews, tab: string) {
  const t = normalize(tab);
  if (!t) return false;

  // topics
  if ((story.topics ?? []).map(normalize).includes(t)) return true;

  // primary entities
  if ((story.primary_entities ?? []).map(normalize).includes(t)) return true;

  // entities + aliases
  for (const e of story.entities ?? []) {
    if (normalize(e.name) === t) return true;
    if ((e.aliases ?? []).map(normalize).includes(t)) return true;
  }

  // fallback legacy tags
  if ((story.tags ?? []).map(normalize).includes(t)) return true;

  return false;
}

export default function Home() {
  const [stories, setStories] = useState<StoryWithViews[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("recent");
  const [pinned, setPinned] = useState<string[]>([]);
  const [showManager, setShowManager] = useState(false);
  const [newTag, setNewTag] = useState("");

  // load pins + active tab
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PINNED_KEY) || "[]");
      if (Array.isArray(p)) setPinned(p.map(normalize).filter(Boolean));
    } catch {}
    try {
      const a = localStorage.getItem(ACTIVE_KEY);
      if (a) setActiveTab(a);
    } catch {}
  }, []);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
    } catch {}
  }, [pinned]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_KEY, String(activeTab));
    } catch {}
  }, [activeTab]);

  // fetch stories
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/stories", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) setStories(data);
    })();
  }, []);

  const tabs = useMemo(() => {
  const base = [
    { key: "popular" as TabKey, label: "Popular" },
    { key: "recent" as TabKey, label: "Recent" },
  ];

  const pinnedTabs = pinned.map((t) => ({ key: t as TabKey, label: toTitleCase(t) }));

  const ghost =
    ghostTab && !pinned.includes(ghostTab)
      ? [{ key: ghostTab as TabKey, label: toTitleCase(ghostTab) }]
      : [];

  return [...base, ...pinnedTabs, ...ghost];
}, [pinned, ghostTab]);

  const visible = useMemo(() => {
    const sortedRecent = [...stories].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    if (activeTab === "recent") return sortedRecent;

    if (activeTab === "popular") {
      return [...stories].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    }

    return sortedRecent.filter((s) => storyMatchesTab(s, String(activeTab)));
  }, [stories, activeTab]);

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
          {tabs.map((t) => (
            <button
              key={String(t.key)}
              onClick={() => {
  setActiveTab(t.key);

  // If switching to base tabs or a pinned tab, ghost should disappear
  const key = String(t.key);
  if (key === "popular" || key === "recent" || pinned.includes(normalize(key))) {
    setGhostTab(null);
  } else {
    // otherwise keep showing this as the ghost
    setGhostTab(normalize(key));
  }
}}
              className={`px-5 py-2 rounded-full border text-sm transition whitespace-nowrap ${
                activeTab === t.key
                  ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                  : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowManager((v) => !v)}
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
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
            <button
              onClick={addCustomTab}
              className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg text-sm"
            >
              Add
            </button>
          </div>

          <div className="text-xs text-neutral-500 mb-2">Pinned keywords (click to remove):</div>
          <div className="flex flex-wrap gap-2">
            {pinned.map((t) => (
              <button
                key={t}
                onClick={() => togglePin(t)}
                className="text-xs px-3 py-1.5 rounded-full border border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                title="Remove"
              >
                ✕ {toTitleCase(t)}
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
            <div className="bg-neutral-900 p-8 rounded-2xl border border-neutral-700 hover:border-neutral-500 transition">
              <h2 className="text-2xl font-semibold text-center">{story.title}</h2>

              <div className="mt-4 space-y-2 text-neutral-400 text-center max-w-2xl mx-auto">
                {story.summary.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>

              <div className="mt-5 text-sm text-neutral-500 text-center">
                {story.views} views • {story.comments} comments • {story.date}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {(story.topics ?? []).map((t) => {
                  const key = normalize(t);
                  return (
                    <button
                      key={key}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const key = normalize(t);
  setActiveTab(key);

  // show temporary tab in the nav row if it isn't pinned
  if (!pinned.includes(key)) setGhostTab(key);
  else setGhostTab(null);
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