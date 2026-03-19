import Link from "next/link";
import { supabaseServer } from "@/app/lib/supabase.server";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import type { StoryWithViews } from "@/app/lib/types";

function displayHeadline(story: StoryWithViews) {
  return story.beacon_headline?.trim() || story.title;
}

function splitColumns(stories: StoryWithViews[]) {
  return stories.reduce<[StoryWithViews[], StoryWithViews[]]>(
    (columns, story, index) => {
      columns[index % 2].push(story);
      return columns;
    },
    [[], []]
  );
}

function BeaconList({ stories }: { stories: StoryWithViews[] }) {
  return (
    <div className="space-y-6">
      {stories.map((story) => (
        <article key={story.id} className="border-b border-[#c8b897] pb-5 last:border-b-0 last:pb-0">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c6745]">
            Rank {story.beacon_rank ?? "-"} | {story.date}
          </div>
          <Link
            href={`/story/${story.id}?from=beacon`}
            className="block text-2xl font-black uppercase leading-[1.02] tracking-tight text-[#19130b] transition hover:text-[#9c140f]"
          >
            {displayHeadline(story)}
          </Link>
          {story.summary[0] && <p className="mt-2 text-sm leading-6 text-[#4d4030]">{story.summary[0]}</p>}
        </article>
      ))}
    </div>
  );
}

export default async function BeaconPage() {
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .eq("beacon_include", true)
      .order("beacon_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const stories = ((data ?? []) as StoryDbRow[]).map(coerceStory);
    const [lead, ...rest] = stories;
    const [leftColumn, rightColumn] = splitColumns(rest);

    return (
      <main className="min-h-screen bg-[#efe2c4] px-5 py-8 text-[#19130b] [font-family:Georgia,'Times_New_Roman',serif] md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="border-y-4 border-[#19130b] py-4 text-center">
            <div className="text-[13px] font-bold uppercase tracking-[0.45em] text-[#7c6745]">Signal Site</div>
            <h1 className="mt-2 text-5xl font-black uppercase tracking-[0.08em] md:text-7xl">The Beacon</h1>
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.22em] text-[#7c6745]">
              Hand-picked headlines that matter most
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 text-sm font-bold uppercase tracking-[0.18em] text-[#7c6745]">
            <Link href="/" className="transition hover:text-[#19130b]">
              Back to Signal
            </Link>
            <span>{stories.length} stories</span>
          </div>

          {!lead ? (
            <div className="mt-12 border border-[#c8b897] bg-[#f5ead1] px-6 py-10 text-center">
              <h2 className="text-3xl font-black uppercase">Nothing queued yet</h2>
              <p className="mt-3 text-base text-[#4d4030]">
                Mark stories in the editor with `Show this story on The Beacon` to publish them here.
              </p>
            </div>
          ) : (
            <>
              <section className="mt-8 border-b-2 border-[#19130b] pb-8">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7c6745]">
                  Lead Story | Rank {lead.beacon_rank ?? "-"} | {lead.date}
                </div>
                <Link
                  href={`/story/${lead.id}?from=beacon`}
                  className="block text-5xl font-black uppercase leading-[0.95] tracking-tight text-[#9c140f] transition hover:text-[#b71812] md:text-7xl"
                >
                  {displayHeadline(lead)}
                </Link>

                {lead.summary.length > 0 && (
                  <div className="mt-5 max-w-4xl space-y-2 text-lg leading-8 text-[#31271b]">
                    {lead.summary.slice(0, 2).map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                  </div>
                )}

                <div className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-[#7c6745]">
                  <Link href={`/story/${lead.id}?from=beacon`} className="transition hover:text-[#19130b]">
                    Open story block
                  </Link>
                </div>
              </section>

              {rest.length > 0 && (
                <section className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
                  <BeaconList stories={leftColumn} />
                  <BeaconList stories={rightColumn} />
                </section>
              )}
            </>
          )}
        </div>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return (
      <main className="min-h-screen bg-[#efe2c4] px-5 py-8 text-[#19130b] [font-family:Georgia,'Times_New_Roman',serif] md:px-8">
        <div className="mx-auto max-w-4xl border border-[#c8b897] bg-[#f5ead1] p-8">
          <div className="text-sm font-bold uppercase tracking-[0.2em] text-[#7c6745]">The Beacon</div>
          <h1 className="mt-3 text-3xl font-black uppercase">Could not load stories</h1>
          <p className="mt-3 text-[#4d4030]">{message}</p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-bold uppercase tracking-[0.18em] text-[#7c6745] hover:text-[#19130b]"
          >
            Back to Signal
          </Link>
        </div>
      </main>
    );
  }
}
