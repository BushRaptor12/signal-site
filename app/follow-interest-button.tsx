"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { emitAccountFollowsUpdated } from "@/app/lib/account-events";

type FollowInterestButtonProps = {
  authenticated: boolean;
  className?: string;
  initialFollowing?: boolean;
  label?: string;
  query: string;
};

export default function FollowInterestButton({
  authenticated,
  className,
  initialFollowing = false,
  label,
  query,
}: FollowInterestButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  async function followInterest() {
    if (!authenticated || pending || following) return;

    setPending(true);
    try {
      const response = await fetch("/api/account/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) return;

      setFollowing(true);
      emitAccountFollowsUpdated();
    } finally {
      setPending(false);
    }
  }

  const baseClassName =
    className ??
    "rounded-full border border-[#163754] bg-[#020b14] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-300 transition hover:border-[#8f7740]/60 hover:text-neutral-100";

  if (!authenticated) {
    return (
      <Link href="/account/login" className={baseClassName}>
        Follow {label ?? query}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void followInterest();
      }}
      disabled={pending || following}
      className={`${baseClassName} disabled:cursor-default disabled:opacity-70`}
    >
      {pending ? "Following..." : following ? "Following" : `Follow ${label ?? query}`}
    </button>
  );
}
