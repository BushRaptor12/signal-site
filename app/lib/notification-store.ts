export type SiteNotificationType = "urgent";

export type SiteNotificationEntry = {
  id: string;
  type: SiteNotificationType;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
};

export type NotificationPreferences = {
  urgentNews: boolean;
};

export const NOTIFICATION_PREFS_KEY = "signal:notificationPrefs:v1";
export const NOTIFICATION_ITEMS_KEY = "signal:notificationItems:v1";
export const NOTIFIED_URGENT_IDS_KEY = "signal:notifiedUrgentIds:v1";
export const NOTIFICATIONS_UPDATED_EVENT = "signal-notifications-updated";

const DEFAULT_PREFS: NotificationPreferences = {
  urgentNews: false,
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function emitNotificationsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  const parsed = safeParse<Partial<NotificationPreferences>>(localStorage.getItem(NOTIFICATION_PREFS_KEY), {});
  return {
    urgentNews: Boolean(parsed.urgentNews),
  };
}

export function setNotificationPreferences(next: NotificationPreferences) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(next));
  emitNotificationsUpdated();
}

export function getStoredNotifications(): SiteNotificationEntry[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<SiteNotificationEntry[]>(localStorage.getItem(NOTIFICATION_ITEMS_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function addStoredNotification(entry: SiteNotificationEntry) {
  if (typeof window === "undefined") return;
  const existing = getStoredNotifications().filter((item) => item.id !== entry.id);
  const next = [entry, ...existing].slice(0, 40);
  localStorage.setItem(NOTIFICATION_ITEMS_KEY, JSON.stringify(next));
  emitNotificationsUpdated();
}

export function markAllNotificationsRead() {
  if (typeof window === "undefined") return;
  const next = getStoredNotifications().map((item) => ({ ...item, read: true }));
  localStorage.setItem(NOTIFICATION_ITEMS_KEY, JSON.stringify(next));
  emitNotificationsUpdated();
}

export function getUnreadNotificationCount() {
  return getStoredNotifications().filter((item) => !item.read).length;
}

export function getNotifiedUrgentIds() {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<string[]>(localStorage.getItem(NOTIFIED_URGENT_IDS_KEY), []);
  return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
}

export function setNotifiedUrgentIds(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFIED_URGENT_IDS_KEY, JSON.stringify(Array.from(new Set(ids))));
}
