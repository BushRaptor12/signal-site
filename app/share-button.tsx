"use client";

import { useEffect, useState } from "react";

type ShareButtonProps = {
  title: string;
  path?: string;
  className?: string;
};

function absoluteUrl(path?: string) {
  if (typeof window === "undefined") return path ?? "";
  if (!path) return window.location.href;
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, window.location.origin).toString();
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

export default function ShareButton({ title, path, className = "" }: ShareButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function onShare(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    const url = absoluteUrl(path);

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        setStatus("copied");
        return;
      }

      await copyText(url);
      setStatus("copied");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setStatus("error");
    }
  }

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`.trim()}>
      <button
        type="button"
        onClick={onShare}
        className="rounded-full border border-[#0d2438] bg-[#020b14] px-3 py-1.5 text-xs text-neutral-300 transition hover:border-[#163754] hover:bg-[#03101b] hover:text-neutral-100"
      >
        Share
      </button>
      <span className="min-h-4 text-[11px] text-neutral-500" aria-live="polite">
        {status === "copied" ? "Copied" : status === "error" ? "Could not share" : ""}
      </span>
    </div>
  );
}
