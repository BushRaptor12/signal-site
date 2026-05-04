"use client";

import Image from "next/image";
import { useState } from "react";
import type { StoryImageDisplay } from "@/app/lib/types";

type StoryPageImageProps = {
  alt: string;
  display: StoryImageDisplay | null | undefined;
  objectPosition?: string;
  src: string;
};

export default function StoryPageImage({
  alt,
  display,
  objectPosition = "50% 50%",
  src,
}: StoryPageImageProps) {
  const [collapsed, setCollapsed] = useState(false);

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
            <div className="relative inline-block w-full max-w-full overflow-hidden rounded-[12px] border border-white/10">
              <div className="absolute left-3 top-3 z-10">
                {toggleButton}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                decoding="async"
                loading="lazy"
                className="block max-h-[36rem] max-w-full rounded-[12px] object-contain"
              />
            </div>
          ) : (
            <div className="relative w-full max-w-full overflow-hidden rounded-[12px] border border-white/10">
              <div className="absolute left-3 top-3 z-10">
                {toggleButton}
              </div>
              <div className="relative aspect-[16/10] w-full md:aspect-[16/11]">
                <Image
                  src={src}
                  alt={alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                  style={{ objectPosition }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
