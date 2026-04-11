"use client";

export const ACCOUNT_FOLLOWS_UPDATED_EVENT = "signal:account-follows-updated";
const ACCOUNT_FOLLOWS_UPDATED_STORAGE_KEY = "signal:account-follows-updated";

export function emitAccountFollowsUpdated() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(ACCOUNT_FOLLOWS_UPDATED_EVENT));

  try {
    localStorage.setItem(ACCOUNT_FOLLOWS_UPDATED_STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore storage errors
  }
}
