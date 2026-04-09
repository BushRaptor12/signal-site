import type { BriefingPosition, StoryWithViews } from "@/app/lib/types";

export type BriefingLayout = {
  lead: StoryWithViews | null;
  leftColumn: StoryWithViews[];
  rightColumn: StoryWithViews[];
};

function isBriefingPosition(value: string | null | undefined): value is BriefingPosition {
  return value === "lead" || value === "left" || value === "right";
}

function compareLegacyRank(left: StoryWithViews, right: StoryWithViews) {
  const leftRank = left.beacon_rank ?? Number.MAX_SAFE_INTEGER;
  const rightRank = right.beacon_rank ?? Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) return leftRank - rightRank;

  const leftCreated = Date.parse(left.created_at ?? left.date);
  const rightCreated = Date.parse(right.created_at ?? right.date);
  return rightCreated - leftCreated;
}

function legacyLayout(stories: StoryWithViews[]): BriefingLayout {
  const ranked = [...stories].sort(compareLegacyRank);
  const [lead, ...rest] = ranked;
  const leftColumn: StoryWithViews[] = [];
  const rightColumn: StoryWithViews[] = [];

  rest.forEach((story, index) => {
    if (index % 2 === 0) {
      leftColumn.push(story);
    } else {
      rightColumn.push(story);
    }
  });

  return {
    lead: lead ?? null,
    leftColumn,
    rightColumn,
  };
}

function compareByBriefingOrder(left: StoryWithViews, right: StoryWithViews) {
  const leftOrder = left.beacon_order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.beacon_order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;

  return compareLegacyRank(left, right);
}

export function buildBriefingLayout(stories: StoryWithViews[]): BriefingLayout {
  const includedStories = stories.filter((story) => story.beacon_include);
  if (includedStories.length === 0) {
    return { lead: null, leftColumn: [], rightColumn: [] };
  }

  const explicitStories = includedStories.filter((story) => isBriefingPosition(story.beacon_position ?? null));
  if (explicitStories.length === 0) {
    return legacyLayout(includedStories);
  }

  const leadCandidates = explicitStories.filter((story) => story.beacon_position === "lead").sort(compareByBriefingOrder);
  const leftColumn = explicitStories.filter((story) => story.beacon_position === "left").sort(compareByBriefingOrder);
  const rightColumn = explicitStories.filter((story) => story.beacon_position === "right").sort(compareByBriefingOrder);
  const placedIds = new Set(explicitStories.map((story) => story.id));
  const fallbackStories = includedStories.filter((story) => !placedIds.has(story.id));

  let lead: StoryWithViews | null = leadCandidates[0] ?? null;
  if (!lead && fallbackStories.length > 0) {
    const legacy = legacyLayout(fallbackStories);
    lead = legacy.lead;
    leftColumn.push(...legacy.leftColumn);
    rightColumn.push(...legacy.rightColumn);
  } else if (fallbackStories.length > 0) {
    const legacy = legacyLayout(fallbackStories);
    leftColumn.push(...legacy.leftColumn);
    rightColumn.push(...legacy.rightColumn);
    if (legacy.lead) {
      if (leftColumn.length <= rightColumn.length) {
        leftColumn.unshift(legacy.lead);
      } else {
        rightColumn.unshift(legacy.lead);
      }
    }
  }

  return {
    lead,
    leftColumn,
    rightColumn,
  };
}

function withPlacement(story: StoryWithViews, beacon_position: BriefingPosition, beacon_order: number): StoryWithViews {
  return {
    ...story,
    beacon_include: true,
    beacon_position,
    beacon_order,
  };
}

export function serializeBriefingLayout(layout: BriefingLayout): StoryWithViews[] {
  const stories: StoryWithViews[] = [];

  if (layout.lead) {
    stories.push(withPlacement(layout.lead, "lead", 1));
  }

  layout.leftColumn.forEach((story, index) => {
    stories.push(withPlacement(story, "left", index + 1));
  });

  layout.rightColumn.forEach((story, index) => {
    stories.push(withPlacement(story, "right", index + 1));
  });

  return stories;
}

export function sortBriefingStories(stories: StoryWithViews[]) {
  const layout = buildBriefingLayout(stories);
  return serializeBriefingLayout(layout);
}
