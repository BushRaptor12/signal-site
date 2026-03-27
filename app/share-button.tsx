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
    <div className={`relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        onClick={onShare}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#0d2438] bg-[#020b14] text-neutral-400 transition hover:border-[#163754] hover:bg-[#03101b] hover:text-neutral-100"
        aria-label="Share"
        title="Share"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.2 4.72" />
          <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L12.8 19.28" />
        </svg>
      </button>

      <span
        className="pointer-events-none absolute right-0 top-full mt-1 whitespace-nowrap text-[11px] text-neutral-500"
        aria-live="polite"
      >
        {status === "copied" ? "Copied" : status === "error" ? "Could not share" : ""}
      </span>
    </div>
  );
}
