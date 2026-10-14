"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatStoryDate, formatUpdatedAt } from "@/app/lib/dates";
import type { PublicStoryTimelineEntry } from "@/app/lib/story-revisions";
import type { StoryImageDisplay } from "@/app/lib/types";
import ShareButton from "@/app/share-button";
import StoryImageSummaryLayout from "./story-image-summary-layout";
import StoryReaderActions from "./story-reader-actions";

type StoryHistoryTimelineProps = {
  image: { alt: string; credit?: string | null; creditUrl?: string | null; display: StoryImageDisplay | null | undefined; objectPosition?: string; src: string } | null;
  latestSummary: string[];
  latestUpdatedAt: string | null;
  revisions: PublicStoryTimelineEntry[];
  storyTitle: string;
  authenticated: boolean;
  initialFollowing: boolean;
  storyId: string;
};

function timelineDay(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/New_York",
    year: "numeric",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function endOfTimelineDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, date, 12));
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
    year: "numeric",
  }).formatToParts(probe);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const offsetMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - probe.getTime();
  return new Date(Date.UTC(year, month - 1, date, 23, 59, 59, 999) - offsetMs).toISOString();
}

export default function StoryHistoryTimeline({ image, latestSummary, latestUpdatedAt, revisions, storyTitle, authenticated, initialFollowing, storyId }: StoryHistoryTimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState(latestSummary);
  const [updatedAt, setUpdatedAt] = useState(latestUpdatedAt);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);
  const days = useMemo(() => {
    const byDay = new Map<string, PublicStoryTimelineEntry>();
    for (const revision of revisions) {
      if (!revision.summary.length || revision.action === "deleted") continue;
      const day = timelineDay(revision.createdAt);
      byDay.set(day, revision);
    }
    return [...byDay.entries()].map(([day, revision]) => ({ day, revision })).reverse();
  }, [revisions]);

  useEffect(() => {
    if (!timelineOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTimelineOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [timelineOpen]);

  useEffect(() => {
    if (!timelineOpen || !selectedId) return;
    const frame = window.requestAnimationFrame(() => {
      selectedCardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      selectedCardRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, timelineOpen]);

  function selectLatest() {
    setSelectedId(null);
    setSummary(latestSummary);
    setUpdatedAt(latestUpdatedAt);
    setTimelineOpen(false);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("story-history-as-of", { detail: { before: null, sources: null, sourceAsOf: null } }));
  }

  function selectDay(day: string, revision: PublicStoryTimelineEntry) {
    setSelectedId(day);
    setSummary(revision.summary);
    setUpdatedAt(revision.createdAt);
    setTimelineOpen(false);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("story-history-as-of", {
      detail: { before: endOfTimelineDay(day), sources: revision.sources, sourceAsOf: day },
    }));
  }

  return (
    <>
    <StoryImageSummaryLayout
      image={image}
      summary={summary}
      updatedAtLabel={selectedId ? null : updatedAt ? formatUpdatedAt(updatedAt) : null}
      statusLabel={selectedId ? `Viewing story as of ${formatStoryDate(selectedId)}` : null}
      updatedActions={(
        <>
          <StoryReaderActions
            authenticated={authenticated}
            className="inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
            disableMarkSeen
            initialFollowing={initialFollowing}
            storyId={storyId}
            trackingContext="story_updated_actions"
          />
          <ShareButton title={storyTitle} path={`/story/${storyId}`} trackingContext="story_updated_actions" variant="soft" />
        </>
      )}
      historyAction={days.length >= 2 ? (
        <div className="flex items-center gap-3">
          {selectedId ? (
            <button type="button" onClick={selectLatest} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400 transition hover:text-[#f0dfb1]">
              Back to latest
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setTimelineOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d7c08d] transition hover:text-[#f0dfb1]"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.6]">
              <path d="M4 3v14M4 5h4M4 10h4M4 15h4M12 5h4M12 10h4M12 15h4" strokeLinecap="round" />
              <circle cx="10" cy="5" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="10" cy="15" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            Story timeline
          </button>
        </div>
      ) : null}
    />
    {timelineOpen ? (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setTimelineOpen(false);
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="story-timeline-title"
          className="flex max-h-[min(90vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[#25445d] bg-[#07131e] shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
        >
          <header className="relative shrink-0 overflow-hidden border-b border-[#1a3349] px-6 py-5 sm:px-9 sm:py-6">
            <div className="pointer-events-none absolute -right-10 -top-24 h-56 w-56 rounded-full bg-[#b89a55]/[0.08] blur-3xl" />
            <div className="relative flex items-start justify-between gap-5">
              <div className="min-w-0 flex-1 pr-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7c08d]">The story so far</div>
                <h2 id="story-timeline-title" className="mt-2 break-words text-2xl font-semibold leading-tight text-neutral-50 sm:text-[1.75rem]">{storyTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setTimelineOpen(false)}
                aria-label="Close story timeline"
                className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#29465d] text-neutral-300 transition hover:border-[#8f7740]/70 hover:text-white"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
                  <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-9 sm:py-6">
            <ol className="relative space-y-3 before:absolute before:bottom-5 before:left-[13px] before:top-5 before:w-px before:bg-gradient-to-b before:from-[#b89a55]/70 before:via-[#34536b] before:to-transparent">
              {days.map(({ day, revision }, index) => {
                const isSelected = selectedId === day;
                const firstPoint = revision.summary[0] ?? "Summary updated";
                return (
                  <li key={day} className="relative pl-9">
                    <span className={`absolute left-[7px] top-5 z-10 h-[14px] w-[14px] rounded-full border-[3px] ${isSelected ? "border-[#f0dfb1] bg-[#b89a55] shadow-[0_0_0_5px_rgba(184,154,85,0.12)]" : "border-[#9b8857] bg-[#0b1b28]"}`} />
                    <button
                      type="button"
                      ref={isSelected ? selectedCardRef : undefined}
                      onClick={() => selectDay(day, revision)}
                      aria-pressed={isSelected}
                      className={`group w-full rounded-2xl border p-4 text-left transition sm:p-5 ${isSelected ? "border-[#9b8249]/75 bg-[#161b1c] shadow-[inset_0_0_0_1px_rgba(184,154,85,0.08)]" : "border-[#1e394f] bg-[#091722] hover:border-[#47637a] hover:bg-[#0b1b28]"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base font-semibold text-neutral-100">{formatStoryDate(day)}</span>
                          {index === 0 ? <span className="rounded-full border border-[#8f7740]/45 bg-[#8f7740]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#d7c08d]">Most recent</span> : null}
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-neutral-300">{firstPoint}</p>
                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-neutral-500">
                        <span>{revision.summary.length} summary {revision.summary.length === 1 ? "point" : "points"}</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-[#cbb77e] opacity-80 transition group-hover:translate-x-0.5 group-hover:opacity-100">
                          View this day <span aria-hidden="true">→</span>
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#1a3349] bg-[#06111a] px-6 py-4 sm:px-9">
            <span className="text-xs text-neutral-500">Comments are filtered to each selected date.</span>
            <button type="button" onClick={() => setTimelineOpen(false)} className="shrink-0 rounded-full border border-[#29465d] px-3.5 py-2 text-xs font-semibold text-neutral-300 transition hover:border-[#45617a] hover:text-white">
              Close
            </button>
          </footer>
        </section>
      </div>
    ) : null}
    </>
  );
}
