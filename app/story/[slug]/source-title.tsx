"use client";

import { useEffect, useRef, useState } from "react";

type SourceTitleProps = {
  title: string;
  className?: string;
};

function measureTextWidth(text: string, sourceElement: HTMLElement) {
  if (typeof window === "undefined") return text.length;
  const computed = window.getComputedStyle(sourceElement);
  const measurer = document.createElement("span");

  measurer.style.position = "absolute";
  measurer.style.visibility = "hidden";
  measurer.style.pointerEvents = "none";
  measurer.style.whiteSpace = "nowrap";
  measurer.style.font = computed.font;
  measurer.style.fontFamily = computed.fontFamily;
  measurer.style.fontSize = computed.fontSize;
  measurer.style.fontWeight = computed.fontWeight;
  measurer.style.letterSpacing = computed.letterSpacing;
  measurer.style.textTransform = computed.textTransform;
  measurer.textContent = text;

  document.body.appendChild(measurer);
  const width = measurer.getBoundingClientRect().width;
  document.body.removeChild(measurer);

  return width;
}

function trimToWordBoundary(title: string, maxWidth: number, element: HTMLElement) {
  if (typeof window === "undefined") return title;
  if (measureTextWidth(title, element) <= maxWidth) {
    return title;
  }

  const ellipsis = "...";
  const ellipsisWidth = measureTextWidth(ellipsis, element);
  const words = title.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return ellipsis;

  let low = 0;
  let high = words.length;
  let fitted = "";

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = words.slice(0, mid).join(" ");

    if (measureTextWidth(candidate, element) + ellipsisWidth <= maxWidth) {
      fitted = candidate;
      low = mid;
    } else {
      high = mid - 1;
    }
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
      setDisplayTitle(trimToWordBoundary(title, element.clientWidth, element));
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
