import Link from "next/link";
import type { Story } from "../../lib/types";

function leanBadgeClasses(_lean: "Left" | "Center" | "Right") {
  return "border border-neutral-600 text-neutral-300";
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const slug = (await params).slug;
  const from = (await searchParams)?.from;

  const backHref = from ? `/?tab=${encodeURIComponent(from)}` : "/";

  // Fetch story from your public API (JSON/db-backed)
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/stories/${encodeURIComponent(slug)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
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
              Requested slug: {slug}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const story = (await res.json()) as Story;

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link href={backHref} className="text-neutral-300 hover:text-white transition">
            ← Back
          </Link>

          <div className="text-sm text-neutral-400">
            {story.views} views • {story.comments} comments
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
            <p className="text-sm text-neutral-400">Multiple sources, one story block.</p>
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
            Coming next: threaded comments ranked by “Insightful,” “Newest,” and “Most Discussed.”
          </p>
        </div>
      </div>
    </main>
  );
}
