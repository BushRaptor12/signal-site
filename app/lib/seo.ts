import type { Metadata } from "next";
import type { StoryWithViews } from "@/app/lib/types";

export const SITE_NAME = "The Beacon";
export const SITE_DESCRIPTION = "Multi-source news with clear perspective, concise summaries, and source-by-source coverage.";
export const DEFAULT_OG_IMAGE = "/psbeacon.png";

function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

export function getSiteUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeOrigin(candidate);
    if (normalized) return normalized;
  }

  return new URL("http://localhost:3000");
}

export function absoluteUrl(path = "/") {
  return new URL(path, getSiteUrl()).toString();
}

export function trimDescription(value: string, maxLength = 160) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return SITE_DESCRIPTION;
  if (cleaned.length <= maxLength) return cleaned;

  const slice = cleaned.slice(0, maxLength - 1);
  const boundary = slice.lastIndexOf(" ");
  return `${(boundary > 100 ? slice.slice(0, boundary) : slice).trim()}...`;
}

export function storyDescription(story: StoryWithViews) {
  return trimDescription(story.summary.join(" "));
}

export function storyPublishedTime(story: StoryWithViews) {
  const preferred = story.created_at ?? story.date;
  const published = new Date(preferred);
  if (Number.isNaN(published.getTime())) {
    return new Date().toISOString();
  }

  return published.toISOString();
}

export function storyModifiedTime(story: StoryWithViews) {
  const preferred = story.content_updated_at ?? story.updated_at ?? story.created_at ?? story.date;
  const modified = new Date(preferred);
  if (Number.isNaN(modified.getTime())) {
    return storyPublishedTime(story);
  }

  return modified.toISOString();
}

export function storyKeywords(story: StoryWithViews) {
  return Array.from(
    new Set([
      ...story.topics,
      ...story.primary_entities,
      ...story.locations,
      ...story.organizations,
      ...story.people,
      ...story.industries,
      ...story.sports_teams,
      ...story.offices,
      ...story.facets,
    ])
  ).filter(Boolean);
}

export function buildStoryMetadata(story: StoryWithViews): Metadata {
  const canonicalPath = `/story/${story.id}`;
  const description = storyDescription(story);
  const publishedTime = storyPublishedTime(story);
  const modifiedTime = storyModifiedTime(story);
  const image = story.image_url || absoluteUrl(DEFAULT_OG_IMAGE);

  return {
    title: story.title,
    description,
    keywords: storyKeywords(story),
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "article",
      url: canonicalPath,
      title: story.title,
      description,
      siteName: SITE_NAME,
      publishedTime,
      modifiedTime,
      images: [
        {
          url: image,
          alt: story.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: story.title,
      description,
      images: [image],
    },
  };
}
