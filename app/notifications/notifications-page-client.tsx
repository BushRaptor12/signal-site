"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUpdatedAt } from "@/app/lib/dates";
import type { NotificationPreferences, SiteNotificationEntry } from "@/app/lib/notification-store";
import { getExistingPushSubscription, isPushSupported, registerPushServiceWorker, urlBase64ToUint8Array } from "@/app/lib/push-client";
import { NOTIFICATIONS_UPDATED_EVENT, emitNotificationsUpdated } from "@/app/lib/notification-store";
import PageBrandHeader from "@/app/page-brand-header";

function readNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

export default function NotificationsPageClient() {
  const [authenticated, setAuthenticated] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({ adminReviews: true, urgentNews: false });
  const [items, setItems] = useState<SiteNotificationEntry[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushConfig, setPushConfig] = useState<{ enabled: boolean; publicKey: string | null }>({
    enabled: false,
    publicKey: null,
  });
  const [savingToggle, setSavingToggle] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadNotifications = async () => {
      try {
        const configRes = await fetch("/api/notifications/config", { cache: "no-store" });
        const configJson = (await configRes.json().catch(() => ({}))) as {
          authenticated?: boolean;
          enabled?: boolean;
          preferences?: NotificationPreferences | null;
          publicKey?: string | null;
        };

        const notificationsRes = await fetch("/api/notifications?limit=20", { cache: "no-store" });
        const notificationJson = (await notificationsRes.json().catch(() => [])) as unknown;

        if (cancelled) return;

        setAuthenticated(Boolean(configJson.authenticated));
        setPreferences(configJson.preferences ?? { adminReviews: true, urgentNews: false });
        setPermission(readNotificationPermission());
        setPushConfig({
          enabled: Boolean(configJson.enabled),
          publicKey: typeof configJson.publicKey === "string" ? configJson.publicKey : null,
        });
        setItems(Array.isArray(notificationJson) ? (notificationJson as SiteNotificationEntry[]) : []);

        if (isPushSupported()) {
          await registerPushServiceWorker();
          const existingSubscription = await getExistingPushSubscription();
          if (!cancelled) setPushEnabled(Boolean(existingSubscription));
        } else if (!cancelled) {
          setPushEnabled(false);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setAuthenticated(false);
        }
      }
    };

    void loadNotifications();

    const refresh = () => {
      void loadNotifications();
    };

    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  async function handleUrgentToggle(nextValue: boolean) {
    if (savingToggle) return;
    setSavingToggle(true);

    try {
      if (!nextValue) {
        const existingSubscription = isPushSupported() ? await getExistingPushSubscription() : null;

        if (existingSubscription) {
          await fetch("/api/notifications/subscription", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: existingSubscription.endpoint }),
          });
          await existingSubscription.unsubscribe();
        }

        const nextPreferences = { ...preferences, urgentNews: false };
        setPreferences(nextPreferences);
        setPushEnabled(false);
        setPermission(readNotificationPermission());
        emitNotificationsUpdated();
        return;
      }

      if (!pushConfig.enabled || !pushConfig.publicKey) {
        setPermission(readNotificationPermission());
        return;
      }

      if (!isPushSupported()) {
        setPermission("unsupported");
        return;
      }

      let nextPermission = readNotificationPermission();
      if (nextPermission !== "granted") {
        nextPermission = await window.Notification.requestPermission();
      }

      setPermission(nextPermission);
      if (nextPermission !== "granted") return;

      const registration = await registerPushServiceWorker().then(() => navigator.serviceWorker.ready);
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushConfig.publicKey),
        });
      }

      const saveRes = await fetch("/api/notifications/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), urgentNews: true }),
      });
      if (!saveRes.ok) return;

      const nextPreferences = { ...preferences, urgentNews: true };
      setPreferences(nextPreferences);
      setPushEnabled(true);
      emitNotificationsUpdated();
    } finally {
      setSavingToggle(false);
    }
  }

  async function markAllRead() {
    if (!authenticated || items.length === 0 || markingRead) return;

    setMarkingRead(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "mark_all_read" }),
      });

      if (!response.ok) return;

      setItems([]);
      emitNotificationsUpdated();
    } finally {
      setMarkingRead(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <PageBrandHeader backHref="/" />

        <div className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Notifications</div>
          <h1 className="mt-3 text-4xl font-semibold text-neutral-100">Alerts and notification settings</h1>
          <p className="mt-6 text-base leading-7 text-neutral-300">
            Recent alerts and read state now follow your account, not just this browser.
          </p>
        </div>

        <section className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <h2 className="text-2xl font-semibold text-neutral-100">Preferences</h2>
          {!authenticated ? (
            <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#03101b] p-5 text-sm leading-7 text-neutral-400">
              Sign in to sync notification history, unread counts, and alert preferences to your account.
            </div>
          ) : null}
          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-[#13314b] bg-[#03101b] p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-base font-semibold text-neutral-100">Urgent News</div>
              <p className="mt-1 text-sm leading-6 text-neutral-400">
                Receive alerts when a newly published story is marked urgent.
              </p>
            </div>
            <label className="inline-flex items-center gap-3 text-sm text-neutral-200">
              <span>{preferences.urgentNews ? "On" : "Off"}</span>
              <input
                type="checkbox"
                checked={preferences.urgentNews}
                onChange={(e) => {
                  void handleUrgentToggle(e.target.checked);
                }}
                disabled={savingToggle || !pushConfig.enabled || !authenticated}
                className="h-5 w-5 accent-[#d7e2ef]"
              />
            </label>
          </div>

          <p className="mt-4 text-sm text-neutral-500">
            {!authenticated
              ? "Notification syncing and push subscriptions are available once you are logged in."
              : !pushConfig.enabled
              ? "Background push is not configured yet. Add the web-push environment keys to turn this on."
              : permission === "granted" && pushEnabled
                ? "Browser notifications are enabled."
                : permission === "granted"
                  ? "Browser permission is granted. Turn Urgent News on to subscribe this browser."
                  : permission === "denied"
                    ? "Browser notifications are blocked in this browser."
                    : permission === "unsupported"
                      ? "This browser does not support push notifications."
                      : "Turning Urgent News on will ask the browser for notification permission."}
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-neutral-100">Recent notifications</h2>
            <div className="flex items-center gap-3">
              {authenticated && items.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={markingRead}
                  className="rounded-full border border-[#0d2438] bg-[#020b14] px-4 py-2 text-xs font-semibold text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {markingRead ? "Marking..." : "Mark all read"}
                </button>
              ) : null}
              <span className="text-sm text-neutral-500">{items.length} saved</span>
            </div>
          </div>

          {!authenticated ? (
            <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#03101b] p-5 text-sm leading-7 text-neutral-400">
              <p>Log in to see notifications tied to your account.</p>
              <Link href="/account/login" className="mt-4 inline-flex rounded-full border border-[#8f7740]/70 bg-[#07101a] px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]">
                Log in
              </Link>
            </div>
          ) : items.length === 0 ? (
            <p className="mt-6 text-base leading-7 text-neutral-400">No notifications yet.</p>
          ) : (
            <div className="mt-6 space-y-4">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-2xl border border-[#13314b] bg-[#03101b] p-5 transition hover:border-[#21496b] hover:bg-[#041524]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div
                      className={`text-sm font-semibold uppercase tracking-[0.16em] ${
                        item.type === "username_review" ? "text-[#d7c08d]" : "text-red-400"
                      }`}
                    >
                      {item.title}
                    </div>
                    <div className="text-sm text-neutral-500">{formatUpdatedAt(item.createdAt)}</div>
                  </div>
                  <p className="mt-3 text-base leading-7 text-neutral-200">{item.body}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
