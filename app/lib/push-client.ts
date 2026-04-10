"use client";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export async function registerPushServiceWorker() {
  return navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
}

export async function getPushRegistration() {
  await registerPushServiceWorker();
  return navigator.serviceWorker.ready;
}

export async function getExistingPushSubscription() {
  const registration = await getPushRegistration();
  return registration.pushManager.getSubscription();
}
