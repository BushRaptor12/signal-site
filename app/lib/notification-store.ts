export type SiteNotificationType = "comment_reply" | "comment_report" | "urgent" | "username_review";

export type SiteNotificationEntry = {
  body: string;
  createdAt: string;
  href: string;
  id: string;
  read: boolean;
  storyId?: string | null;
  title: string;
  type: SiteNotificationType;
};

export type NotificationPreferences = {
  adminReviews: boolean;
  urgentNews: boolean;
};

export const NOTIFICATIONS_UPDATED_EVENT = "signal-notifications-updated";

export function emitNotificationsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}
