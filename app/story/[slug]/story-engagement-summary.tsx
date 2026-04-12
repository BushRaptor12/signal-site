"use client";

import { useEffect, useState } from "react";
import {
  STORY_COMMENT_COUNT_UPDATED_EVENT,
  readStoredStoryCommentCountUpdate,
  readStoryCommentCountUpdate,
} from "@/app/lib/comment-events";

type StoryEngagementSummaryProps = {
  initialCommentCount: number;
  storyId: string;
  views: number;
};

export default function StoryEngagementSummary({
  initialCommentCount,
  storyId,
  views,
}: StoryEngagementSummaryProps) {
  const [commentCount, setCommentCount] = useState(initialCommentCount);

  useEffect(() => {
    const applyUpdate = (payload: { commentCount: number; storyId: string } | null) => {
      if (!payload || payload.storyId !== storyId) return;
      setCommentCount(payload.commentCount);
    };

    const onWindowEvent = (event: Event) => {
      applyUpdate(readStoryCommentCountUpdate((event as CustomEvent).detail));
    };
    const onStorage = () => {
      applyUpdate(readStoredStoryCommentCountUpdate());
    };

    window.addEventListener(STORY_COMMENT_COUNT_UPDATED_EVENT, onWindowEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(STORY_COMMENT_COUNT_UPDATED_EVENT, onWindowEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, [storyId]);

  return (
    <div>
      {views} {views === 1 ? "view" : "views"} | {commentCount} {commentCount === 1 ? "comment" : "comments"}
    </div>
  );
}
