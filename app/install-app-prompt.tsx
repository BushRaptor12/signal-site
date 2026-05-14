"use client";

import { useEffect, useState } from "react";
import { trackFunnelEvent } from "@/app/funnel-analytics";

const INSTALL_PROMPT_DISMISSED_KEY = "beacon:installPromptDismissed:v1";

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(navigatorWithStandalone.standalone);
}

export default function InstallAppPrompt({ compact = false }: { compact?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneDisplay()) return;
    if (window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === "1") return;

    const frame = window.requestAnimationFrame(() => {
      setVisible(true);
      trackFunnelEvent("install_prompt_shown", { compact });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [compact]);

  function dismiss() {
    try {
      window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, "1");
    } catch {
      // Ignore storage failures; the prompt can still close for this session.
    }
    trackFunnelEvent("install_prompt_dismissed", { compact });
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={`md:hidden ${compact ? "rounded-[12px] p-4" : "rounded-[14px] p-5"} border border-[#28445d]/80 bg-[#081724] text-neutral-100 shadow-[0_16px_34px_rgba(0,0,0,0.22)]`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Install The Beacon</div>
          <p className="mt-2 text-sm leading-6 text-neutral-300">
            Add it to your home screen from your browser share menu for a standalone app-style launch.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1c3953]/80 bg-[#020b14] text-neutral-400 transition hover:border-[#30516d] hover:text-white"
        >
          <span aria-hidden="true">x</span>
        </button>
      </div>
    </div>
  );
}
