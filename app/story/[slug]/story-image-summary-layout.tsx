"use client";

import { useEffect, useRef, useState } from "react";
import type { StoryImageDisplay } from "@/app/lib/types";
import StoryPageImage from "./story-page-image";

type StoryImageSummaryLayoutProps = {
  image: {
    alt: string;
    credit?: string | null;
    creditUrl?: string | null;
    display: StoryImageDisplay | null | undefined;
    objectPosition?: string;
    src: string;
  } | null;
  summary: string[];
  updatedAtLabel?: string | null;
};

const DESKTOP_SIDE_BY_SIDE_QUERY = "(min-width: 1280px)";

export default function StoryImageSummaryLayout({ image, summary, updatedAtLabel }: StoryImageSummaryLayoutProps) {
  const containedImage = Boolean(image && image.display === "contain");
  const imageWrapRef = useRef<HTMLDivElement | null>(null);
  const measureWrapRef = useRef<HTMLDivElement | null>(null);
  const measurePointRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const [sideCount, setSideCount] = useState(0);

  useEffect(() => {
    if (!containedImage) {
      return;
    }

    let frame = 0;
    let disposed = false;
    const mediaQuery = window.matchMedia(DESKTOP_SIDE_BY_SIDE_QUERY);

    const updateSideCount = () => {
      if (disposed) return;

      if (!mediaQuery.matches) {
        setSideCount(0);
        return;
      }

      const imageHeight = imageWrapRef.current?.getBoundingClientRect().height ?? 0;
      const measureWrap = measureWrapRef.current;
      if (!imageHeight || !measureWrap) return;

      const gap = Number.parseFloat(window.getComputedStyle(measureWrap).rowGap || "0") || 0;
      let nextCount = 0;
      let usedHeight = 0;

      for (const node of measurePointRefs.current) {
        if (!node) continue;

        const nextHeight = usedHeight + (nextCount > 0 ? gap : 0) + node.getBoundingClientRect().height;
        if (nextHeight > imageHeight) break;

        usedHeight = nextHeight;
        nextCount += 1;
      }

      setSideCount(Math.max(1, nextCount));
    };

    const scheduleUpdate = () => {
      if (disposed) return;

      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateSideCount);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    if (imageWrapRef.current) resizeObserver.observe(imageWrapRef.current);
    if (measureWrapRef.current) resizeObserver.observe(measureWrapRef.current);
    mediaQuery.addEventListener("change", scheduleUpdate);
    document.fonts?.ready.then(scheduleUpdate).catch(() => {});
    scheduleUpdate();

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mediaQuery.removeEventListener("change", scheduleUpdate);
    };
  }, [containedImage, summary]);

  const effectiveSideCount = containedImage ? sideCount : 0;
  const sideSummaryPoints = containedImage ? summary.slice(0, effectiveSideCount) : [];
  const fullWidthSummaryPoints = containedImage ? summary.slice(effectiveSideCount) : summary;

  return (
    <div className="mt-6">
      {containedImage && image ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start xl:gap-6">
          <div ref={imageWrapRef} className="min-w-0">
            <StoryPageImage {...image} />
          </div>
          <div className="relative min-w-0">
            <div className="flex flex-col gap-2.5 text-[1.02rem] text-neutral-200 sm:text-[1.08rem]">
              {sideSummaryPoints.map((point, index) => (
                <p key={`side-${index}`} className="leading-6 sm:leading-7">
                  {point}
                </p>
              ))}
            </div>
            <div
              ref={measureWrapRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute inset-x-0 top-0 flex flex-col gap-2.5 text-[1.02rem] text-neutral-200 sm:text-[1.08rem]"
            >
              {summary.map((point, index) => (
                <p
                  key={`measure-${index}`}
                  ref={(node) => {
                    measurePointRefs.current[index] = node;
                  }}
                  className="leading-6 sm:leading-7"
                >
                  {point}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : image ? (
        <div className="min-w-0 w-full">
          <StoryPageImage {...image} />
        </div>
      ) : null}

      <div className={`${image ? (containedImage ? "mt-3 " : "mt-5 ") : ""}flex flex-col gap-2.5 text-[1.02rem] text-neutral-200 sm:text-[1.08rem]`}>
        {fullWidthSummaryPoints.map((point, index) => (
          <p key={`full-${index}`} className="leading-6 sm:leading-7">
            {point}
          </p>
        ))}

        {updatedAtLabel ? (
          <div className="pt-2 text-right text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Updated {updatedAtLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
