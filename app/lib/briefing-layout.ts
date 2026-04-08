import type { StoryWithViews } from "@/app/lib/types";

export function splitBriefingColumns(stories: StoryWithViews[]) {
  const leftColumn: StoryWithViews[] = [];
  const rightColumn: StoryWithViews[] = [];

  stories.forEach((story, index) => {
    if (index % 2 === 0) {
      leftColumn.push(story);
    } else {
      rightColumn.push(story);
    }
  });

  return { leftColumn, rightColumn };
}

export function interleaveBriefingColumns(leftColumn: StoryWithViews[], rightColumn: StoryWithViews[]) {
  const stories: StoryWithViews[] = [];
  const maxLength = Math.max(leftColumn.length, rightColumn.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftStory = leftColumn[index];
    if (leftStory) stories.push(leftStory);

    const rightStory = rightColumn[index];
    if (rightStory) stories.push(rightStory);
  }

  return stories;
}
