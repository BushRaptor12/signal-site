"use client";

import { useEffect, useState, useTransition } from "react";
import {
  emptyReactionCounts,
  STORY_REACTIONS,
  type StoryReactionKey,
  type StoryReactionSummary,
} from "@/app/lib/reactions";

function initialSummary(): StoryReactionSummary {
  return {
    counts: emptyReactionCounts(),
    selectedReaction: null,
  };
}

export default function ReactionBar({ slug }: { slug: string }) {
  const [summary, setSummary] = useState<StoryReactionSummary>(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/reactions/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const data = (await res.json()) as Partial<StoryReactionSummary> & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not load reactions.");
        if (cancelled) return;
        setSummary({
          counts: { ...emptyReactionCounts(), ...(data.counts ?? {}) },
          selectedReaction: data.selectedReaction ?? null,
        });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load reactions.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  function onReact(reaction: StoryReactionKey) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/reactions/${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reaction }),
        });
        const data = (await res.json()) as Partial<StoryReactionSummary> & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not save reaction.");
        setSummary({
          counts: { ...emptyReactionCounts(), ...(data.counts ?? {}) },
          selectedReaction: data.selectedReaction ?? null,
        });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save reaction.");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {STORY_REACTIONS.map((reaction) => {
          const selected = summary.selectedReaction === reaction.key;
          const count = summary.counts[reaction.key] ?? 0;

          return (
            <button
              key={reaction.key}
              type="button"
              onClick={() => onReact(reaction.key)}
              disabled={isPending}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition ${
                selected
                  ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                  : "border-[#0d2438] bg-[#020b14] text-neutral-200 hover:border-[#163754] hover:bg-[#03101b]"
              } disabled:cursor-wait disabled:opacity-70`}
              aria-pressed={selected}
            >
              <span className="text-sm leading-none" aria-hidden="true">
                {reaction.emoji}
              </span>
              <span>{reaction.label}</span>
              <span
                className={`min-w-4 rounded-full px-1 py-0.5 text-center text-[10px] ${
                  selected ? "bg-neutral-900/10 text-neutral-900" : "bg-neutral-900 text-neutral-300"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        Tap to react, tap again to remove.
      </p>

      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
