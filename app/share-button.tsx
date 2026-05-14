"use client";

import { useEffect, useRef, useState } from "react";
import { trackFunnelEvent } from "@/app/funnel-analytics";

type ShareButtonProps = {
  title: string;
  path?: string;
  className?: string;
  trackingContext?: string;
  variant?: "default" | "soft";
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

export default function ShareButton({ title, path, className = "", trackingContext = "story_page", variant = "default" }: ShareButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function shouldUseNativeShare() {
    if (typeof window === "undefined" || !navigator.share) return false;
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  }

  async function handleCopy(url: string) {
    try {
      await copyText(url);
      setStatus("copied");
      setMenuOpen(false);
    } catch {
      setStatus("error");
    }
  }

  async function onShare(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    const url = absoluteUrl(path);
    trackFunnelEvent("share_clicked", {
      context: trackingContext,
      path: path ?? null,
      native: shouldUseNativeShare(),
    });

    try {
      if (shouldUseNativeShare()) {
        await navigator.share({ title, url });
        setStatus("copied");
        return;
      }

      setMenuOpen((current) => !current);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setStatus("error");
    }
  }

  const url = absoluteUrl(path);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const shareOptions = [
    { href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`, label: "Email" },
    { href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`, label: "X" },
    { href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, label: "Facebook" },
    { href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`, label: "Reddit" },
  ];
  const buttonClasses =
    variant === "soft"
      ? "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#214765]/70 bg-[#07131e]/78 text-[#c8d4df] shadow-[0_8px_22px_rgba(0,0,0,0.16)] backdrop-blur-xl transition hover:border-[#8f7740]/55 hover:bg-[#0a1723]/88 hover:text-white"
      : "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#0d2438] bg-[#020b14] text-neutral-400 transition hover:border-[#163754] hover:bg-[#03101b] hover:text-neutral-100";
  const menuClasses =
    variant === "soft"
      ? "absolute bottom-full right-0 z-20 mb-2 min-w-[10rem] rounded-[22px] border border-[#214765]/65 bg-[#07131e]/94 p-2 shadow-[0_22px_48px_rgba(0,0,0,0.32)] backdrop-blur-2xl"
      : "absolute bottom-full right-0 z-20 mb-2 min-w-[10rem] rounded-2xl border border-[#183149]/70 bg-[#07131e] p-2 shadow-[0_18px_36px_rgba(0,0,0,0.3)]";
  const itemClasses =
    variant === "soft"
      ? "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-[#0c1b29] hover:text-white"
      : "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-[#0a1926] hover:text-white";
  const statusClasses =
    variant === "soft"
      ? "pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[11px] text-neutral-400"
      : "pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[11px] text-neutral-500";

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        onClick={onShare}
        className={buttonClasses}
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

      {menuOpen ? (
        <div className={menuClasses}>
          <button
            type="button"
            onClick={() => void handleCopy(url)}
            className={itemClasses}
          >
            <span>Copy link</span>
          </button>
          {shareOptions.map((option) => (
            <a
              key={option.label}
              href={option.href}
              target={option.label === "Email" ? undefined : "_blank"}
              rel={option.label === "Email" ? undefined : "noreferrer"}
              onClick={() => setMenuOpen(false)}
              className={itemClasses}
            >
              <span>{option.label}</span>
            </a>
          ))}
        </div>
      ) : null}

      {status !== "idle" && (
        <span
          className={statusClasses}
          aria-live="polite"
        >
          {status === "copied" ? "Copied" : "Could not share"}
        </span>
      )}
    </div>
  );
}
