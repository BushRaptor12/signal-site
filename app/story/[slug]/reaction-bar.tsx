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
      <div className="grid grid-cols-6 gap-2">
        {STORY_REACTIONS.map((reaction) => {
          const selected = summary.selectedReaction === reaction.key;
          const count = summary.counts[reaction.key] ?? 0;

          return (
            <div key={reaction.key} className="min-w-0 text-center">
              <button
                type="button"
                onClick={() => onReact(reaction.key)}
                disabled={isPending}
                className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border text-lg leading-none transition ${
                  selected
                    ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                    : "border-[#0d2438] bg-[#020b14] text-neutral-200 hover:border-[#163754] hover:bg-[#03101b]"
                } disabled:cursor-wait disabled:opacity-70`}
                aria-pressed={selected}
                aria-label={reaction.label}
                title={reaction.label}
              >
                <span aria-hidden="true">{reaction.emoji}</span>
              </button>

              <div className="mt-1 text-[10px] leading-tight text-neutral-400">
                {reaction.label}
              </div>

              <div className="mt-1 text-[10px] leading-none text-neutral-500">
                {count}
              </div>
            </div>
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
