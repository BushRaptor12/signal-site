"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getExistingPushSubscription, isPushSupported, registerPushServiceWorker } from "@/app/lib/push-client";
import { NOTIFICATIONS_UPDATED_EVENT, emitNotificationsUpdated } from "@/app/lib/notification-store";

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

export default function SiteUtilities() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const isAdminPage = pathname.startsWith("/admin");

  useEffect(() => {
    if (isAdminPage) return;

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
  }, [isAdminPage, pathname]);

  useEffect(() => {
    if (isAdminPage) return;
    if (!isPushSupported()) return;

    void registerPushServiceWorker();
    void getExistingPushSubscription().catch(() => null);

    const onMessage = (event: MessageEvent) => {
        const message = event.data as {
          type?: string;
          notification?: {
            id?: string;
            type?: "comment_reply" | "comment_report" | "urgent" | "username_review";
            title?: string;
            body?: string;
            href?: string;
          createdAt?: string;
          read?: boolean;
        };
      };

      if (message.type !== "site-notification" || !message.notification?.id) return;
      emitNotificationsUpdated();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [isAdminPage]);

  if (isAdminPage) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-40 md:right-5 md:top-5">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#13314b] bg-[#020b14]/92 p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.3)] backdrop-blur-sm">
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent text-neutral-300 transition hover:border-[#163754] hover:bg-[#03101b] hover:text-white"
        >
          <BellIcon />
          {unreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Link>
        <Link
          href="/account"
          aria-label="Account"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent text-neutral-300 transition hover:border-[#163754] hover:bg-[#03101b] hover:text-white"
        >
          <AccountIcon />
        </Link>
      </div>
    </div>
  );
}
