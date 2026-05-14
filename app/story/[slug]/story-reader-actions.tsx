"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackFunnelEvent } from "@/app/funnel-analytics";
import { emitAccountFollowsUpdated } from "@/app/lib/account-events";

type StoryReaderActionsProps = {
  authenticated: boolean;
  className?: string;
  disableMarkSeen?: boolean;
  initialFollowing: boolean;
  storyId: string;
  trackingContext?: string;
};

export default function StoryReaderActions({
  authenticated,
  className = "",
  disableMarkSeen = false,
  initialFollowing,
  storyId,
  trackingContext = "story_page",
}: StoryReaderActionsProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  useEffect(() => {
    if (disableMarkSeen) return;
    if (!authenticated || !storyId) return;

    let timer: number | null = null;

    const markSeen = () => {
      timer = window.setTimeout(() => {
        void fetch(`/api/account/stories/${encodeURIComponent(storyId)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "mark_seen" }),
        }).catch(() => {});
      }, 800);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      markSeen();
    };

    if (document.visibilityState === "visible") {
      markSeen();
    } else {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authenticated, disableMarkSeen, storyId]);

  const baseClassName =
    className ||
    "rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-70";

  async function toggleFollow() {
    if (!authenticated || pending) return;

    setPending(true);
    const nextFollowing = !following;
    trackFunnelEvent("track_story_clicked", {
      action: nextFollowing ? "follow" : "unfollow",
      context: trackingContext,
      storyId,
    });

    try {
      const response = await fetch(`/api/account/stories/${encodeURIComponent(storyId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: nextFollowing ? "follow" : "unfollow" }),
      });

      if (!response.ok) {
        return;
      }

      setFollowing(nextFollowing);
      emitAccountFollowsUpdated();
    } finally {
      setPending(false);
    }
  }

  if (!authenticated) {
    return (
      <Link
        href="/account/login"
        className={`inline-flex border border-[#1c3953]/60 bg-[#08131d] text-[#d7e2ef] hover:border-[#28445d] hover:bg-[#0b1824] ${baseClassName}`.trim()}
        onClick={() =>
          trackFunnelEvent("track_story_login_clicked", {
            context: trackingContext,
            storyId,
          })
        }
      >
        Log in to track
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void toggleFollow()}
      disabled={pending}
      className={`${baseClassName} ${
        following
          ? "border border-[#8f7740]/60 bg-[#08131d] text-neutral-100 hover:border-[#b89a55] hover:bg-[#0b1824]"
          : "border border-[#1c3953]/65 bg-[#08131d] text-[#d7e2ef] hover:border-[#28445d] hover:bg-[#0b1824]"
      }`}
    >
      {pending ? "Saving..." : following ? "Tracking" : "Track Story"}
    </button>
  );
}
