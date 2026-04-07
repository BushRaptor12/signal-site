import type { MetadataRoute } from "next";
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
      url: absoluteUrl("/privacy"),
      lastModified: new Date("2026-04-06T00:00:00.000Z"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.from("stories").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    for (const row of (data ?? []) as StoryDbRow[]) {
      const story = coerceStory(row);
      routes.push({
        url: absoluteUrl(`/story/${story.id}`),
        lastModified: new Date(lastModifiedForStory(row)),
        changeFrequency: story.pinned ? "hourly" : "daily",
        priority: story.pinned ? 0.9 : 0.8,
      });
    }
  } catch {
    return routes;
  }

  return routes;
}
