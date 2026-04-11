"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { emitAccountFollowsUpdated } from "@/app/lib/account-events";

type StoryReaderActionsProps = {
  authenticated: boolean;
  initialFollowing: boolean;
  storyId: string;
};

export default function StoryReaderActions({
  authenticated,
  initialFollowing,
  storyId,
}: StoryReaderActionsProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  useEffect(() => {
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
  }, [authenticated, storyId]);

  async function toggleFollow() {
    if (!authenticated || pending) return;

    setPending(true);
    const nextFollowing = !following;

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
        className="rounded-full border border-[#0d2438] bg-[#020b14] px-4 py-2 text-xs font-semibold text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b]"
      >
        Log in to follow
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void toggleFollow()}
      disabled={pending}
      className={`rounded-full px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
        following
          ? "border border-[#8f7740]/70 bg-[#07101a] text-neutral-100 hover:border-[#b89a55] hover:bg-[#0a1724]"
          : "border border-[#0d2438] bg-[#020b14] text-[#d7e2ef] hover:border-[#163754] hover:bg-[#03101b]"
      }`}
    >
      {pending ? "Saving..." : following ? "Following" : "Follow story"}
    </button>
  );
}
