import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountProfileByUserId, getAccountUserId, getFollowedInterestsWithMatches } from "@/app/lib/account.server";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/app/lib/seo";
import { PUBLIC_PAGE, PUBLIC_PAGE_TITLE, PUBLIC_PANEL, PUBLIC_PANEL_PADDING } from "@/app/lib/surfaces";
import PageBrandHeader from "@/app/page-brand-header";
import AccountInterestsManager from "../account-interests-manager";

export const metadata: Metadata = {
  title: "Manage Interests",
  description: "Manage the interests shaping your Following feed.",
  alternates: {
    canonical: "/account/interests",
  },
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    type: "website",
    url: "/account/interests",
    title: `Manage Interests | ${SITE_NAME}`,
    description: "Manage the interests shaping your Following feed.",
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
    title: `Manage Interests | ${SITE_NAME}`,
    description: "Manage the interests shaping your Following feed.",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function AccountInterestsPage() {
  const userId = await getAccountUserId();
  if (!userId) {
    redirect("/account/login");
  }

  const [profile, interests] = await Promise.all([
    getAccountProfileByUserId(userId),
    getFollowedInterestsWithMatches(userId).catch(() => []),
  ]);

  if (!profile) {
    redirect("/account");
  }

  return (
    <main className={PUBLIC_PAGE}>
      <div className="mx-auto max-w-5xl">
        <PageBrandHeader backHref="/account" />

        <section className={`mt-8 ${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Following</div>
              <h1 className={PUBLIC_PAGE_TITLE}>Manage interests</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-300">
                Add interests, review what each one is pulling in, and hide story matches that do not fit.
              </p>
              <div className="mt-4 text-sm text-neutral-500">{profile.username}</div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/account"
                className="inline-flex rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
              >
                Back to account
              </Link>
            </div>
          </div>
        </section>

        <section className={`mt-8 ${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}>
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Interests</div>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Subjects you want the site to keep finding</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
              Keep interests short and natural. Expand one to review matched stories and clean up weak matches.
            </p>
          </div>

          <AccountInterestsManager initialInterests={interests} />
        </section>
      </div>
    </main>
  );
}
