import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";
import ViewTracker from "./view-tracker";

function leanBadgeClasses(lean: "Left" | "Center" | "Right") {
  switch (lean) {
    case "Left":
      return "border border-blue-500/40 text-blue-300";
    case "Center":
      return "border border-neutral-600 text-neutral-300";
    case "Right":
      return "border border-red-500/40 text-red-300";
    default:
      return "border border-neutral-600 text-neutral-300";
  }
}

async function loadStory(slug: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("stories").select("*").eq("id", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return coerceStory(data as StoryDbRow);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const story = await loadStory(slug);
    if (!story) {
      return {
        title: "Story",
      };
    }

    return {
      title: story.title,
    };
  } catch {
    return {
      title: "Story",
    };
  }
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawFrom = resolvedSearchParams?.from;
  const from = Array.isArray(rawFrom) ? rawFrom[0] : rawFrom;

  const backHref =
    from === "briefing" || from === "beacon" ? "/briefing" : from ? `/?tab=${encodeURIComponent(from)}` : "/";

  let story: StoryWithViews | null = null;

  try {
    story = await loadStory(slug);
  } catch {
    story = null;
  }

  if (!story) {
    return (
      <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
        <div className="max-w-3xl mx-auto">
          <Link href={backHref} className="text-neutral-300 hover:text-white transition">
            {"<- Back"}
          </Link>
          <div className="mt-10 rounded-2xl border border-[#0d2438] bg-[#020b14] p-8">
            <h1 className="text-2xl font-semibold">Story not found</h1>
            <p className="text-neutral-400 mt-2">
              {`This story is not available: ${slug}`}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <ViewTracker slug={slug} />
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <Link href={backHref} className="text-neutral-300 hover:text-white transition">
            {"<- Back"}
          </Link>
          <div className="text-sm text-neutral-400">
            {story.views} {story.views === 1 ? "view" : "views"} | {story.comments} comments
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-[#0d2438] bg-[#020b14] p-8">
          <h1 className="text-3xl font-semibold leading-tight">{story.title}</h1>

          <div className="mt-6">
            <h2 className="text-sm font-medium text-neutral-300 uppercase tracking-wide">Summary</h2>
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
            {story.sources.map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-[#0d2438] bg-[#020b14] p-5 transition hover:border-[#163754] hover:bg-[#03101b]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="text-base font-medium">{src.name}</div>
                    <span className={`text-xs px-2 py-1 rounded-full ${leanBadgeClasses(src.lean)}`}>
                      {src.lean}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-400">Read -&gt;</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-[#0d2438] bg-[#020b14] p-8">
          <h2 className="text-lg font-semibold">Comments</h2>
          <p className="text-neutral-400 mt-2">Coming next.</p>
        </div>
      </div>
    </main>
  );
}
