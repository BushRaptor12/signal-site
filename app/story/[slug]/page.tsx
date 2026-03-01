"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { stories as baseStories } from "../../lib/stories";
import { getLocalStories } from "../../lib/storyStore";

type Story = (typeof baseStories)[number];

function normalize(s: string) {
  return String(s).trim().toLowerCase();
}

function leanBadgeClasses(_lean: "Left" | "Center" | "Right") {
  return "border border-neutral-600 text-neutral-300";
}

export default function StoryPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const slug = params?.slug ?? "";

  const backHref = from ? `/?tab=${encodeURIComponent(from)}` : "/";

  const [story, setStory] = useState<Story | null>(null);
  const [knownIds, setKnownIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) Try API first (works for shared/published stories)
      try {
        const res = await fetch(`/api/stories/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });

        if (res.ok) {
          const data = (await res.json()) as Story;
          if (!cancelled) setStory(data);
          if (!cancelled) setLoading(false);
          return;
        }
      } catch {
        // ignore and fall back
      }

      // 2) Fallback: local stories (editor-created on this device)
      const local = getLocalStories();
      const all = [...local, ...baseStories];
      const ids = all.map((s) => s.id);

      const found =
        all.find((s) => normalize(s.id) === normalize(slug)) ?? null;

      if (!cancelled) {
        setKnownIds(ids);
        setStory(found);
        setLoading(false);
      }
    }

    if (slug) load();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-900 text-neutral-100 px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <Link href={backHref} className="text-neutral-300 hover:text-white transition">
            ← Back
          </Link>
          <div className="mt-10 bg-neutral-950/30 border border-neutral-700 rounded-2xl p-8">
            <p className="text-neutral-400">Loading…</p>
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
              This story isn’t available on this device yet.
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
        <div className="flex items-center justify-between">
          <Link href={backHref} className="text-neutral-300 hover:text-white transition">
            ← Back
          </Link>
          <div className="text-sm text-neutral-400">
            {story.views} views • {story.comments} comments
          </div>
        </div>

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

        <div className="mt-8">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-semibold">Coverage</h2>
            <p className="text-sm text-neutral-400">Multiple sources, one story block.</p>
          </div>

          <div className="mt-4 space-y-3">
            {story.sources.map((src: any, i: number) => (
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
      </div>
    </main>
  );
}