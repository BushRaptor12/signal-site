"use client";

import { useEffect, useRef, useState } from "react";

type SourceTitleProps = {
  title: string;
  className?: string;
};

const DESKTOP_TITLE_QUERY = "(min-width: 768px)";
const TITLE_TRUNCATION_ELLIPSIS = "...";

function canvasFontFromComputedStyle(style: CSSStyleDeclaration) {
  return (
    style.font ||
    `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`
  );
}

function truncateTitleByWholeWords(title: string, maxWidth: number, context: CanvasRenderingContext2D) {
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  if (!normalizedTitle || context.measureText(normalizedTitle).width <= maxWidth) {
    return normalizedTitle || title;
  }

  const words = normalizedTitle.split(" ");
  let low = 0;
  let high = words.length;
  let best = TITLE_TRUNCATION_ELLIPSIS;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate =
      midpoint > 0 ? `${words.slice(0, midpoint).join(" ")}${TITLE_TRUNCATION_ELLIPSIS}` : TITLE_TRUNCATION_ELLIPSIS;

    if (context.measureText(candidate).width <= maxWidth) {
      best = candidate;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return best;
}

export default function SourceTitle({ title, className }: SourceTitleProps) {
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const [displayTitle, setDisplayTitle] = useState(title);

  useEffect(() => {
    const element = titleRef.current;
    if (!element) return;

    let frame = 0;
    let disposed = false;
    const desktopQuery = window.matchMedia(DESKTOP_TITLE_QUERY);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    const updateTitle = () => {
      if (disposed) return;

      if (!context || !desktopQuery.matches) {
        setDisplayTitle(title);
        return;
      }

      const availableWidth = element.clientWidth;
      if (availableWidth <= 0) return;

      context.font = canvasFontFromComputedStyle(window.getComputedStyle(element));
      const nextTitle = truncateTitleByWholeWords(title, availableWidth, context);
      setDisplayTitle((current) => (current === nextTitle ? current : nextTitle));
    };

    const scheduleUpdate = () => {
      if (disposed) return;

      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateTitle);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(element);
    desktopQuery.addEventListener("change", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    document.fonts?.ready.then(scheduleUpdate).catch(() => {});
    scheduleUpdate();

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      desktopQuery.removeEventListener("change", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [title]);

  return (
    <span
      ref={titleRef}
      aria-label={title}
      className={`${className ?? ""} break-words md:overflow-hidden md:text-ellipsis md:whitespace-nowrap`.trim()}
      title={title}
    >
      {displayTitle}
    </span>
  );
}
