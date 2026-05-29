"use client";

import { useState } from "react";
import type { StoryImageDisplay } from "@/app/lib/types";

type StoryPageImageProps = {
  alt: string;
  credit?: string | null;
  creditUrl?: string | null;
  display: StoryImageDisplay | null | undefined;
  objectPosition?: string;
  src: string;
};

export default function StoryPageImage({
  alt,
  credit,
  creditUrl,
  display,
  objectPosition = "50% 50%",
  src,
}: StoryPageImageProps) {
  const [collapsed, setCollapsed] = useState(false);
  const creditText = credit?.trim();
  const creditHref = creditUrl?.trim();
  const containedImageClassName = `block max-h-[36rem] max-w-full object-contain ${
    creditText ? "rounded-t-[12px]" : "rounded-[12px]"
  }`;

  const toggleButton = (
    <button
      type="button"
      onClick={() => setCollapsed((current) => !current)}
      aria-label={collapsed ? "Show image" : "Minimize image"}
      title={collapsed ? "Show image" : "Minimize image"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#04101a]/48 text-white/78 shadow-[0_8px_18px_rgba(0,0,0,0.24)] backdrop-blur-sm transition hover:border-white/20 hover:bg-[#07131e]/78 hover:text-white"
    >
      {collapsed ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
          <path d="M4 12h16" strokeLinecap="round" />
          <path d="M12 4v16" strokeLinecap="round" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
          <path d="M5 12h14" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="w-full max-w-full">
      {collapsed ? (
        <div className="flex w-full justify-start">
          {toggleButton}
        </div>
      ) : (
        <div className="w-full max-w-full">
          {display === "contain" ? (
            <div className="inline-block w-full max-w-full overflow-hidden rounded-[12px] border border-white/10">
              <div className="relative">
                <div className="absolute left-3 top-3 z-10">
                  {toggleButton}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={alt}
                  decoding="async"
                  loading="lazy"
                  className={containedImageClassName}
                />
                {creditText ? <ImageCredit credit={creditText} creditUrl={creditHref} /> : null}
              </div>
            </div>
          ) : (
            <div className="relative w-full max-w-full overflow-hidden rounded-[12px] border border-white/10">
              <div className="absolute left-3 top-3 z-10">
                {toggleButton}
              </div>
              <div className="relative aspect-[16/10] w-full md:aspect-[16/11]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={alt}
                  decoding="async"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition }}
                />
              </div>
              {creditText ? <ImageCredit credit={creditText} creditUrl={creditHref} /> : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImageCredit({ credit, creditUrl }: { credit: string; creditUrl?: string | null }) {
  const content = (
    <>
      <span className="text-neutral-500">Image:</span>
      <span className="ml-1 text-neutral-300">{credit}</span>
    </>
  );

  return (
    <div className="border-t border-white/10 bg-[#030b12] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
      {creditUrl ? (
        <a href={creditUrl} target="_blank" rel="noopener noreferrer" className="transition hover:text-white">
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}
