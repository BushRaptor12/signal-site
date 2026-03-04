"use client";

import { useEffect } from "react";

export default function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;

    const viewedKey = `signal:viewed:${slug}`;
    try {
      if (sessionStorage.getItem(viewedKey) === "1") return;
    } catch {
      // ignore storage errors
    }

    let timer: number | null = null;

    const sendView = () => {
      timer = window.setTimeout(() => {
        void fetch(`/api/views/${encodeURIComponent(slug)}`, {
          method: "POST",
          keepalive: true,
        })
          .then(() => {
            try {
              sessionStorage.setItem(viewedKey, "1");
            } catch {
              // ignore storage errors
            }
          })
          .catch(() => {});
      }, 3000);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sendView();
    };

    if (document.visibilityState === "visible") {
      sendView();
    } else {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [slug]);

  return null;
}
