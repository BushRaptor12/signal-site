import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/app/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How The Beacon collects, uses, stores, and shares information.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    type: "article",
    url: "/privacy",
    title: `Privacy Policy | ${SITE_NAME}`,
    description: "How The Beacon collects, uses, stores, and shares information.",
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
    title: `Privacy Policy | ${SITE_NAME}`,
    description: "How The Beacon collects, uses, stores, and shares information.",
    images: [DEFAULT_OG_IMAGE],
  },
};

const LAST_UPDATED = "April 12, 2026";

const sections = [
  {
    title: "Overview",
    paragraphs: [
      "The Beacon is a news site. This Privacy Policy explains what information may be collected when you visit the site, read stories, use reactions, create an account, comment, vote, report comments, or interact with other site features.",
      "This policy applies to the public-facing pages of The Beacon, including optional reader accounts and related account-management pages.",
    ],
  },
  {
    title: "Information We Collect",
    paragraphs: [
      "We collect a small amount of information automatically to operate the site, understand usage, and prevent abuse.",
      "Browser storage. The site saves your pinned tabs and active tab in your browser's local storage so your preferences persist between visits. The site also uses session storage to avoid sending repeated view-count requests for the same story during a single browsing session.",
      "Account information. If you create an account, the site stores the email address you provide, your chosen username, and related account records such as followed stories, seen-story history, comment history, comment votes, reports, and notification preferences tied to that account.",
      "Account session cookie. When you log in, the site sets a first-party cookie so it can recognize your authenticated session and keep your account page available between page loads.",
      "Site cookie for engagement controls. When you view a story or use reactions, the site may set a first-party cookie named `signal_vid`. That cookie stores a random viewer identifier so the site can reduce duplicate counts and remember whether a reaction appears to come from the same browser over time.",
      "Basic request data. When a view or reaction request reaches the server, the app reads limited request metadata such as a truncated IP-address bucket and a shortened user-agent string. The app hashes this information before using it to create abuse-prevention and counting keys.",
      "Reaction data. If you tap a reaction on a story, the selected reaction and the hashed viewer key associated with it are stored so the site can show totals and your current selection.",
      "Comment and community data. If you comment or reply, the site stores the comment text, timestamps, the story it belongs to, and any edits or deletion state associated with that comment. If you vote on comments or report them, the site stores those actions so it can show discussion ranking, moderation state, and your current vote.",
      "Analytics data. The site uses Vercel Web Analytics to receive aggregated traffic information such as page views and general information about visitors, like referrers, country, browser, operating system, and device type. Based on Vercel's published documentation as of March 4, 2025 and September 24, 2025, this analytics product is designed to use anonymized data and not use cookies.",
    ],
  },
  {
    title: "How We Use Information",
    paragraphs: [
      "We use information to operate the site, render stories, remember your tab preferences, authenticate account holders, show followed stories and account history, remember which briefing stories a signed-in reader has already seen, count story views more accurately, power reactions, power comments and replies, show comment votes and ranking, support moderation and abuse prevention, send account notifications, understand which pages are being used, and improve the editorial product over time.",
      "We do not use the current public site to build advertising audiences or sell subscriber lists.",
    ],
  },
  {
    title: "How We Share Information",
    paragraphs: [
      "We do not sell personal information through the current version of the site.",
      "Information may be processed by service providers that help run the site, including Vercel for hosting and analytics and Supabase for application data, realtime updates, and storage.",
      "Stories on The Beacon link out to third-party publisher sites. When you click one of those links, you leave The Beacon and the third party's own terms and privacy practices apply.",
    ],
  },
  {
    title: "Cookies, Local Storage, and Similar Tools",
    paragraphs: [
      "The Beacon currently uses a mix of first-party browser storage, first-party cookies, realtime browser subscriptions, and service-provider analytics.",
      "Local storage keys are used for saved tab preferences and limited client-side interface state. Session storage is used for temporary per-session view tracking in your browser. The `beacon_account` cookie is used to maintain signed-in account sessions, and the `signal_vid` cookie is used by the site to help manage view and reaction integrity. Vercel Web Analytics is also enabled at the app level.",
      "You can usually remove or block cookies and local storage through your browser settings. If you do, some site behavior, such as saved tabs or engagement counting, may stop working as intended.",
    ],
  },
  {
    title: "Retention",
    paragraphs: [
      "Local storage remains in your browser until you clear it. Session storage normally lasts until that browser tab or session ends.",
      "The `beacon_account` cookie can remain active for up to 30 days unless you log out or clear it sooner.",
      "The `signal_vid` cookie is configured to last up to one year unless you delete it sooner.",
      "The current codebase does not publish a fixed public deletion schedule for server-side engagement data such as hashed viewer keys or reaction records. Unless a shorter internal retention period is adopted later, that data may be retained for operational, editorial, analytics, and abuse-prevention purposes.",
    ],
  },
  {
    title: "Your Choices and Rights",
    paragraphs: [
      "You can browse much of the site without creating an account or directly submitting identifying information.",
      "You can avoid using reaction features, clear cookies and browser storage, or use browser privacy controls to limit certain types of tracking.",
      "Depending on where you live, you may have privacy rights under applicable law, such as rights to request access to or deletion of certain information. Account holders can manage some information through the account area, and privacy requests may also be sent to contact@readthebeacon.news.",
    ],
  },
  {
    title: "Children's Privacy",
    paragraphs: [
      "The Beacon is a general-audience news site and is not intended for children under 13. The site is not designed to knowingly collect personal information from children under 13 through public-facing features.",
      "If the operator of the site learns that personal information from a child under 13 was collected in a way that requires action under applicable law, the operator should take appropriate steps to delete it or otherwise comply with the law.",
    ],
  },
  {
    title: "Security",
    paragraphs: [
      "We use reasonable administrative, technical, and organizational measures appropriate to the nature of the data processed by the site. No internet transmission or storage system can be guaranteed to be completely secure, so we cannot promise absolute security.",
    ],
  },
  {
    title: "International Visitors",
    paragraphs: [
      "The Beacon may be hosted and supported using service providers that operate in the United States and other countries. By using the site, you understand that information may be processed in locations where privacy laws may differ from those in your home jurisdiction.",
    ],
  },
  {
    title: "Changes to This Policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time as the site changes, including if account, community, newsletter, advertising, or analytics features change in a material way.",
      "When we make material changes, we will update the \"Last updated\" date on this page and post the revised version here.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "Privacy questions or requests may be directed to contact@readthebeacon.news.",
    ],
  },
] as const;

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <BackLink href="/" />

        <div className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Privacy Policy</div>
          <h1 className="mt-3 text-4xl font-semibold text-neutral-100">How The Beacon handles information</h1>
          <p className="mt-4 text-sm text-neutral-400">Last updated: {LAST_UPDATED}</p>
          <p className="mt-6 text-base leading-7 text-neutral-300">
            This Privacy Policy describes how The Beacon currently handles information and should be read together with any
            updated version posted on this page.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
            >
              <h2 className="text-2xl font-semibold text-neutral-100">{section.title}</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-neutral-300">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
