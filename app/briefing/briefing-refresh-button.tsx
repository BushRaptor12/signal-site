"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BriefingRefreshButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 900);
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={refreshing}
      className="inline-flex min-h-9 items-center justify-center rounded-full border border-[#1c3953]/80 bg-[#020b14] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d7e2ef] transition hover:border-[#30516d] hover:bg-[#06131e] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {refreshing ? "Refreshing" : "Refresh"}
    </button>
  );
}
