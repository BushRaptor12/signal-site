"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StoryWithViews } from "@/app/lib/types";

const TOKEN_KEY = "signal_admin_token";

type AdminBriefingResponse = {
  briefing?: StoryWithViews[];
  library?: StoryWithViews[];
  error?: string;
  ok?: boolean;
};

type SavedBriefingItem = {
  id: string;
  beacon_headline: string | null;
};

function getInitialToken() {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem(TOKEN_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function displayHeadline(story: StoryWithViews) {
  return story.beacon_headline?.trim() || story.title;
}

function reorderStories(stories: StoryWithViews[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return stories;
  if (fromIndex < 0 || toIndex < 0) return stories;
  if (fromIndex >= stories.length || toIndex >= stories.length) return stories;

  const next = [...stories];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function sortLibrary(stories: StoryWithViews[]) {
  return [...stories].sort((left, right) => {
    const leftDate = Date.parse(left.created_at ?? left.date);
    const rightDate = Date.parse(right.created_at ?? right.date);
    return rightDate - leftDate;
  });
}

export default function AdminBriefingPage() {
  const initialToken = getInitialToken();
  const [adminToken, setAdminToken] = useState(initialToken);
  const [showTokenInput, setShowTokenInput] = useState(!initialToken);
  const [tokenDraft, setTokenDraft] = useState(initialToken);
  const [briefingStories, setBriefingStories] = useState<StoryWithViews[]>([]);
  const [libraryStories, setLibraryStories] = useState<StoryWithViews[]>([]);
  const [savedBriefing, setSavedBriefing] = useState<SavedBriefingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function loadStories(token: string) {
    if (!token) return;

    setLoading(true);
    setError("");
    setStatus("");

    try {
      const res = await fetch("/api/admin/briefing", {
        headers: { "x-admin-token": token },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as AdminBriefingResponse;

      if (!res.ok) {
        throw new Error(json.error ?? res.statusText);
      }

      const nextBriefing = json.briefing ?? [];
      const nextLibrary = json.library ?? [];
      setBriefingStories(nextBriefing);
      setLibraryStories(nextLibrary);
      setSavedBriefing(
        nextBriefing.map((story) => ({
          id: story.id,
          beacon_headline: story.beacon_headline?.trim() || null,
        }))
      );
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!adminToken) return;
    void loadStories(adminToken);
  }, [adminToken]);

  const hasUnsavedChanges = useMemo(() => {
    if (briefingStories.length !== savedBriefing.length) return true;

    return briefingStories.some((story, index) => {
      const saved = savedBriefing[index];
      if (!saved) return true;

      return saved.id !== story.id || saved.beacon_headline !== (story.beacon_headline?.trim() || null);
    });
  }, [briefingStories, savedBriefing]);

  const filteredLibrary = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return libraryStories;

    return libraryStories.filter((story) => {
      const headline = displayHeadline(story).toLowerCase();
      const storyId = story.id.toLowerCase();
      const summary = story.summary.join(" ").toLowerCase();
      return headline.includes(query) || storyId.includes(query) || summary.includes(query);
    });
  }, [libraryStories, search]);

  function saveToken() {
    const token = tokenDraft.trim();
    if (!token) return;

    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // ignore localStorage write failure
    }

    setAdminToken(token);
    setShowTokenInput(false);
    setTokenDraft(token);
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore localStorage remove failure
    }

    setAdminToken("");
    setTokenDraft("");
    setShowTokenInput(true);
    setBriefingStories([]);
    setLibraryStories([]);
    setSavedBriefing([]);
    setSearch("");
    setError("");
    setStatus("");
  }

  function moveStory(fromIndex: number, toIndex: number) {
    setBriefingStories((current) => reorderStories(current, fromIndex, toIndex));
    setStatus("");
  }

  function addStoryToBriefing(storyId: string) {
    const story = libraryStories.find((item) => item.id === storyId);
    if (!story) return;

    setLibraryStories((current) => current.filter((item) => item.id !== storyId));
    setBriefingStories((current) => [...current, { ...story, beacon_include: true }]);
    setStatus("");
  }

  function removeStoryFromBriefing(storyId: string) {
    const story = briefingStories.find((item) => item.id === storyId);
    if (!story) return;

    setBriefingStories((current) => current.filter((item) => item.id !== storyId));
    setLibraryStories((current) => sortLibrary([...current, { ...story, beacon_include: false, beacon_rank: null }]));
    setStatus("");
  }

  function updateBriefingHeadline(storyId: string, value: string) {
    setBriefingStories((current) =>
      current.map((story) =>
        story.id === storyId
          ? {
              ...story,
              beacon_headline: value,
            }
          : story
      )
    );
    setStatus("");
  }

  async function saveOrder() {
    if (!adminToken) {
      setShowTokenInput(true);
      setError("Admin token required.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");

    try {
      const res = await fetch("/api/admin/briefing", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({
          briefing: briefingStories.map((story) => ({
            id: story.id,
            beacon_headline: story.beacon_headline?.trim() || null,
          })),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as AdminBriefingResponse;
      if (!res.ok) {
        throw new Error(json.error ?? res.statusText);
      }

      const nextBriefing = json.briefing ?? [];
      const nextLibrary = json.library ?? [];
      setBriefingStories(nextBriefing);
      setLibraryStories(nextLibrary);
      setSavedBriefing(
        nextBriefing.map((story) => ({
          id: story.id,
          beacon_headline: story.beacon_headline?.trim() || null,
        }))
      );
      setStatus("Briefing saved.");
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-900 p-8 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-3xl font-bold">Briefing Manager</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Build The Briefing here: add stories, remove stories, then drag them into the final order.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={clearToken} className="text-xs text-neutral-400 hover:text-neutral-200">
              Change token
            </button>
            <Link
              href="/admin/editor"
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
            >
              Story editor
            </Link>
            <Link
              href="/briefing"
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
            >
              View briefing
            </Link>
          </div>
        </div>

        {showTokenInput && (
          <div className="mt-6 rounded-2xl border border-neutral-700 bg-neutral-900 p-6">
            <div className="mb-3 text-sm font-semibold uppercase text-neutral-300">Admin Token Required</div>
            <input
              type="password"
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              placeholder="Enter admin token..."
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2"
              onKeyDown={(event) => {
                if (event.key === "Enter") saveToken();
              }}
            />
            <button onClick={saveToken} className="mt-3 rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-900">
              Save Token
            </button>
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-neutral-700 bg-neutral-900 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-neutral-400">
              {loading
                ? "Loading stories..."
                : `${briefingStories.length} stor${briefingStories.length === 1 ? "y" : "ies"} in the briefing, ${libraryStories.length} available to add`}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {status && <div className="text-sm text-emerald-400">{status}</div>}
              {error && <div className="text-sm text-red-300">{error}</div>}
              <button
                onClick={() => void loadStories(adminToken)}
                disabled={!adminToken || loading || saving}
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                onClick={saveOrder}
                disabled={!adminToken || loading || saving || !hasUnsavedChanges}
                className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : hasUnsavedChanges ? "Save briefing" : "Saved"}
              </button>
            </div>
          </div>

          <section className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-100">Live Briefing Order</h2>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Drag cards to reorder them. Rank 1 becomes the lead story on the public page.
                </p>
              </div>
            </div>

            {briefingStories.length === 0 && !loading ? (
              <div className="mt-4 rounded-2xl border border-dashed border-neutral-700 px-6 py-10 text-center text-sm text-neutral-500">
                No stories in The Briefing yet. Add one from the library below.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {briefingStories.map((story, index) => (
                  <article
                    key={story.id}
                    draggable
                    onDragStart={() => setDraggedId(story.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggedId || draggedId === story.id) return;
                      const fromIndex = briefingStories.findIndex((item) => item.id === draggedId);
                      moveStory(fromIndex, index);
                      setDraggedId(null);
                    }}
                    className={`rounded-2xl border bg-neutral-950/60 p-5 transition ${
                      draggedId === story.id ? "border-neutral-500 opacity-70" : "border-neutral-700"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
                          <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-neutral-300">
                            Rank {index + 1}
                          </span>
                          <span>{formatDate(story.date)}</span>
                          <span className="font-semibold text-neutral-600">{story.id}</span>
                        </div>
                        <div className="text-2xl font-semibold leading-tight text-neutral-100">{displayHeadline(story)}</div>
                        {story.beacon_headline?.trim() && story.beacon_headline.trim() !== story.title ? (
                          <div className="mt-2 text-sm text-neutral-500">Story title: {story.title}</div>
                        ) : null}
                        {story.summary[0] ? <p className="mt-3 text-sm leading-6 text-neutral-400">{story.summary[0]}</p> : null}
                        <div className="mt-4">
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                            Briefing Title Override
                          </label>
                          <input
                            value={story.beacon_headline ?? ""}
                            onChange={(event) => updateBriefingHeadline(story.id, event.target.value)}
                            placeholder="Leave blank to use the story title"
                            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                          />
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:max-w-sm lg:justify-end">
                        <span
                          className="cursor-grab rounded-full border border-neutral-700 px-3 py-2 text-xs uppercase tracking-[0.18em] text-neutral-400 active:cursor-grabbing"
                          title="Drag to reorder"
                        >
                          Drag
                        </span>
                        <button
                          onClick={() => moveStory(index, 0)}
                          disabled={index === 0 || saving}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Top
                        </button>
                        <button
                          onClick={() => moveStory(index, index - 1)}
                          disabled={index === 0 || saving}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Up
                        </button>
                        <button
                          onClick={() => moveStory(index, index + 1)}
                          disabled={index === briefingStories.length - 1 || saving}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Down
                        </button>
                        <button
                          onClick={() => moveStory(index, briefingStories.length - 1)}
                          disabled={index === briefingStories.length - 1 || saving}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Bottom
                        </button>
                        <button
                          onClick={() => removeStoryFromBriefing(story.id)}
                          disabled={saving}
                          className="rounded-full border border-red-400/50 px-3 py-2 text-xs text-red-200 transition hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remove
                        </button>
                        <Link
                          href={`/story/${story.id}?from=briefing`}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                        >
                          Preview
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="mt-10 border-t border-neutral-800 pt-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-100">Story Library</h2>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Add any published story to the briefing without opening Supabase.
                </p>
              </div>
              <div className="w-full md:max-w-sm">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search stories by headline, id, or summary"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                />
              </div>
            </div>

            {filteredLibrary.length === 0 && !loading ? (
              <div className="mt-4 rounded-2xl border border-dashed border-neutral-700 px-6 py-10 text-center text-sm text-neutral-500">
                {libraryStories.length === 0 ? "Every story is already in the briefing." : "No stories match that search."}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                {filteredLibrary.map((story) => (
                  <article key={story.id} className="rounded-2xl border border-neutral-700 bg-neutral-950/40 p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
                      <span>{formatDate(story.date)}</span>
                      <span className="font-semibold text-neutral-600">{story.id}</span>
                    </div>
                    <div className="text-xl font-semibold leading-tight text-neutral-100">{displayHeadline(story)}</div>
                    {story.summary[0] ? <p className="mt-3 text-sm leading-6 text-neutral-400">{story.summary[0]}</p> : null}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => addStoryToBriefing(story.id)}
                        disabled={saving}
                        className="rounded-full bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add to briefing
                      </button>
                      <Link
                        href={`/story/${story.id}`}
                        className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                      >
                        Preview
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
