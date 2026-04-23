import type { StoryWithViews } from "@/app/lib/types";

export type CoverageHubPick = {
  pick: string;
  team: string;
  player: string;
  school?: string;
  note?: string;
};

export type CoverageHubStorySection = {
  id: string;
  title: string;
  description?: string;
  storyIds: string[];
};

export type CoverageHubDefinition = {
  slug: string;
  eyebrow: string;
  title: string;
  dek: string;
  dateLabel: string;
  description: string;
  heroStoryId?: string;
  latestStoryIds: string[];
  sections: CoverageHubStorySection[];
  picksTitle?: string;
  picksDescription?: string;
  picks: CoverageHubPick[];
  notes?: string[];
};

export type CoverageHubData = Omit<CoverageHubDefinition, "sections"> & {
  heroStory: StoryWithViews | null;
  latestStories: StoryWithViews[];
  sections: Array<CoverageHubStorySection & { stories: StoryWithViews[] }>;
};

export type CoverageHubStored = CoverageHubDefinition & {
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const DEFAULT_COVERAGE_HUBS: CoverageHubDefinition[] = [
  {
    slug: "nfl-draft-2026",
    eyebrow: "Special Coverage",
    title: "NFL Draft 2026",
    dek: "Live draft-night coverage built around the latest reporting, pick-by-pick updates, and team-by-team angles.",
    dateLabel: "April 23, 2026",
    description: "Live draft-night coverage from The Beacon with latest stories, pick tracker updates, and team-by-team follow angles.",
    heroStoryId: "nfl-draft-2026",
    latestStoryIds: [],
    sections: [
      {
        id: "latest",
        title: "Latest Draft Stories",
        description: "The main draft-night writeups and breaking updates as they publish.",
        storyIds: [],
      },
      {
        id: "teams",
        title: "Team Angles",
        description: "Stories focused on what the picks mean for teams, roster fits, and front-office decisions.",
        storyIds: [],
      },
      {
        id: "schools",
        title: "College Programs and Prospects",
        description: "Stories that matter to fan bases following schools, star prospects, and draft pipelines.",
        storyIds: [],
      },
    ],
    picksTitle: "Round 1 Pick Tracker",
    picksDescription: "",
    picks: [],
    notes: [],
  },
];

function byId(stories: StoryWithViews[]) {
  return new Map(stories.map((story) => [story.id, story]));
}

export function listCoverageHubSlugs() {
  return DEFAULT_COVERAGE_HUBS.map((hub) => hub.slug);
}

export function listDefaultCoverageHubDefinitions() {
  return DEFAULT_COVERAGE_HUBS.map((hub) => ({
    ...hub,
    latestStoryIds: [...hub.latestStoryIds],
    sections: hub.sections.map((section) => ({ ...section, storyIds: [...section.storyIds] })),
    picks: hub.picks.map((pick) => ({ ...pick })),
    notes: hub.notes ? [...hub.notes] : undefined,
  }));
}

export function getDefaultCoverageHubDefinition(slug: string) {
  return listDefaultCoverageHubDefinitions().find((hub) => hub.slug === slug) ?? null;
}

export function mergeCoverageHubDefinition(
  base: CoverageHubDefinition,
  override: Partial<CoverageHubStored> | null | undefined
): CoverageHubStored {
  if (!override) {
    return { ...base };
  }

  return {
    ...base,
    ...override,
    heroStoryId: override.heroStoryId ?? base.heroStoryId,
    latestStoryIds: override.latestStoryIds ?? base.latestStoryIds,
    sections: override.sections ?? base.sections,
    picksTitle: override.picksTitle ?? base.picksTitle,
    picksDescription: override.picksDescription ?? base.picksDescription,
    picks: override.picks ?? base.picks,
    notes: override.notes ?? base.notes,
    updatedAt: override.updatedAt ?? null,
    updatedBy: override.updatedBy ?? null,
  };
}

export function getCoverageHubStoryIds(hub: CoverageHubDefinition) {
  return Array.from(
    new Set(
      [
        hub.heroStoryId,
        ...hub.latestStoryIds,
        ...hub.sections.flatMap((section) => section.storyIds),
      ].filter((value): value is string => Boolean(value && value.trim()))
    )
  );
}

export function buildCoverageHubData(hub: CoverageHubDefinition, stories: StoryWithViews[]): CoverageHubData {
  const storyMap = byId(stories);

  return {
    ...hub,
    heroStory: hub.heroStoryId ? storyMap.get(hub.heroStoryId) ?? null : null,
    latestStories: hub.latestStoryIds.map((id) => storyMap.get(id)).filter((story): story is StoryWithViews => Boolean(story)),
    sections: hub.sections.map((section) => ({
      ...section,
      stories: section.storyIds.map((id) => storyMap.get(id)).filter((story): story is StoryWithViews => Boolean(story)),
    })),
  };
}
