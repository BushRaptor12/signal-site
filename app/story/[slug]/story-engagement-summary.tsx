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
    <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
      <span>
        {views} {views === 1 ? "view" : "views"}
      </span>
      <span aria-hidden="true" className="text-neutral-600">
        /
      </span>
      <span>
        {commentCount} {commentCount === 1 ? "comment" : "comments"}
      </span>
    </div>
  );
}
