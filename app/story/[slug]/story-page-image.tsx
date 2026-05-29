"use client";

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
  const creditText = credit?.trim();
  const creditHref = creditUrl?.trim();
  const containedImageClassName = `block max-h-[36rem] max-w-full object-contain ${
    creditText ? "rounded-t-[12px]" : "rounded-[12px]"
  }`;

  return (
    <div className="w-full max-w-full">
      {display === "contain" ? (
        <div className="inline-block w-full max-w-full overflow-hidden rounded-[12px] border border-white/10">
          <div className="relative">
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
