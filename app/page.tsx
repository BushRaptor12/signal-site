"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Story } from "./lib/types";

type TabKey = "popular" | "recent" | string;

const STORAGE_KEY = "signal:pinnedTags:v2";
const ACTIVE_TAB_KEY = "signal:activeTab:v1";

function normalizeTag(tag: string) {
  return String(tag).trim().toLowerCase();
}

function toTitleCase(tag: string) {
  return tag
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>("recent");
  const [pinnedTags, setPinnedTags] = useState<string[]>([]);
  const [showManager, setShowManager] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [hasLoadedPins, setHasLoadedPins] = useState(false);
  const [ghostTab, setGhostTab] = useState<string | null>(null);

  const isBaseTab = activeTab === "popular" || activeTab === "recent";
  const normalizedActiveTag = normalizeTag(String(activeTab));
  const isPinned = !isBaseTab && pinnedTags.includes(normalizedActiveTag);
  const isGhostActive = !isBaseTab && !isPinned && ghostTab === normalizedActiveTag;
  const [allStories, setAllStories] = useState<Story[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/stories", { cache: "no-store" });
      const data = (await res.json()) as unknown;
      setAllStories(Array.isArray(data) ? (data as Story[]) : []);
    })();
  }, []);

  // All tags that exist in story data (for "preselected" list)
  const allStoryTags = useMemo(() => {
    const set = new Set<string>();
    allStories.forEach((story) => story.tags?.forEach((tag) => set.add(normalizeTag(tag))));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allStories]);

  // Custom pinned tags = pinned tags that aren't present in any story tags
  const customPinnedTags = useMemo(() => {
    const storyTagSet = new Set(allStoryTags);
    return pinnedTags.filter((t) => !storyTagSet.has(t));
  }, [pinnedTags, allStoryTags]);

  // Load pinned tags (once)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setPinnedTags(parsed.map((t) => normalizeTag(t)).filter(Boolean));
        }
      }
    } catch {
      // ignore
    } finally {
      setHasLoadedPins(true);
    }
  }, []);

  // Save pinned tags (only after initial load)
  useEffect(() => {
    if (!hasLoadedPins) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedTags));
    } catch {
      // ignore
    }
  }, [pinnedTags, hasLoadedPins]);

  // URL tab wins (/?tab=immigration)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!tab) return;

    setActiveTab(tab);
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, tab);
    } catch {
      // ignore
    }
  }, [searchParams]);

  // If no URL tab, restore last active tab from localStorage after pins load
  useEffect(() => {
    const tabInUrl = searchParams.get("tab");
    if (tabInUrl) return;

    try {
      const raw = localStorage.getItem(ACTIVE_TAB_KEY);
      if (!raw) return;

      if (raw === "popular" || raw === "recent") {
        setActiveTab(raw);
        return;
      }

      // only restore a tag tab if it is pinned
      const norm = normalizeTag(raw);
      if (pinnedTags.includes(norm)) setActiveTab(norm);
    } catch {
      // ignore
    }
  }, [pinnedTags, searchParams]);

  // Persist active tab when user clicks tabs (but don’t fight URL)
  useEffect(() => {
    const tabInUrl = searchParams.get("tab");
    if (tabInUrl) return;

    try {
      localStorage.setItem(ACTIVE_TAB_KEY, String(activeTab));
    } catch {
      // ignore
    }
  }, [activeTab, searchParams]);

  // Keep ghost tab synced with active tab:
  // if active tab is a non-pinned keyword, show it as a ghost tab in the top row
  useEffect(() => {
    if (isBaseTab || isPinned) {
      setGhostTab(null);
      return;
    }
    if (isGhostActive) {
      setGhostTab(normalizedActiveTag);
    }
  }, [isBaseTab, isPinned, isGhostActive, normalizedActiveTag]);

  // Tabs in top row: Popular + Recent + pinned + ghost(if needed)
  const tabs = useMemo(() => {
    const baseTabs = [
      { key: "popular" as TabKey, label: "Popular" },
      { key: "recent" as TabKey, label: "Recent" },
    ];

    const pinned = pinnedTags.map((t) => ({
      key: t as TabKey,
      label: toTitleCase(t),
    }));

    const ghost =
      ghostTab && !pinnedTags.includes(ghostTab)
        ? [{ key: ghostTab as TabKey, label: toTitleCase(ghostTab) }]
        : [];

    return [...baseTabs, ...pinned, ...ghost];
  }, [pinnedTags, ghostTab]);
  function storyMatchesTab(story: Story, tab: string) {
    const t = normalizeTag(tab);
    if (!t) return false;

    // topics (NYT-style sections as keywords)
    if ((story.topics ?? []).map(normalizeTag).includes(t)) return true;

    // primaryEntities (highest precision)
    if ((story.primaryEntities ?? []).map(normalizeTag).includes(t)) return true;

    // entities + aliases
    for (const entity of story.entities ?? []) {
      if (normalizeTag(entity.name) === t) return true;
      if ((entity.aliases ?? []).map(normalizeTag).includes(t)) return true;
    }

    // legacy tags (keeps old behavior while migrating)
    if ((story.tags ?? []).map(normalizeTag).includes(t)) return true;

    // strict phrase match in title/summary (still hard filter)
    const haystack = normalizeTag([story.title, ...story.summary].join(" "));
    return haystack.includes(t);
  }
  // Filter/sort stories by the active tab
  const visibleStories = useMemo(() => {
    const sorted = [...allStories].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    if (activeTab === "recent") return sorted;

    if (activeTab === "popular") {
  return [...sorted].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
}

    return sorted.filter((story) => storyMatchesTab(story, String(activeTab)));
  }, [activeTab, allStories]);

  function togglePin(tag: string) {
    const t = normalizeTag(tag);
    setPinnedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function addCustomTag() {
    const t = normalizeTag(newTagInput);
    if (!t) return;

    setPinnedTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setNewTagInput("");
    setActiveTab(t); // nice UX: jump to it
  }

  function removeCustomTag(tag: string) {
    const t = normalizeTag(tag);

    setPinnedTags((prev) => prev.filter((x) => x !== t));

    // If user is currently on that tab, bounce to Recent
    setActiveTab((cur) => (normalizeTag(String(cur)) === t ? "recent" : cur));

    // Keep localStorage sane
    try {
      const cur = localStorage.getItem(ACTIVE_TAB_KEY);
      if (cur && normalizeTag(cur) === t) {
        localStorage.setItem(ACTIVE_TAB_KEY, "recent");
      }
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <h1 className="text-4xl font-bold">Signal</h1>
        <p className="text-neutral-400">Multi-source news. Clear perspective.</p>
      </div>

      {/* Tabs row */}
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between">
        <div className="flex space-x-3 overflow-x-auto pb-2">
          {tabs.map((t) => {
            const isGhost = typeof t.key === "string" && t.key === ghostTab;
            return (
              <button
                key={t.key}
                onClick={() => {
                  // If we arrived with ?tab=..., clear it
                  if (searchParams.get("tab")) {
                    router.replace("/");
                  }

                  setActiveTab(t.key);

                  // Persist immediately so restore effect doesn't snap back
                  try {
                    localStorage.setItem(ACTIVE_TAB_KEY, String(t.key));
                  } catch {
                    // ignore
                  }

                  // Ghost handling on click
                  if (t.key === "popular" || t.key === "recent") {
                    setGhostTab(null);
                  } else {
                    const k = normalizeTag(String(t.key));
                    if (!pinnedTags.includes(k)) setGhostTab(k);
                    else setGhostTab(null);
                  }
                }}
                className={`px-5 py-2 rounded-full border text-sm transition whitespace-nowrap ${
                  activeTab === t.key
                    ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                    : isGhost
                    ? "bg-neutral-900 text-neutral-200 border-neutral-500 hover:bg-neutral-800"
                    : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800"
                }`}
                title={isGhost ? "Temporary tab (not pinned)" : undefined}
              >
                {t.label}
                {isGhost ? " •" : ""}
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
      
      {/* Keyword manager */}
      {showManager && (
        <div className="max-w-4xl mx-auto mb-10 bg-neutral-900 border border-neutral-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-neutral-300 mb-4 uppercase">
            Manage Keyword Tabs
          </h2>

          {/* Add custom keyword */}
          <div className="flex gap-2 mb-6">
            <input
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              placeholder="Add keyword (e.g. Bitcoin)"
              className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCustomTag();
              }}
            />
            <button
              onClick={addCustomTag}
              className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg text-sm"
            >
              Add
            </button>
          </div>

          {/* Custom pinned tabs (removable) */}
          {customPinnedTags.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
                Custom tabs
              </h3>

              <div className="flex flex-wrap gap-2">
                {customPinnedTags.map((tag) => (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-700 bg-neutral-950/30"
                  >
                    <span className="text-xs text-neutral-200">
                      {toTitleCase(tag)}
                    </span>
                    <button
                      onClick={() => removeCustomTag(tag)}
                      className="text-xs text-neutral-400 hover:text-neutral-200"
                      title="Remove custom tab"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing story tags */}
          <div className="flex flex-wrap gap-2">
            {allStoryTags.map((tag) => {
              const pinned = pinnedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => togglePin(tag)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    pinned
                      ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                      : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800"
                  }`}
                  title={pinned ? "Remove tab" : "Add tab"}
                >
                  {pinned ? "✓ " : "+ "}
                  {toTitleCase(tag)}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            Pin the keywords you want in the top row.
          </p>
        </div>
      )}

      {/* Stories */}
      <div className="max-w-4xl mx-auto space-y-8">
        {visibleStories.map((story) => (
          <Link
            key={story.id}
            href={`/story/${encodeURIComponent(story.id)}?from=${encodeURIComponent(String(activeTab))}`}
            className="block"
          >
            <div className="bg-neutral-900 p-8 rounded-2xl border border-neutral-700 hover:border-neutral-500 transition">
              <h2 className="text-2xl font-semibold text-center">{story.title}</h2>

              <ul className="mt-4 space-y-2 text-neutral-400 text-center max-w-2xl mx-auto">
                {story.summary.map((p, i) => (
                  <li key={i} className="list-none">
                    {p}
                  </li>
                ))}
              </ul>

              {/* Tag pills */}
              <div className="mt-5 flex flex-wrap gap-2 justify-center">
                {story.tags.map((tag) => {
                  const t = normalizeTag(tag);
                  return (
                    <button
                      key={t}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        // If we arrived with ?tab=..., clear it
                        if (searchParams.get("tab")) {
                          router.replace("/");
                        }

                        setActiveTab(t);

                        // make it a ghost tab if not pinned
                        if (!pinnedTags.includes(t)) setGhostTab(t);
                        else setGhostTab(null);
                      }}
                      className="text-xs px-2 py-1 rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition"
                    >
                      {toTitleCase(t)}
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

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
          <div className="max-w-4xl mx-auto text-neutral-300">Loading feed...</div>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
