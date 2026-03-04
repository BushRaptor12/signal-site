"use client";

import { useEffect } from "react";

export default function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;

    const timer = window.setTimeout(() => {
      void fetch(`/api/views/${encodeURIComponent(slug)}`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [slug]);

  return null;
}
