import type { MetadataRoute } from "next";
import { listBriefingArchives } from "@/app/lib/briefing-archive";
import { coerceStory, type StoryDbRow } from "@/app/lib/stories";
import { absoluteUrl } from "@/app/lib/seo";
import { supabaseServer } from "@/app/lib/supabase.server";

function lastModifiedForStory(story: StoryDbRow) {
  return story.content_updated_at ?? story.updated_at ?? story.created_at ?? story.date ?? new Date().toISOString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: absoluteUrl("/briefing"),
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/briefing/archive"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: absoluteUrl("/about"),
      lastModified: new Date("2026-05-11T00:00:00.000Z"),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/editorial-standards"),
      lastModified: new Date("2026-05-11T00:00:00.000Z"),
      changeFrequency: "yearly",
      priority: 0.35,
    },
    {
      url: absoluteUrl("/privacy"),
      lastModified: new Date("2026-05-11T00:00:00.000Z"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/cookie-policy"),
      lastModified: new Date("2026-05-11T00:00:00.000Z"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  try {
    const supabase = supabaseServer();
    const [{ data, error }, archives] = await Promise.all([
      supabase.from("stories").select("*").in("status", ["published", "archived"]).order("created_at", { ascending: false }),
      listBriefingArchives(100).catch(() => []),
    ]);
    if (error) throw error;

    for (const archive of archives) {
      routes.push({
        url: absoluteUrl(`/briefing/archive/${archive.archive_key}`),
        lastModified: new Date(archive.captured_at),
        changeFrequency: "monthly",
        priority: 0.45,
      });
    }

    for (const row of (data ?? []) as StoryDbRow[]) {
      const story = coerceStory(row);
      routes.push({
        url: absoluteUrl(`/story/${story.id}`),
        lastModified: new Date(lastModifiedForStory(row)),
        changeFrequency: story.status === "archived" ? "monthly" : story.pinned ? "hourly" : "daily",
        priority: story.status === "archived" ? 0.45 : story.pinned ? 0.9 : 0.8,
      });
    }
  } catch {
    return routes;
  }

  return routes;
}
