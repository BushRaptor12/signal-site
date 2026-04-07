export const STORY_REACTIONS = [
  { key: "encouraging", label: "Encouraging", emoji: "👍" },
  { key: "love", label: "Love", emoji: "❤️" },
  { key: "interesting", label: "Interesting", emoji: "🤔" },
  { key: "funny", label: "Funny", emoji: "😂" },
  { key: "concerning", label: "Concerning", emoji: "⚠️" },
  { key: "surprising", label: "Surprising", emoji: "😲" },
  { key: "frustrating", label: "Frustrating", emoji: "😠" },
  { key: "sad", label: "Sad", emoji: "😔" },
] as const;

export type StoryReactionKey = (typeof STORY_REACTIONS)[number]["key"];

export type StoryReactionSummary = {
  counts: Record<StoryReactionKey, number>;
  selectedReaction: StoryReactionKey | null;
};

export function isStoryReactionKey(value: string): value is StoryReactionKey {
  return STORY_REACTIONS.some((reaction) => reaction.key === value);
}

export function emptyReactionCounts(): Record<StoryReactionKey, number> {
  return {
    encouraging: 0,
    love: 0,
    interesting: 0,
    funny: 0,
    concerning: 0,
    surprising: 0,
    frustrating: 0,
    sad: 0,
  };
}
