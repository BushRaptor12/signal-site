import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import { DEFAULT_OG_IMAGE, SITE_NAME, breadcrumbJsonLd } from "@/app/lib/seo";
import { PUBLIC_PAGE, PUBLIC_PAGE_TITLE, PUBLIC_PANEL, PUBLIC_PANEL_PADDING } from "@/app/lib/surfaces";

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

const LAST_UPDATED = "May 11, 2026";

const sections = [
  {
    title: "Overview",
    paragraphs: [
      "The Beacon is a news site. This Privacy Policy explains what information may be collected when you visit the site, read stories, use reactions, create an account, follow interests or stories, comment, vote, report comments, enable notifications, or interact with other site features.",
      "This policy applies to the public-facing pages of The Beacon, including optional reader accounts and related account-management pages.",
    ],
  },
  {
    title: "Information We Collect",
    paragraphs: [
      "We collect a small amount of information automatically to operate the site, understand usage, and prevent abuse.",
      "Browser storage. The site saves your pinned tabs and active tab in your browser's local storage so your preferences persist between visits. The site also uses session storage to avoid sending repeated view-count requests for the same story during a single browsing session.",
      "Account information. If you create an account, the site stores the email address you provide, your chosen username, and related account records such as followed stories, followed interests, seen-story history, comment history, comment votes, reports, hidden interest-story matches, and notification preferences tied to that account.",
      "Interest controls. If you use the Following and interests tools, the site may store the interests you add, normalized versions of those interests, any include or exclude keywords you save, and feedback such as hiding a matched story for a specific interest.",
      "Account session cookie. When you log in, the site sets a first-party cookie so it can recognize your authenticated session and keep your account page available between page loads.",
      "Site cookie for engagement controls. When you view a story or use reactions, the site may set a first-party cookie named `signal_vid`. That cookie stores a random viewer identifier so the site can reduce duplicate counts and remember whether a reaction appears to come from the same browser over time when you are not signed in.",
      "Basic request data. When a view or reaction request reaches the server, the app reads limited request metadata such as a truncated IP-address bucket and a shortened user-agent string. The app hashes this information before using it to create abuse-prevention and counting keys.",
      "Reaction data. If you tap a reaction on a story while signed out, the selected reaction and a hashed viewer key associated with your browser may be stored so the site can show totals and your current selection. If you react while signed in, the selected reaction may be stored with your account instead so that reaction state can follow you across devices.",
      "Comment and community data. If you comment or reply, the site stores the comment text, timestamps, the story it belongs to, and any edits or deletion state associated with that comment. If you vote on comments or report them, the site stores those actions so it can show discussion ranking, moderation state, and your current vote.",
      "Notification data. If you enable browser notifications while signed in, the site may store your push-subscription details, including an endpoint and associated encryption keys, so it can deliver web push notifications to that browser. The site may also store account notification records such as alerts about replies, moderation activity, or story updates.",
      "Analytics data. The site uses Vercel Web Analytics to receive aggregated traffic information such as page views and general information about visitors, like referrers, country, browser, operating system, and device type. Based on Vercel's published documentation as of March 4, 2025 and September 24, 2025, this analytics product is designed to use anonymized data and not use cookies.",
    ],
  },
  {
    title: "How We Use Information",
    paragraphs: [
      "We use information to operate the site, render stories, remember your tab preferences, authenticate account holders, personalize your Following feed, show followed stories and account history, remember which briefing stories a signed-in reader has already seen, count story views more accurately, power reactions, power comments and replies, show comment votes and ranking, support moderation and abuse prevention, send account and browser notifications when enabled, understand which pages are being used, and improve the editorial product over time.",
      "We do not use the current public site to build advertising audiences or sell subscriber lists.",
    ],
  },
  {
    title: "How We Share Information",
    paragraphs: [
      "We do not sell personal information through the current version of the site.",
      "Information may be processed by service providers that help run the site, including Vercel for hosting and analytics and Supabase for application data, realtime updates, and storage.",
      "If advertising is enabled, third-party vendors, including Google, may use cookies, web beacons, IP addresses, or other identifiers to serve ads, measure ad performance, prevent fraud and abuse, and personalize ads where permitted by law and your choices.",
      "Google's use of advertising cookies enables Google and its partners to serve ads based on a user's visit to The Beacon and/or other sites on the internet. You can learn more about how Google uses information from sites and apps that use its services at https://policies.google.com/technologies/partner-sites.",
      "Stories on The Beacon link out to third-party publisher sites. When you click one of those links, you leave The Beacon and the third party's own terms and privacy practices apply.",
    ],
  },
  {
    title: "Cookies, Local Storage, and Similar Tools",
    paragraphs: [
      "The Beacon currently uses a mix of first-party browser storage, first-party cookies, realtime browser subscriptions, push-notification subscriptions, and service-provider analytics.",
      "Local storage keys are used for saved tab preferences and limited client-side interface state. Session storage is used for temporary per-session view tracking in your browser. The `beacon_account` cookie is used to maintain signed-in account sessions, and the `signal_vid` cookie is used by the site to help manage view and reaction integrity. If you enable web push, your browser may also keep a service-worker registration and push subscription. Vercel Web Analytics is also enabled at the app level.",
      "If Google AdSense or other ad services are enabled, Google and other ad technology providers may place or read cookies and use similar technologies when ads are requested or shown. AdSense cookies may be associated with Google domains such as google.com or doubleclick.net.",
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
      "You can opt out of personalized advertising from Google through Google's Ads Settings at https://adssettings.google.com. You can also learn about opt-out choices for some third-party vendors at https://www.aboutads.info/choices/.",
      "Visitors in regions that require consent for advertising cookies or personalized ads may be shown a consent message before personalized advertising is used.",
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
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, item: "/" },
    { name: "Privacy Policy", item: "/privacy" },
  ]);

  return (
    <main className={PUBLIC_PAGE}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <div className="mx-auto max-w-4xl">
        <BackLink href="/" />

        <div className={`mt-8 ${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}>
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Privacy Policy</div>
          <h1 className={PUBLIC_PAGE_TITLE}>How The Beacon handles information</h1>
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
              className={`${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}
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
