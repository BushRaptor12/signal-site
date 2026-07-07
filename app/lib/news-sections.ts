import { normalize, TOPICS, toTitleCase } from "@/app/lib/vocab";

export const NEWS_SECTION_TABS = ["popular", "latest", ...TOPICS.map((topic) => normalize(topic))];

export function newsSectionHref(tab: string) {
  return `/section/${encodeURIComponent(tab)}`;
}

export function newsSectionLabel(tab: string) {
  if (tab === "popular") return "Popular";
  if (tab === "latest") return "Latest";
  return toTitleCase(tab);
}
