"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Story } from "../../lib/types";


const ADMIN_TOKEN_KEY = "signal:adminToken:v1";

function leanBadgeClasses(lean: "Left" | "Center" | "Right") {
  if (lean === "Left") return "border border-blue-500/60 text-blue-200";
  if (lean === "Right") return "border border-red-500/60 text-red-200";
  return "border border-neutral-600 text-neutral-300";
}

export default function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const from = searchParams.get("from");

  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [knownIds, setKnownIds] = useState<string[]>([]);

  // Show Edit only when you're in admin mode AND have a token saved on this device
  const [canEdit] = useState(() => {
    try {
      const hasToken = Boolean(localStorage.getItem(ADMIN_TOKEN_KEY));
      return process.env.NEXT_PUBLIC_ADMIN_MODE === "1" && hasToken;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setStory(null);

      // 1) Try to fetch just this story
      const res = await fetch(`/api/stories/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });

      if (!cancelled && res.ok) {
        const data = (await res.json()) as Story;
        setStory(data);
        setLoading(false);
        return;
      }

      // 2) If not found, fetch all to show "known ids" for debugging
      try {
        const allRes = await fetch("/api/stories", { cache: "no-store" });
        const all = (await allRes.json()) as unknown;
        if (!cancelled && Array.isArray(all)) {
          setKnownIds(
            all
              .map((item) => (typeof item === "object" && item !== null ? (item as { id?: string }).id : undefined))
              .filter((id): id is string => Boolean(id))
          );
        }
      } catch {
        // ignore
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!story) return;

    // increment views on page open (fire-and-forget)
    fetch(`/api/stories/${encodeURIComponent(story.id)}/view`, {
      method: "POST",
    }).catch(() => {});
  }, [story]);

  const backHref = from ? `/?tab=${encodeURIComponent(from)}` : "/";

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-900 text-neutral-100 px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <Link href={backHref} className="text-neutral-300 hover:text-white transition">
            ← Back
          </Link>

          <div className="mt-10 bg-neutral-950/30 border border-neutral-700 rounded-2xl p-8">
            <div className="text-neutral-300">Loading story…</div>
          </div>
        </div>
      </main>
    );
  }

  if (!story) {
    return (
      <main className="min-h-screen bg-neutral-900 text-neutral-100 px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <Link href={backHref} className="text-neutral-300 hover:text-white transition">
            ← Back
          </Link>

          <div className="mt-10 bg-neutral-950/30 border border-neutral-700 rounded-2xl p-8">
            <h1 className="text-2xl font-semibold">Story not found</h1>
            <p className="text-neutral-400 mt-2">
              This story isn’t in the current dataset.
            </p>

            <div className="mt-6 text-xs text-neutral-500">
              <div className="mb-2">Requested slug: {slug}</div>
              {knownIds.length > 0 && (
                <>
                  <div className="mb-2">Known ids:</div>
                  <div className="break-words">{knownIds.join(", ")}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link href={backHref} className="text-neutral-300 hover:text-white transition">
            ← Back
          </Link>

          <div className="flex items-center gap-4">
            {canEdit && (
              <Link
                href={`/admin/editor?id=${encodeURIComponent(story.id)}`}
                className="text-sm text-neutral-300 hover:text-white transition"
              >
                Edit
              </Link>
            )}

            <div className="text-sm text-neutral-400">
              {story.views} views • {story.comments} comments
            </div>
          </div>
        </div>

        {/* Story header */}
        <div className="mt-8 bg-neutral-950/40 border border-neutral-700 rounded-2xl p-8">
          <h1 className="text-3xl font-semibold leading-tight">{story.title}</h1>

          <div className="mt-6">
            <h2 className="text-sm font-medium text-neutral-300 uppercase tracking-wide">
              Summary
            </h2>
            <div className="mt-3 space-y-2 text-neutral-300">
              {story.summary.map((point, i) => (
                <p key={i} className="leading-relaxed">
                  {point}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Sources */}
        <div className="mt-8">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-semibold">Coverage</h2>
            <p className="text-sm text-neutral-400">
              Multiple sources, one story block.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {story.sources.map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="block bg-neutral-950/30 border border-neutral-700 rounded-2xl p-5 hover:border-neutral-500 hover:bg-neutral-950/40 transition"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="text-base font-medium">{src.name}</div>
                    <span className={`text-xs px-2 py-1 rounded-full ${leanBadgeClasses(src.lean)}`}>
                      {src.lean}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-400">Read →</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Comments placeholder */}
        <div className="mt-10 bg-neutral-950/25 border border-neutral-700 rounded-2xl p-8">
          <h2 className="text-lg font-semibold">Comments</h2>
          <p className="text-neutral-400 mt-2">
            Coming next: threaded comments ranked by “Insightful,” “Newest,” and
            “Most Discussed.”
          </p>
        </div>
      </div>
    </main>
  );
}
