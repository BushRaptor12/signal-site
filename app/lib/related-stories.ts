import type { StoryWithViews } from "@/app/lib/types";
import { normalize } from "@/app/lib/vocab";

function publishedAtMs(story: StoryWithViews): number {
  const created = new Date(story.created_at ?? "").getTime();
  if (Number.isFinite(created) && created > 0) return created;

  const dateOnly = new Date(story.date ?? "").getTime();
  if (Number.isFinite(dateOnly) && dateOnly > 0) return dateOnly;

  return 0;
}

function overlapScore(leftValues: string[], rightValues: string[], weight: number) {
  const left = new Set(leftValues.map(normalize).filter(Boolean));
  const right = new Set(rightValues.map(normalize).filter(Boolean));
  let matches = 0;

  for (const value of left) {
    if (right.has(value)) matches += 1;
  }

  return matches * weight;
}

function entityNames(story: StoryWithViews) {
  return story.entities.map((entity) => entity.name);
}

function automaticRelatedScore(current: StoryWithViews, candidate: StoryWithViews) {
  const primaryEntityScore = overlapScore(current.primary_entities, candidate.primary_entities, 8);
  const entityScore = overlapScore(entityNames(current), entityNames(candidate), 5);
  const topicScore = overlapScore(current.topics, candidate.topics, 4);
  const tagScore = overlapScore(current.tags, candidate.tags, 2);
  const locationScore = overlapScore(current.locations, candidate.locations, 4);
  const organizationScore = overlapScore(current.organizations, candidate.organizations, 4);
  const peopleScore = overlapScore(current.people, candidate.people, 5);
  const industryScore = overlapScore(current.industries, candidate.industries, 3);
  const sportsTeamScore = overlapScore(current.sports_teams, candidate.sports_teams, 5);
  const officeScore = overlapScore(current.offices, candidate.offices, 4);
  const facetScore = overlapScore(current.facets, candidate.facets, 3);
  const manualReciprocalBoost = candidate.related_story_ids.includes(current.id) ? 24 : 0;

  const ageMs = Math.max(0, Date.now() - publishedAtMs(candidate));
  const ageDays = ageMs / 86_400_000;
  const recencyBoost = Math.max(0, 6 - Math.min(ageDays, 6));

  return (
    primaryEntityScore
    + entityScore
    + topicScore
    + tagScore
    + locationScore
    + organizationScore
    + peopleScore
    + industryScore
    + sportsTeamScore
    + officeScore
    + facetScore
    + manualReciprocalBoost
    + recencyBoost
  );
}

export function buildRelatedStories(current: StoryWithViews, pool: StoryWithViews[], limit = 4) {
  const candidates = pool.filter((story) => story.id !== current.id);
  const manualIds = current.related_story_ids.filter((id) => id !== current.id);
  const byId = new Map(candidates.map((story) => [story.id, story]));
  const selected: StoryWithViews[] = [];
  const used = new Set<string>();

  for (const id of manualIds) {
    const story = byId.get(id);
    if (!story || used.has(story.id)) continue;
    selected.push(story);
    used.add(story.id);
    if (selected.length >= limit) return selected;
  }

  const rankedAutomatic = candidates
    .filter((story) => !used.has(story.id))
    .map((story) => ({
      story,
      score: automaticRelatedScore(current, story),
      publishedMs: publishedAtMs(story),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.publishedMs - left.publishedMs;
    });

  for (const item of rankedAutomatic) {
    selected.push(item.story);
    if (selected.length >= limit) break;
  }

  return selected;
}
