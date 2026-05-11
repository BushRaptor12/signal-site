import type { Metadata } from "next";
import BackLink from "@/app/back-link";
import { DEFAULT_OG_IMAGE, SITE_NAME, breadcrumbJsonLd } from "@/app/lib/seo";
import { PUBLIC_PAGE, PUBLIC_PAGE_TITLE, PUBLIC_PANEL, PUBLIC_PANEL_PADDING } from "@/app/lib/surfaces";

export const metadata: Metadata = {
  title: "Editorial Standards",
  description: "How The Beacon selects, summarizes, sources, updates, and corrects stories.",
  alternates: {
    canonical: "/editorial-standards",
  },
  openGraph: {
    type: "article",
    url: "/editorial-standards",
    title: `Editorial Standards | ${SITE_NAME}`,
    description: "How The Beacon selects, summarizes, sources, updates, and corrects stories.",
    siteName: SITE_NAME,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        alt: SITE_NAME,
      },
    ],
  },
};

const sections = [
  {
    title: "Who Publishes The Beacon",
    paragraphs: [
      "The Beacon is independently operated in the United States and publishes under The Beacon name. Public stories are attributed to The Beacon Editorial Team rather than individual personal bylines.",
      "Editorial questions, correction requests, and site questions can be sent to contact@readthebeacon.news.",
    ],
  },
  {
    title: "AI and Automation",
    paragraphs: [
      "The Beacon does not use AI to source, write, or compile published stories. Story selection, source choices, summaries, and final story presentation are handled through The Beacon's editorial process.",
      "Software tools may be used for site operations, formatting, organization, metadata management, or administrative workflows, but they are not used as a substitute for editorial sourcing or story writing.",
    ],
  },
  {
    title: "Story Selection",
    paragraphs: [
      "The Beacon focuses on stories that readers may need help tracking, understanding, or comparing across multiple sources. Priority is given to developing news, widely discussed stories, public-interest topics, and stories where source context or perspective is useful.",
      "Not every item receives the same treatment. Some stories are quick summaries, while larger or developing stories may receive additional context, related links, tracking, or briefing placement.",
    ],
  },
  {
    title: "Sourcing",
    paragraphs: [
      "Stories should link to the sources used to prepare the summary. The Beacon favors multiple sources when available and tries to preserve direct links so readers can inspect the original reporting or statements.",
      "Source labels, paywall notes, badges, and perspective indicators are intended to help readers understand what type of source they are opening. They are editorial aids, not endorsements.",
    ],
  },
  {
    title: "Summaries and Context",
    paragraphs: [
      "The Beacon aims to summarize stories clearly without hiding uncertainty. Confirmed facts, claims, allegations, estimates, and commentary should not be presented as the same thing.",
      "When a story benefits from added context, The Beacon may include explanation, source comparison, related stories, or updates. When a story is straightforward, a shorter summary may be used.",
    ],
  },
  {
    title: "Updates and Corrections",
    paragraphs: [
      "Stories may be updated as new information becomes available. Material updates can change headlines, summaries, sources, metadata, images, related stories, and briefing placement.",
      "If a meaningful factual error is identified, The Beacon aims to correct it promptly. Correction requests should include the story link, the issue, and any source that supports the correction.",
    ],
  },
] as const;

export default function EditorialStandardsPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, item: "/" },
    { name: "Editorial Standards", item: "/editorial-standards" },
  ]);

  return (
    <main className={PUBLIC_PAGE}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <div className="mx-auto max-w-4xl">
        <BackLink href="/" />

        <section className={`mt-8 ${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}>
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Editorial Standards</div>
          <h1 className={PUBLIC_PAGE_TITLE}>How The Beacon handles coverage</h1>
          <p className="mt-4 text-sm text-neutral-400">Last updated: May 11, 2026</p>
          <p className="mt-6 text-base leading-7 text-neutral-300">
            These standards explain how The Beacon selects, summarizes, sources, updates, and corrects public stories.
          </p>
        </section>

        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section key={section.title} className={`${PUBLIC_PANEL} ${PUBLIC_PANEL_PADDING}`}>
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
