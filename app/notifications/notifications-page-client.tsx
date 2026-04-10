"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUpdatedAt } from "@/app/lib/dates";
import type { NotificationPreferences, SiteNotificationEntry } from "@/app/lib/notification-store";
import { getExistingPushSubscription, isPushSupported, registerPushServiceWorker, urlBase64ToUint8Array } from "@/app/lib/push-client";
import {
  NOTIFICATIONS_UPDATED_EVENT,
  getNotificationPreferences,
  markAllNotificationsRead,
  setNotificationPreferences,
} from "@/app/lib/notification-store";

function readNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

export default function NotificationsPageClient() {
  const [preferences, setPreferences] = useState<NotificationPreferences>({ urgentNews: false });
  const [items, setItems] = useState<SiteNotificationEntry[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushConfig, setPushConfig] = useState<{ enabled: boolean; publicKey: string | null }>({
    enabled: false,
    publicKey: null,
  });
  const [savingToggle, setSavingToggle] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setPreferences(getNotificationPreferences());
      setPermission(readNotificationPermission());
    };

    markAllNotificationsRead();
    refresh();

    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadNotifications = async () => {
      try {
        const [configRes, notificationsRes] = await Promise.all([
          fetch("/api/notifications/config", { cache: "no-store" }),
          fetch("/api/notifications?limit=20", { cache: "no-store" }),
        ]);

        const configJson = (await configRes.json().catch(() => ({}))) as {
          enabled?: boolean;
          publicKey?: string | null;
        };
        const notificationJson = (await notificationsRes.json().catch(() => [])) as unknown;

        if (cancelled) return;

        setPushConfig({
          enabled: Boolean(configJson.enabled),
          publicKey: typeof configJson.publicKey === "string" ? configJson.publicKey : null,
        });
        setItems(Array.isArray(notificationJson) ? (notificationJson as SiteNotificationEntry[]) : []);

        if (isPushSupported()) {
          await registerPushServiceWorker();
          const existingSubscription = await getExistingPushSubscription();
          if (!cancelled) setPushEnabled(Boolean(existingSubscription));
        }
      } catch {
        if (!cancelled) {
          setItems([]);
        }
      }
    };

    void loadNotifications();

    return () => {
      cancelled = true;
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

        const nextPreferences = { urgentNews: false };
        setNotificationPreferences(nextPreferences);
        setPreferences(nextPreferences);
        setPushEnabled(false);
        setPermission(readNotificationPermission());
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

      const nextPreferences = { urgentNews: true };
      setNotificationPreferences(nextPreferences);
      setPreferences(nextPreferences);
      setPushEnabled(true);
    } finally {
      setSavingToggle(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-neutral-300 transition hover:text-white">
          {"<- Back"}
        </Link>

        <div className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Notifications</div>
          <h1 className="mt-3 text-4xl font-semibold text-neutral-100">Alerts and notification settings</h1>
          <p className="mt-6 text-base leading-7 text-neutral-300">
            Recent alerts appear here, and notification settings are saved on this device for now.
          </p>
        </div>

        <section className="mt-8 rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <h2 className="text-2xl font-semibold text-neutral-100">Preferences</h2>
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
                disabled={savingToggle || !pushConfig.enabled}
                className="h-5 w-5 accent-[#d7e2ef]"
              />
            </label>
          </div>

          <p className="mt-4 text-sm text-neutral-500">
            {!pushConfig.enabled
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
            <span className="text-sm text-neutral-500">{items.length} saved</span>
          </div>

          {items.length === 0 ? (
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
                    <div className="text-sm font-semibold uppercase tracking-[0.16em] text-red-400">{item.title}</div>
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
