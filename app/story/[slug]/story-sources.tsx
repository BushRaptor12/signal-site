"use client";

import { useEffect, useState } from "react";
import type { Source } from "@/app/lib/types";
import { formatStoryDate } from "@/app/lib/dates";
import SourceTitle from "./source-title";

export default function StorySources({ latestSources }: { latestSources: Source[] }) {
  const [sources, setSources] = useState(latestSources);
  const [asOf, setAsOf] = useState<string | null>(null);

  useEffect(() => {
    const handleHistoryDate = (event: Event) => {
      const customEvent = event as CustomEvent<{ sources?: Source[] | null; sourceAsOf?: string | null }>;
      if (!customEvent.detail?.sourceAsOf) {
        setAsOf(null);
        setSources(latestSources);
        return;
      }
      setAsOf(customEvent.detail.sourceAsOf);
      setSources(customEvent.detail.sources ?? latestSources);
    };
    window.addEventListener("story-history-as-of", handleHistoryDate);
    return () => window.removeEventListener("story-history-as-of", handleHistoryDate);
  }, [latestSources]);

  return (
    <section className="mt-8 border-t border-[#1a3349]/60 pt-5">
      <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">
        Sources{asOf ? ` (as of ${formatStoryDate(asOf)})` : ""}
      </div>
      <div className="space-y-3">
        {sources.map((src, index) => (
          <a
            key={`${src.url}-${index}`}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-[14px] border border-[#214765]/70 bg-[#0a1926] p-4 transition hover:-translate-y-0.5 hover:border-[#30516d] hover:bg-[#0c1d2b] sm:p-5"
          >
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="min-w-0 text-[1.08rem] font-semibold text-neutral-50">{src.name}</div>
                  {src.paywalled === true ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d7c08d]">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[2]">
                        <rect x="5" y="10" width="14" height="10" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                      PayWall
                    </span>
                  ) : null}
                  {src.badge ? (
                    <span className="shrink-0 rounded-full border border-[#8f7740]/55 bg-[#8f7740]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e3cca0]">
                      {src.badge}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3">
                  {src.title ? (
                    <SourceTitle title={src.title} className="block text-[15px] leading-6 text-neutral-300 transition group-hover:text-neutral-100" />
                  ) : (
                    <div className="text-[15px] leading-6 text-neutral-400 transition group-hover:text-neutral-300">Open source</div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-row items-center gap-3 text-center sm:flex-col sm:items-end sm:gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${src.lean === "Left" ? "border-blue-400/20 bg-blue-400/[0.06] text-blue-200/80" : src.lean === "Right" ? "border-red-400/20 bg-red-400/[0.06] text-red-200/80" : "border-neutral-600/45 bg-neutral-500/[0.06] text-neutral-400"}`}>
                  {src.lean}
                </span>
                <div className="inline-flex min-h-8 items-center text-[13px] font-semibold text-neutral-400 transition group-hover:text-white">
                  Read<span className="ml-1.5" aria-hidden="true">-&gt;</span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
