"use client";

import { useEffect, useRef, useState } from "react";

type SourceTitleProps = {
  title: string;
  className?: string;
};

function trimToWordBoundary(title: string, maxWidth: number, font: string) {
  if (typeof window === "undefined") return title;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return title;

  context.font = font;

  if (context.measureText(title).width <= maxWidth) {
    return title;
  }

  const ellipsis = "...";
  const ellipsisWidth = context.measureText(ellipsis).width;
  const words = title.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return ellipsis;

  let fitted = "";

  for (const word of words) {
    const candidate = fitted ? `${fitted} ${word}` : word;
    if (context.measureText(candidate).width + ellipsisWidth > maxWidth) {
      break;
    }
    fitted = candidate;
  }

  if (!fitted) {
    return ellipsis;
  }

  return `${fitted}${ellipsis}`;
}

export default function SourceTitle({ title, className }: SourceTitleProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [displayTitle, setDisplayTitle] = useState(title);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateTitle = () => {
      const computed = window.getComputedStyle(element);
      const font = [
        computed.fontStyle,
        computed.fontVariant,
        computed.fontWeight,
        computed.fontStretch,
        computed.fontSize,
        computed.lineHeight === "normal" ? "" : `/${computed.lineHeight}`,
        computed.fontFamily,
      ]
        .filter(Boolean)
        .join(" ");

      setDisplayTitle(trimToWordBoundary(title, element.clientWidth, font));
    };

    updateTitle();

    const observer = new ResizeObserver(() => {
      updateTitle();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [title]);

  return (
    <span ref={ref} className={className} title={title}>
      {displayTitle}
    </span>
  );
}
