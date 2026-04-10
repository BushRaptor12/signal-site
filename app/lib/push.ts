import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import type { StoryWithViews } from "@/app/lib/types";
import { supabaseServer } from "@/app/lib/supabase.server";

export type StoredPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  urgent_news: boolean;
};

type NotificationInsertRow = {
  type: "urgent";
  title: string;
  body: string;
  href: string;
  story_id: string;
};

let configured = false;

function getWebPushEnv() {
  const publicKey =
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ??
    process.env.WEB_PUSH_PUBLIC_KEY ??
    null;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY ?? null;
  const subject = process.env.WEB_PUSH_SUBJECT ?? null;

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export function getWebPushPublicKey() {
  return getWebPushEnv()?.publicKey ?? null;
}

export function isWebPushConfigured() {
  return Boolean(getWebPushEnv());
}

function configureWebPush() {
  const config = getWebPushEnv();
  if (!config) return null;

  if (!configured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configured = true;
  }

  return config;
}

export function toStoredPushSubscription(value: unknown): StoredPushSubscription | null {
  if (typeof value !== "object" || value === null) return null;

  const subscription = value as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown } | null;
  };

  const endpoint = typeof subscription.endpoint === "string" ? subscription.endpoint.trim() : "";
  const p256dh = typeof subscription.keys?.p256dh === "string" ? subscription.keys.p256dh.trim() : "";
  const auth = typeof subscription.keys?.auth === "string" ? subscription.keys.auth.trim() : "";

  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    p256dh,
    auth,
    urgent_news: true,
  };
}

function toWebPushSubscription(subscription: StoredPushSubscription): WebPushSubscription {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };
}

export async function listUrgentPushSubscriptions() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, urgent_news")
    .eq("urgent_news", true);
  if (error) throw error;

  return ((data ?? []) as StoredPushSubscription[]).filter((item) => item.endpoint && item.p256dh && item.auth);
}

export async function insertSiteNotification(row: NotificationInsertRow) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("site_notifications").insert(row);
  if (error) throw error;
}

export async function sendUrgentPushForStory(story: StoryWithViews) {
  if (!configureWebPush()) return;

  const subscriptions = await listUrgentPushSubscriptions();
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    type: "urgent",
    title: "Urgent News",
    body: story.title,
    href: `/story/${story.id}`,
    storyId: story.id,
    createdAt: new Date().toISOString(),
  });

  const invalidEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(toWebPushSubscription(subscription), payload, {
          TTL: 300,
          urgency: "high",
        });
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : 0;

        if (statusCode === 404 || statusCode === 410) {
          invalidEndpoints.push(subscription.endpoint);
        }
      }
    })
  );

  if (invalidEndpoints.length > 0) {
    const supabase = supabaseServer();
    await supabase.from("push_subscriptions").delete().in("endpoint", invalidEndpoints);
  }
}
