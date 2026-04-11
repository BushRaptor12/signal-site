import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatStoryDate, formatUpdatedAt } from "@/app/lib/dates";
import { getAccountDashboard, getAccountUserId } from "@/app/lib/account.server";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/app/lib/seo";

export const metadata: Metadata = {
  title: "Account",
  description: "Your Beacon account.",
  alternates: {
    canonical: "/account",
  },
  openGraph: {
    type: "website",
    url: "/account",
    title: `Account | ${SITE_NAME}`,
    description: "Your Beacon account.",
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: "The Beacon",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Account | ${SITE_NAME}`,
    description: "Your Beacon account.",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function AccountPage() {
  const userId = await getAccountUserId();
  if (!userId) {
    redirect("/account/login");
  }

  let account = null;
  let message: string | null = null;

  try {
    account = await getAccountDashboard(userId);
  } catch (error) {
    message = error instanceof Error ? error.message : "We could not load this account.";
  }

  if (!account) {
    return (
      <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
        <div className="mx-auto max-w-4xl">
          <Link href="/" className="text-neutral-300 transition hover:text-white">
            {"<- Back"}
          </Link>

          <div className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Account</div>
            <h1 className="mt-3 text-4xl font-semibold text-neutral-100">We could not load your account</h1>
            <p className="mt-6 text-base leading-7 text-neutral-300">{message ?? "Please try again in a moment."}</p>
            <Link
              href="/account/settings"
              className="mt-8 inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]"
            >
              Open settings
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-neutral-300 transition hover:text-white">
          {"<- Back"}
        </Link>

        <section className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Account</div>
              <h1 className="mt-3 text-4xl font-semibold text-neutral-100">{account.profile.username}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-300">
                Reader profile for saved follows, comment history, and the next round of account features.
              </p>
              <div className="mt-4 text-sm text-neutral-500">Joined: {formatUpdatedAt(account.profile.createdAt)}</div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/account/settings"
                className="inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-5 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]"
              >
                Settings
              </Link>
              <form action="/api/account/logout" method="post">
                <button
                  type="submit"
                  className="inline-flex rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
                >
                  Log out
                </button>
              </form>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Following</div>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Stories you follow</h2>
              </div>
              <div className="rounded-full border border-[#13314b] px-3 py-1 text-xs text-neutral-400">
                {account.followedStories.length}
              </div>
            </div>

            {account.followedStories.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#04111b] p-5 text-sm leading-7 text-neutral-400">
                You are not following any stories yet. Once follow controls are wired into story pages, the stories you save will appear here.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {account.followedStories.map(({ followedAt, story }) => (
                  <Link
                    key={story.id}
                    href={`/story/${story.id}?from=account`}
                    className="block rounded-2xl border border-[#13314b] bg-[#04111b] p-5 transition hover:border-[#8f7740]/60"
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                      Following since {formatUpdatedAt(followedAt)}
                    </div>
                    <h3 className="mt-3 text-xl font-semibold text-neutral-100">{story.title}</h3>
                    {story.summary[0] ? <p className="mt-3 text-sm leading-6 text-neutral-400">{story.summary[0]}</p> : null}
                    <div className="mt-4 text-sm text-neutral-500">{formatStoryDate(story.date)}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Comments</div>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Comment history</h2>
              </div>
              <div className="rounded-full border border-[#13314b] px-3 py-1 text-xs text-neutral-400">
                {account.comments.length}
              </div>
            </div>

            {account.comments.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#04111b] p-5 text-sm leading-7 text-neutral-400">
                Your comment history will appear here as soon as commenting is enabled on the site.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {account.comments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl border border-[#13314b] bg-[#04111b] p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                      {formatUpdatedAt(comment.createdAt)}
                    </div>
                    {comment.storyTitle ? (
                      <div className="mt-2 text-sm text-neutral-400">
                        On{" "}
                        <Link href={`/story/${comment.storyId}?from=account`} className="text-neutral-200 transition hover:text-white">
                          {comment.storyTitle}
                        </Link>
                      </div>
                    ) : null}
                    <p className="mt-3 text-sm leading-7 text-neutral-300">{comment.body}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
