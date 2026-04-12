"use client";

export const STORY_COMMENT_COUNT_UPDATED_EVENT = "signal:story-comment-count-updated";
const STORY_COMMENT_COUNT_STORAGE_KEY = "signal:story-comment-count-updated";

export type StoryCommentCountUpdate = {
  commentCount: number;
  storyId: string;
  updatedAt: number;
};

export function emitStoryCommentCountUpdated(storyId: string, commentCount: number) {
  if (typeof window === "undefined") return;

  const payload: StoryCommentCountUpdate = {
    commentCount,
    storyId,
    updatedAt: Date.now(),
  };

  try {
    localStorage.setItem(STORY_COMMENT_COUNT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore localStorage failures
  }

  window.dispatchEvent(new CustomEvent<StoryCommentCountUpdate>(STORY_COMMENT_COUNT_UPDATED_EVENT, { detail: payload }));
}

export function readStoryCommentCountUpdate(value: unknown): StoryCommentCountUpdate | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<StoryCommentCountUpdate>;
  const storyId = typeof candidate.storyId === "string" ? candidate.storyId.trim() : "";
  const commentCount = typeof candidate.commentCount === "number" ? Math.max(0, Math.trunc(candidate.commentCount)) : NaN;
  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : NaN;

  if (!storyId || !Number.isFinite(commentCount) || !Number.isFinite(updatedAt)) {
    return null;
  }

  return {
    commentCount,
    storyId,
    updatedAt,
  };
}

export function readStoredStoryCommentCountUpdate() {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORY_COMMENT_COUNT_STORAGE_KEY);
    return raw ? readStoryCommentCountUpdate(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}
