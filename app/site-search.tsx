"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatStoryDate } from "@/app/lib/dates";
import type { StoryWithViews } from "@/app/lib/types";

type SearchResponse = {
  error?: string;
  hasMore?: boolean;
  stories?: StoryWithViews[];
};

const SEARCH_BATCH_SIZE = 12;

function SearchIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M10.75 18.5a7.75 7.75 0 1 1 0-15.5 7.75 7.75 0 0 1 0 15.5ZM16.25 16.25 21 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stories, setStories] = useState<StoryWithViews[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!open || !normalizedQuery) {
      setStories([]);
      setHasMore(false);
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        limit: String(SEARCH_BATCH_SIZE),
        offset: "0",
        search: normalizedQuery,
        tab: "recent",
      });
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/stories/feed?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as SearchResponse;
        if (!response.ok || !Array.isArray(data.stories)) throw new Error(data.error ?? "We couldn't search stories.");
        setStories(data.stories);
        setHasMore(Boolean(data.hasMore));
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setStories([]);
        setHasMore(false);
        setError(fetchError instanceof Error ? fetchError.message : "We couldn't search stories.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  async function loadMore() {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || loading || !hasMore) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: String(SEARCH_BATCH_SIZE),
      offset: String(stories.length),
      search: normalizedQuery,
      tab: "recent",
    });
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/stories/feed?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as SearchResponse;
      if (!response.ok || !Array.isArray(data.stories)) throw new Error(data.error ?? "We couldn't search stories.");
      setStories((current) => {
        const seen = new Set(current.map((story) => story.id));
        return [...current, ...data.stories!.filter((story) => !seen.has(story.id))];
      });
      setHasMore(Boolean(data.hasMore));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "We couldn't search stories.");
    } finally {
      setLoading(false);
    }
  }

  const normalizedQuery = query.trim();

  return (
    <>
      <button
        type="button"
        aria-label="Search stories"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-neutral-300 transition hover:border-[#163754] hover:bg-[#03101b] hover:text-white"
      >
        <SearchIcon className="h-4 w-4" />
      </button>
      {open ? (
        <div
          aria-labelledby="site-search-title"
          aria-modal="true"
          className="fixed inset-0 z-[60] overflow-hidden bg-black/70 px-4 py-6 text-neutral-100 backdrop-blur-sm sm:py-10"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="mx-auto flex h-full max-w-3xl flex-col rounded-2xl border border-[#163754]/90 bg-[#06131e] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:h-auto sm:max-h-[calc(100vh-5rem)] sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 id="site-search-title" className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-400">Search</h2>
              <button
                type="button"
                aria-label="Close search"
                onClick={() => setOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-full border border-[#163754]/80 bg-[#020b14] text-neutral-300 transition hover:border-[#8f7740]/70 hover:text-white"
              >
                <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <label className="sr-only" htmlFor="site-story-search">Search stories</label>
            <div className="flex items-center gap-3 rounded-2xl border border-[#214765] bg-[#020b14] px-4 py-3 focus-within:border-[#8f7740]/80">
              <SearchIcon className="size-5 shrink-0 text-neutral-500" />
              <input
                ref={inputRef}
                id="site-story-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search stories, sources, topics, or people"
                className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-neutral-100 outline-none placeholder:text-neutral-500 sm:text-2xl"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-[#163754]/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400 transition hover:border-[#8f7740]/70 hover:text-white"
                >Clear</button>
              ) : null}
            </div>
            {normalizedQuery ? (
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 overscroll-contain">
                <div className="mb-2 flex items-center justify-between gap-4 text-xs uppercase tracking-[0.14em] text-neutral-500">
                  <span>{loading ? "Searching" : "Results"}</span>
                  <span>{stories.length ? `${stories.length} shown` : error ? "Error" : "No matches"}</span>
                </div>
                {stories.length ? (
                  <>
                    <div className="space-y-2">
                      {stories.map((story) => {
                        const sources = (story.sources ?? []).slice(0, 2).map((source) => source.name).filter(Boolean).join(" / ");
                        return (
                          <Link
                            key={story.id}
                            href={`/story/${story.id}?from=home`}
                            onClick={() => setOpen(false)}
                            className="block rounded-xl border border-[#163754]/70 bg-[#020b14] px-4 py-3 transition hover:border-[#8f7740]/70 hover:bg-[#07101a]"
                          >
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                              <span>{formatStoryDate(story.date)}</span>
                              {sources ? <><span className="text-[#35556f]">/</span><span>{sources}</span></> : null}
                            </div>
                            <div className="mt-1.5 text-base font-semibold leading-snug text-neutral-100">{story.title}</div>
                            {story.summary[0] ? <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-neutral-400">{story.summary[0]}</p> : null}
                          </Link>
                        );
                      })}
                    </div>
                    {hasMore ? (
                      <div className="sticky bottom-0 mt-4 border-t border-[#163754]/70 bg-[#06131e]/95 py-3 backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => void loadMore()}
                          disabled={loading}
                          className="min-h-11 w-full rounded-xl border border-[#8f7740]/60 bg-[#07101a] px-5 py-2.5 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
                        >{loading ? "Loading..." : "Read more"}</button>
                      </div>
                    ) : null}
                    {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}
                  </>
                ) : (
                  <div className="rounded-xl border border-[#163754]/70 bg-[#020b14] px-4 py-6 text-center">
                    <div className="text-sm font-semibold text-neutral-200">{error ? "Search is unavailable" : loading ? "Searching stories..." : "No matches yet"}</div>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-neutral-500">
                      {error || "Try a person, organization, topic, source, or an older story keyword. Archived stories are included in search."}
                    </p>
                    {!error && !loading ? <button type="button" onClick={() => setQuery("")} className="mt-4 rounded-full border border-[#28445d] px-4 py-2 text-xs font-semibold text-neutral-300 transition hover:border-[#8f7740]/70 hover:text-white">Clear search</button> : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
