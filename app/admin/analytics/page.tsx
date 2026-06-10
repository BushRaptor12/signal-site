import Link from "next/link";
import { redirect } from "next/navigation";
import BackLink from "@/app/back-link";
import { getAccountProfile } from "@/app/lib/account.server";
import { getAdminAnalyticsData, type AdminAnalyticsWindow } from "@/app/lib/admin-analytics";
import { formatUpdatedAt } from "@/app/lib/dates";
import { ADMIN_INSET, ADMIN_INSET_INTERACTIVE, ADMIN_PANEL } from "@/app/lib/surfaces";

type AnalyticsPageProps = {
  searchParams?: Promise<{ window?: string | string[] }>;
};

const WINDOW_OPTIONS: AdminAnalyticsWindow[] = [7, 30, 90];

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function percent(value: number, max: number) {
  if (max <= 0) return "0%";
  return `${Math.max(4, Math.round((value / max) * 100))}%`;
}

function formatRate(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)}%`;
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function StatCard({ label, note, value }: { label: string; note?: string; value: number }) {
  return (
    <div className={`${ADMIN_INSET} p-5`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-neutral-100">{compactNumber(value)}</div>
      {note ? <div className="mt-2 text-xs leading-5 text-neutral-500">{note}</div> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className={`${ADMIN_INSET} p-5 text-sm text-neutral-500`}>{text}</div>;
}

export default async function AdminAnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const profile = await getAccountProfile();
  if (!profile?.isAdmin) {
    redirect("/account");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawWindow = resolvedSearchParams?.window;
  const windowDays = Array.isArray(rawWindow) ? rawWindow[0] : rawWindow;
  const data = await getAdminAnalyticsData({ windowDays });
  const maxDailyViews = Math.max(1, ...data.dailyActivity.map((day) => day.views));
  const maxTopicScore = Math.max(1, ...data.topicPerformance.map((topic) => topic.views + topic.comments * 3 + topic.reactions * 2));
  const maxStoryScore = Math.max(1, ...data.topStories.map((story) => story.views + story.comments * 3 + story.reactions * 2));
  const maxPerformanceScore = Math.max(1, ...data.storyPerformance.map((story) => story.score));
  const maxInterestReaders = Math.max(1, ...data.interestDemand.map((interest) => interest.readers));
  const maxReactionCount = Math.max(1, ...data.reactionMix.map((reaction) => reaction.count));
  const mostViewedStory = [...data.storyPerformance].sort((left, right) => right.views - left.views)[0] ?? null;
  const mostDiscussedStory = [...data.storyPerformance].sort((left, right) => right.comments - left.comments)[0] ?? null;
  const strongestEngagementStory =
    [...data.storyPerformance]
      .filter((story) => story.views >= 3 || story.comments + story.reactions > 0)
      .sort((left, right) => right.engagementRate - left.engagementRate || right.score - left.score)[0] ?? null;

  return (
    <main className="min-h-screen bg-neutral-900 px-4 py-7 text-neutral-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-3xl font-bold">Analytics</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
              Internal reader, story, and editorial signals from the data The Beacon already records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/admin" />
            {WINDOW_OPTIONS.map((option) => (
              <Link
                key={option}
                href={`/admin/analytics?window=${option}`}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  data.windowDays === option
                    ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                    : "border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                }`}
              >
                {option}d
              </Link>
            ))}
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Views" note={`Unique story views in ${data.windowDays} days`} value={data.summary.views} />
          <StatCard label="Comments" note="Non-deleted comments" value={data.summary.comments} />
          <StatCard label="Reactions" note="Story feedback clicks" value={data.summary.reactions} />
          <StatCard label="Seen Marks" note="Signed-in reader completions" value={data.summary.seen} />
          <StatCard label="New Follows" note="Interest follows started" value={data.summary.follows} />
          <StatCard label="All-Time Views" note="Current story counter total" value={data.summary.totalStoryViews} />
          <StatCard label="Published Stories" value={data.summary.publishedStories} />
        </section>

        <section className={`${ADMIN_PANEL} mt-8 p-6 sm:p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Story Signals</div>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-100">What Is Moving Right Now</h2>
            </div>
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">{data.windowDays} day window</div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className={`${ADMIN_INSET} p-4`}>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Most viewed</div>
              {mostViewedStory ? (
                <>
                  <Link href={`/story/${mostViewedStory.id}`} className="mt-2 block text-sm font-medium leading-6 text-neutral-100 transition hover:text-[#d7c08d]">
                    {mostViewedStory.title}
                  </Link>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-neutral-500">{compactNumber(mostViewedStory.views)} views</div>
                </>
              ) : (
                <div className="mt-2 text-sm text-neutral-500">No story views yet.</div>
              )}
            </div>

            <div className={`${ADMIN_INSET} p-4`}>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Most discussed</div>
              {mostDiscussedStory && mostDiscussedStory.comments > 0 ? (
                <>
                  <Link href={`/story/${mostDiscussedStory.id}`} className="mt-2 block text-sm font-medium leading-6 text-neutral-100 transition hover:text-[#d7c08d]">
                    {mostDiscussedStory.title}
                  </Link>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-neutral-500">{mostDiscussedStory.comments} comments</div>
                </>
              ) : (
                <div className="mt-2 text-sm text-neutral-500">No comments in this window.</div>
              )}
            </div>

            <div className={`${ADMIN_INSET} p-4`}>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Highest engagement</div>
              {strongestEngagementStory ? (
                <>
                  <Link href={`/story/${strongestEngagementStory.id}`} className="mt-2 block text-sm font-medium leading-6 text-neutral-100 transition hover:text-[#d7c08d]">
                    {strongestEngagementStory.title}
                  </Link>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
                    {formatRate(strongestEngagementStory.engagementRate)} comments/reactions per view
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-neutral-500">No engagement signal yet.</div>
              )}
            </div>
          </div>
        </section>

        <section className={`${ADMIN_PANEL} mt-8 p-6 sm:p-8`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Activity</div>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Daily Reader Signals</h2>
            </div>
            <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.14em] text-neutral-500">
              <span>Views</span>
              <span>Comments</span>
              <span>Reactions</span>
              <span>Follows</span>
            </div>
          </div>

          <div className="mt-6 grid min-h-72 grid-cols-7 items-end gap-2 sm:grid-cols-[repeat(14,minmax(0,1fr))] lg:grid-cols-[repeat(30,minmax(0,1fr))]">
            {data.dailyActivity.map((day) => (
              <div key={day.date} className="flex min-h-64 flex-col justify-end gap-2">
                <div className="flex flex-1 flex-col justify-end gap-1">
                  <div
                    className="rounded-t bg-[#d7c08d]"
                    style={{ height: percent(day.views, maxDailyViews) }}
                    title={`${day.views} views`}
                  />
                  {day.comments > 0 ? (
                    <div className="h-1.5 rounded-full bg-sky-300/80" title={`${day.comments} comments`} />
                  ) : null}
                  {day.reactions > 0 ? (
                    <div className="h-1.5 rounded-full bg-emerald-300/80" title={`${day.reactions} reactions`} />
                  ) : null}
                  {day.follows > 0 ? (
                    <div className="h-1.5 rounded-full bg-violet-300/80" title={`${day.follows} follows`} />
                  ) : null}
                </div>
                <div className="hidden truncate text-center text-[10px] text-neutral-600 sm:block">{shortDate(day.date)}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <section className={`${ADMIN_PANEL} p-6 sm:p-8`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Stories</div>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Top Stories</h2>
              </div>
              <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">{data.windowDays} days</div>
            </div>

            <div className="mt-6 space-y-3">
              {data.topStories.map((story, index) => {
                const score = story.views + story.comments * 3 + story.reactions * 2;
                return (
                  <Link
                    key={story.id}
                    href={`/story/${story.id}`}
                    className={`block ${ADMIN_INSET_INTERACTIVE} p-4 hover:border-[#8f7740]/60`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">#{index + 1} · {story.status}</div>
                        <div className="mt-2 text-sm font-medium leading-6 text-neutral-100">{story.title}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {story.topics.slice(0, 3).map((topic) => (
                            <span key={topic} className="rounded-full border border-[#163754] px-2 py-0.5 text-[11px] text-neutral-400">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-xs uppercase tracking-[0.14em] text-neutral-500">
                        <div>{compactNumber(story.views)} views</div>
                        <div className="mt-1">{story.comments} comments</div>
                        <div className="mt-1">{story.reactions} reactions</div>
                      </div>
                    </div>
                    <div className="mt-4 h-1.5 rounded-full bg-neutral-800">
                      <div className="h-1.5 rounded-full bg-[#d7c08d]" style={{ width: percent(score, maxStoryScore) }} />
                    </div>
                  </Link>
                );
              })}
              {data.topStories.length === 0 ? <EmptyState text="No story activity found for this window yet." /> : null}
            </div>
          </section>

          <section className={`${ADMIN_PANEL} p-6 sm:p-8`}>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Reader Demand</div>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Followed Interests</h2>

            <div className="mt-6 space-y-3">
              {data.interestDemand.map((interest) => (
                <div key={interest.query} className={`${ADMIN_INSET} p-4`}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-neutral-100">{interest.query}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        Updated {interest.updatedAt ? formatUpdatedAt(interest.updatedAt) : "recently"}
                      </div>
                    </div>
                    <div className="text-2xl font-semibold text-neutral-100">{interest.readers}</div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-neutral-800">
                    <div className="h-1.5 rounded-full bg-violet-300/80" style={{ width: percent(interest.readers, maxInterestReaders) }} />
                  </div>
                </div>
              ))}
              {data.interestDemand.length === 0 ? <EmptyState text="No followed interests yet." /> : null}
            </div>
          </section>
        </div>

        <section className={`${ADMIN_PANEL} mt-8 p-6 sm:p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Per Story</div>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Story Analytics</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Windowed views, comments, reactions, and seen marks by story, alongside current all-time counters.
              </p>
            </div>
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">{data.storyPerformance.length} active stories</div>
          </div>

          {data.storyPerformance.length > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                  <tr>
                    <th className="border-b border-neutral-800 pb-3 pr-4 font-semibold">Story</th>
                    <th className="border-b border-neutral-800 px-3 pb-3 text-right font-semibold">Views</th>
                    <th className="border-b border-neutral-800 px-3 pb-3 text-right font-semibold">Comments</th>
                    <th className="border-b border-neutral-800 px-3 pb-3 text-right font-semibold">Reactions</th>
                    <th className="border-b border-neutral-800 px-3 pb-3 text-right font-semibold">Seen</th>
                    <th className="border-b border-neutral-800 px-3 pb-3 text-right font-semibold">Eng.</th>
                    <th className="border-b border-neutral-800 px-3 pb-3 text-right font-semibold">All-Time</th>
                    <th className="border-b border-neutral-800 pl-3 pb-3 font-semibold">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {data.storyPerformance.map((story) => (
                    <tr key={story.id} className="group">
                      <td className="border-b border-neutral-800/70 py-4 pr-4 align-top">
                        <Link href={`/story/${story.id}`} className="font-medium leading-6 text-neutral-100 transition group-hover:text-[#d7c08d]">
                          {story.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                          <span>{story.status}</span>
                          <span>/</span>
                          <span>{shortDate(story.publishedAt)}</span>
                          {story.topics.slice(0, 2).map((topic) => (
                            <span key={`${story.id}-${topic}`} className="rounded-full border border-[#163754] px-2 py-0.5 normal-case tracking-normal text-neutral-400">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="border-b border-neutral-800/70 px-3 py-4 text-right align-top text-neutral-200">{compactNumber(story.views)}</td>
                      <td className="border-b border-neutral-800/70 px-3 py-4 text-right align-top text-neutral-300">{story.comments}</td>
                      <td className="border-b border-neutral-800/70 px-3 py-4 text-right align-top text-neutral-300">{story.reactions}</td>
                      <td className="border-b border-neutral-800/70 px-3 py-4 text-right align-top text-neutral-300">
                        <div>{story.seen}</div>
                        <div className="mt-1 text-xs text-neutral-600">{formatRate(story.completionRate)}</div>
                      </td>
                      <td className="border-b border-neutral-800/70 px-3 py-4 text-right align-top text-neutral-300">{formatRate(story.engagementRate)}</td>
                      <td className="border-b border-neutral-800/70 px-3 py-4 text-right align-top text-neutral-400">
                        <div>{compactNumber(story.allTimeViews)} views</div>
                        <div className="mt-1 text-xs text-neutral-600">{story.totalComments} comments</div>
                      </td>
                      <td className="border-b border-neutral-800/70 py-4 pl-3 align-top">
                        <div className="h-2 rounded-full bg-neutral-800">
                          <div className="h-2 rounded-full bg-[#d7c08d]" style={{ width: percent(story.score, maxPerformanceScore) }} />
                        </div>
                        <div className="mt-2 text-xs uppercase tracking-[0.14em] text-neutral-600">Score {compactNumber(story.score)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="No per-story activity found for this window yet." />
          )}
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          <section className={`${ADMIN_PANEL} p-6 sm:p-8`}>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Coverage</div>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Topic Performance</h2>

            <div className="mt-6 space-y-3">
              {data.topicPerformance.map((topic) => {
                const score = topic.views + topic.comments * 3 + topic.reactions * 2;
                return (
                  <div key={topic.topic} className={`${ADMIN_INSET} p-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-neutral-100">{topic.topic}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                          {topic.stories} stories · {compactNumber(topic.views)} views · {topic.comments} comments · {topic.reactions} reactions
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-neutral-800">
                      <div className="h-1.5 rounded-full bg-sky-300/80" style={{ width: percent(score, maxTopicScore) }} />
                    </div>
                  </div>
                );
              })}
              {data.topicPerformance.length === 0 ? <EmptyState text="No topic activity found for this window." /> : null}
            </div>
          </section>

          <section className={`${ADMIN_PANEL} p-6 sm:p-8`}>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Feedback</div>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Reaction Mix</h2>

            <div className="mt-6 space-y-3">
              {data.reactionMix.map((reaction) => (
                <div key={reaction.label} className={`${ADMIN_INSET} p-4`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-medium text-neutral-100">{reaction.label}</div>
                    <div className="text-sm text-neutral-400">{reaction.count}</div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-neutral-800">
                    <div className="h-1.5 rounded-full bg-emerald-300/80" style={{ width: percent(reaction.count, maxReactionCount) }} />
                  </div>
                </div>
              ))}
              {data.reactionMix.length === 0 ? <EmptyState text="No reactions in this window yet." /> : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
