import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import { DEFAULT_OG_IMAGE, SITE_NAME, breadcrumbJsonLd, trimDescription } from "@/app/lib/seo";
import { PUBLIC_INSET, PUBLIC_INSET_ELEVATED, PUBLIC_PAGE, PUBLIC_PAGE_TITLE, PUBLIC_PANEL, PUBLIC_PANEL_PADDING } from "@/app/lib/surfaces";

const aboutDescription = trimDescription(
  "Learn how The Beacon uses ranked briefings, Following, special-event coverage, and community features to make staying informed easier."
);

const pillars = [
  {
    title: "A clearer way to follow the news",
    body:
      "The Beacon is built to make important stories easier to understand at a glance. Instead of overwhelming readers with noise, the site focuses on concise, multi-source coverage and a clean presentation that helps you quickly see what matters.",
  },
  {
    title: "The Briefing",
    body:
      "The Briefing is the site's front-page digest of the most important stories and latest developments. It is designed to give readers a fast, ranked overview so they can catch up quickly, then dive deeper into the stories that matter most.",
  },
  {
    title: "Following and personal organization",
    body:
      "Readers can shape a personal Following feed around specific stories and broader interests, then refine that experience over time. The goal is to make it easier to keep up with the subjects you actually care about instead of starting from scratch every time you visit.",
  },
  {
    title: "Special-event coverage pages",
    body:
      "Some stories deserve a dedicated home. For big nights and major developing events, The Beacon can group featured stories, rolling updates, and structured trackers into a single coverage page so readers can follow the whole moment in one place.",
  },
  {
    title: "A more social reading experience",
    body:
      "The Beacon is meant to feel more participatory than a one-way headline feed. Readers can react to coverage, comment, reply, vote on discussion, receive notifications, and build a personal reading history, all of which help turn news consumption into an experience that feels more connected and ongoing.",
  },
  {
    title: "Personalized without being complicated",
    body:
      "Customization is a core part of the product. Readers can pin topics, create their own keyword tabs, follow interests, sort coverage in different ways, and shape the homepage around the subjects they care about most without having to learn a complicated interface.",
  },
] as const;

const goals = [
  "Make it easy to understand the news quickly, even when the story is still developing.",
  "Help readers keep track of the stories they care about through follows, interests, comments, reactions, and notifications.",
  "Offer customization that feels simple and useful instead of buried behind settings, including special coverage pages when a story needs more structure.",
  "Keep the product approachable, fast, and easy to use on a daily basis.",
] as const;

export const metadata: Metadata = {
  title: "About",
  description: aboutDescription,
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    type: "article",
    url: "/about",
    title: `About | ${SITE_NAME}`,
    description: aboutDescription,
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
    title: `About | ${SITE_NAME}`,
    description: aboutDescription,
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function AboutPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, item: "/" },
    { name: "About", item: "/about" },
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
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">About</div>
          <h1 className={PUBLIC_PAGE_TITLE}>About The Beacon</h1>
          <p className="mt-6 text-base leading-7 text-neutral-300">
            The Beacon is a news site built around one simple idea: staying informed should feel clear, useful, and
            manageable. The goal is to help readers understand important stories quickly, return to the stories they
            care about, and shape the experience around their interests without extra friction.
          </p>
          <p className="mt-4 text-base leading-7 text-neutral-400">
            That is why the product combines concise story presentation, live discussion, lightweight customization,
            a ranked daily briefing, a Following feed, and special-event coverage pages. The result is meant to feel
            less like an endless feed and more like a reading tool that helps you keep your bearings.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {pillars.map((pillar) => (
              <section
                key={pillar.title}
                className={`${PUBLIC_INSET_ELEVATED} p-6`}
              >
                <h2 className="text-xl font-semibold text-neutral-100">{pillar.title}</h2>
                <p className="mt-3 text-sm leading-7 text-neutral-400">{pillar.body}</p>
              </section>
            ))}
          </div>

          <section className={`mt-10 ${PUBLIC_INSET} p-6`}>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Goals</div>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-neutral-300">
              {goals.map((goal) => (
                <li key={goal} className="flex gap-3">
                  <span className="mt-2 h-2 w-2 rounded-full bg-[#d7c08d]" aria-hidden="true" />
                  <span>{goal}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
