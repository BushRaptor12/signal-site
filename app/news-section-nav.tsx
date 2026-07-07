"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NEWS_SECTION_TABS, newsSectionHref, newsSectionLabel } from "@/app/lib/news-sections";
import { NOTIFICATIONS_UPDATED_EVENT } from "@/app/lib/notification-store";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M7 9a5 5 0 1 1 10 0v3.1c0 .8.3 1.5.8 2.1l1.1 1.2c.6.7.1 1.8-.8 1.8H5a1 1 0 0 1-.8-1.8l1.1-1.2c.5-.6.8-1.3.8-2.1V9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="9" r="2.5" />
      <path d="M7.8 16.6c1-1.8 2.5-2.7 4.2-2.7s3.2.9 4.2 2.7" strokeLinecap="round" />
    </svg>
  );
}

export default function NewsSectionNav({ activeTab }: { activeTab?: string }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch("/api/notifications/config", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { unreadCount?: number };
        if (!cancelled) {
          setUnreadCount(Number(data.unreadCount ?? 0));
        }
      } catch {
        if (!cancelled) {
          setUnreadCount(0);
        }
      }
    };

    void refresh();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <nav className="border-b border-[#163754]/70 bg-[#05111D]/95 px-3 py-1 text-neutral-100 sm:px-5 lg:px-8">
      <div className="relative mx-auto max-w-6xl">
        <div className="-mx-2 flex items-center gap-4 overflow-x-auto px-2 pr-24 [scrollbar-width:none] sm:justify-center sm:gap-5 sm:px-24 [&::-webkit-scrollbar]:hidden">
          <Link
            href="/"
            className={`shrink-0 border-b-[3px] px-1 pb-2 pt-1 text-sm font-semibold transition ${
              activeTab
                ? "border-transparent text-[#c5d3e1] hover:border-[#30516d] hover:text-white"
                : "border-[#e3cca0] text-neutral-100"
            }`}
          >
            Home
          </Link>
          <Link
            href="/feed?tab=following"
            className={`shrink-0 border-b-[3px] px-1 pb-2 pt-1 text-sm font-semibold transition ${
              activeTab === "feed"
                ? "border-[#e3cca0] text-neutral-100"
                : "border-transparent text-[#c5d3e1] hover:border-[#30516d] hover:text-white"
            }`}
          >
            Your Feed
          </Link>
          {NEWS_SECTION_TABS.map((tab) => (
            <Link
              key={tab}
              href={newsSectionHref(tab)}
              className={`shrink-0 border-b-[3px] px-1 pb-2 pt-1 text-sm font-semibold transition ${
                activeTab === tab
                  ? "border-[#e3cca0] text-neutral-100"
                  : "border-transparent text-[#c5d3e1] hover:border-[#30516d] hover:text-white"
              }`}
            >
              {newsSectionLabel(tab)}
            </Link>
          ))}
        </div>
        <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center gap-1.5 md:flex">
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-neutral-300 transition hover:border-[#163754] hover:bg-[#03101b] hover:text-white"
          >
            <BellIcon />
            {unreadCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-neutral-300 transition hover:border-[#163754] hover:bg-[#03101b] hover:text-white"
          >
            <AccountIcon />
          </Link>
        </div>
      </div>
    </nav>
  );
}
