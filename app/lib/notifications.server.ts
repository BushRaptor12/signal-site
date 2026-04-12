import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { supabaseServer } from "@/app/lib/supabase.server";
import type { StoryWithViews } from "@/app/lib/types";

export type SiteNotificationType = "comment_reply" | "comment_report" | "urgent" | "username_review";

export type AccountNotification = {
  body: string;
  createdAt: string;
  href: string;
  id: string;
  read: boolean;
  storyId: string | null;
  title: string;
  type: SiteNotificationType;
};

export type NotificationPreferences = {
  adminReviews: boolean;
  urgentNews: boolean;
};

type StoredPushSubscription = {
  auth: string;
  endpoint: string;
  p256dh: string;
  user_id: string;
};

type InsertAccountNotificationRow = {
  body: string;
  href: string;
  story_id?: string | null;
  title: string;
  type: SiteNotificationType;
  user_id: string;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  adminReviews: true,
  urgentNews: false,
};

let configured = false;

function getWebPushEnv() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? process.env.WEB_PUSH_PUBLIC_KEY ?? null;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY ?? null;
  const subject = process.env.WEB_PUSH_SUBJECT ?? null;

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  return { privateKey, publicKey, subject };
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

function toWebPushSubscription(subscription: StoredPushSubscription): WebPushSubscription {
  return {
    endpoint: subscription.endpoint,
    keys: {
      auth: subscription.auth,
      p256dh: subscription.p256dh,
    },
  };
}

export function getWebPushPublicKey() {
  return getWebPushEnv()?.publicKey ?? null;
}

export function isWebPushConfigured() {
  return Boolean(getWebPushEnv());
}

export function toStoredPushSubscription(value: unknown) {
  if (typeof value !== "object" || value === null) return null;

  const subscription = value as {
    endpoint?: unknown;
    keys?: { auth?: unknown; p256dh?: unknown } | null;
  };

  const endpoint = typeof subscription.endpoint === "string" ? subscription.endpoint.trim() : "";
  const p256dh = typeof subscription.keys?.p256dh === "string" ? subscription.keys.p256dh.trim() : "";
  const auth = typeof subscription.keys?.auth === "string" ? subscription.keys.auth.trim() : "";

  if (!endpoint || !p256dh || !auth) return null;

  return {
    auth,
    endpoint,
    p256dh,
  };
}

export async function getNotificationPreferencesForUser(userId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("urgent_news, admin_reviews")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return {
    adminReviews: data?.admin_reviews ?? DEFAULT_NOTIFICATION_PREFERENCES.adminReviews,
    urgentNews: data?.urgent_news ?? DEFAULT_NOTIFICATION_PREFERENCES.urgentNews,
  };
}

export async function upsertNotificationPreferences(userId: string, preferences: Partial<NotificationPreferences>) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("user_notification_preferences").upsert(
    {
      admin_reviews: preferences.adminReviews,
      updated_at: new Date().toISOString(),
      urgent_news: preferences.urgentNews,
      user_id: userId,
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
}

export async function getUnreadNotificationCountForUser(userId: string) {
  const supabase = supabaseServer();
  const { count, error } = await supabase
    .from("account_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
}

export async function listNotificationsForUser(userId: string, limit = 20): Promise<AccountNotification[]> {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("account_notifications")
    .select("id, type, title, body, href, story_id, created_at, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as Array<{
    body?: string | null;
    created_at?: string | null;
    href?: string | null;
    id?: string | null;
    read_at?: string | null;
    story_id?: string | null;
    title?: string | null;
    type?: SiteNotificationType | null;
  }>).map((item) => ({
    body: item.body ?? "",
    createdAt: item.created_at ?? new Date().toISOString(),
    href: item.href ?? "/notifications",
    id: item.id ?? "",
    read: Boolean(item.read_at),
    storyId: item.story_id ?? null,
    title: item.title ?? "Notification",
    type:
      item.type === "username_review"
        ? "username_review"
        : item.type === "comment_reply"
          ? "comment_reply"
          : item.type === "comment_report"
            ? "comment_report"
            : "urgent",
  }));
}

export async function markAllNotificationsReadForUser(userId: string) {
  const supabase = supabaseServer();
  const { error } = await supabase
    .from("account_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
}

export async function storePushSubscriptionForUser(userId: string, subscription: { auth: string; endpoint: string; p256dh: string }) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      auth: subscription.auth,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      updated_at: new Date().toISOString(),
      user_agent: null,
      user_id: userId,
    },
    { onConflict: "endpoint" }
  );

  if (error) throw error;
}

export async function deletePushSubscriptionForUser(userId: string, endpoint: string) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
  if (error) throw error;
}

export async function clearPushSubscriptionsForUser(userId: string) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId);
  if (error) throw error;
}

async function insertAccountNotifications(rows: InsertAccountNotificationRow[]) {
  if (rows.length === 0) return [];

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("account_notifications")
    .insert(rows)
    .select("id, user_id, created_at, href, title, body, type, story_id");

  if (error) throw error;
  return (data ?? []) as Array<{
    body: string;
    created_at: string;
    href: string;
    id: string;
    story_id: string | null;
    title: string;
    type: SiteNotificationType;
    user_id: string;
  }>;
}

async function listPushSubscriptionsForUsers(userIds: string[]) {
  if (userIds.length === 0) return [];

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (error) throw error;

  return ((data ?? []) as StoredPushSubscription[]).filter((item) => item.user_id && item.endpoint && item.p256dh && item.auth);
}

async function notifyPushRecipients(
  subscriptions: StoredPushSubscription[],
  notificationsByUserId: Map<string, { body: string; created_at: string; href: string; id: string; title: string; type: SiteNotificationType }>
) {
  if (!configureWebPush() || subscriptions.length === 0) return;

  const invalidEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const notification = notificationsByUserId.get(subscription.user_id);
      if (!notification) return;

      const payload = JSON.stringify({
        body: notification.body,
        createdAt: notification.created_at,
        href: notification.href,
        id: notification.id,
        title: notification.title,
        type: notification.type,
      });

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

export async function sendUrgentNotificationsForStory(story: StoryWithViews) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("user_id")
    .eq("urgent_news", true);

  if (error) throw error;

  const userIds = Array.from(new Set(((data ?? []) as Array<{ user_id?: string | null }>).map((row) => row.user_id).filter(Boolean) as string[]));
  if (userIds.length === 0) return;

  const inserted = await insertAccountNotifications(
    userIds.map((userId) => ({
      body: story.title,
      href: `/story/${story.id}`,
      story_id: story.id,
      title: "Urgent News",
      type: "urgent",
      user_id: userId,
    }))
  );

  const notificationsByUserId = new Map(
    inserted.map((item) => [
      item.user_id,
      {
        body: item.body,
        created_at: item.created_at,
        href: item.href,
        id: item.id,
        title: item.title,
        type: item.type,
      },
    ])
  );

  const subscriptions = await listPushSubscriptionsForUsers(userIds);
  await notifyPushRecipients(subscriptions, notificationsByUserId);
}

export async function notifyAdminsAboutUsernameReview(review: {
  email: string;
  queueId: string;
  reason: string;
  userId: string;
  username: string;
}) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("is_admin", true);

  if (error) throw error;

  const adminIds = Array.from(new Set(((data ?? []) as Array<{ user_id?: string | null }>).map((row) => row.user_id).filter(Boolean) as string[]));
  if (adminIds.length === 0) return;

  const inserted = await insertAccountNotifications(
    adminIds.map((adminId) => ({
      body: `${review.username} was flagged for review: ${review.reason}. Email: ${review.email}`,
      href: "/notifications",
      title: "Username Review",
      type: "username_review",
      user_id: adminId,
    }))
  );

  const notificationsByUserId = new Map(
    inserted.map((item) => [
      item.user_id,
      {
        body: item.body,
        created_at: item.created_at,
        href: item.href,
        id: item.id,
        title: item.title,
        type: item.type,
      },
    ])
  );

  const subscriptions = await listPushSubscriptionsForUsers(adminIds);
  await notifyPushRecipients(subscriptions, notificationsByUserId);
}

export async function notifyUserAboutCommentReply(input: {
  actorUsername: string;
  recipientUserId: string;
  replyBody: string;
  storyId: string;
  commentId: string;
}) {
  if (!input.recipientUserId.trim()) return;

  const inserted = await insertAccountNotifications([
    {
      body: `${input.actorUsername} replied: ${input.replyBody.slice(0, 180)}`,
      href: `/story/${input.storyId}#comment-${input.commentId}`,
      story_id: input.storyId,
      title: "New Reply",
      type: "comment_reply",
      user_id: input.recipientUserId,
    },
  ]);

  const notificationsByUserId = new Map(
    inserted.map((item) => [
      item.user_id,
      {
        body: item.body,
        created_at: item.created_at,
        href: item.href,
        id: item.id,
        title: item.title,
        type: item.type,
      },
    ])
  );

  const subscriptions = await listPushSubscriptionsForUsers([input.recipientUserId]);
  await notifyPushRecipients(subscriptions, notificationsByUserId);
}

export async function notifyAdminsAboutCommentReport(input: {
  commentId: string;
  details: string | null;
  reason: string;
  reporterUsername: string;
  storyId: string;
}) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.from("user_profiles").select("user_id").eq("is_admin", true);
  if (error) throw error;

  const adminIds = Array.from(new Set(((data ?? []) as Array<{ user_id?: string | null }>).map((row) => row.user_id).filter(Boolean) as string[]));
  if (adminIds.length === 0) return;

  const detailSuffix = input.details?.trim() ? ` Details: ${input.details.trim().slice(0, 220)}` : "";
  const inserted = await insertAccountNotifications(
    adminIds.map((adminId) => ({
      body: `${input.reporterUsername} reported comment ${input.commentId} for "${input.reason}".${detailSuffix}`,
      href: `/story/${input.storyId}#comment-${input.commentId}`,
      story_id: input.storyId,
      title: "Comment Report",
      type: "comment_report",
      user_id: adminId,
    }))
  );

  const notificationsByUserId = new Map(
    inserted.map((item) => [
      item.user_id,
      {
        body: item.body,
        created_at: item.created_at,
        href: item.href,
        id: item.id,
        title: item.title,
        type: item.type,
      },
    ])
  );

  const subscriptions = await listPushSubscriptionsForUsers(adminIds);
  await notifyPushRecipients(subscriptions, notificationsByUserId);
}

export async function queueUsernameReview(review: {
  email: string;
  reason: string;
  userId: string;
  username: string;
}) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("username_review_queue")
    .insert({
      email: review.email,
      normalized_username: review.username.trim().toLowerCase(),
      reason: review.reason,
      user_id: review.userId,
      username: review.username,
    })
    .select("id")
    .single();

  if (error) throw error;

  await notifyAdminsAboutUsernameReview({
    email: review.email,
    queueId: data.id as string,
    reason: review.reason,
    userId: review.userId,
    username: review.username,
  });
}
