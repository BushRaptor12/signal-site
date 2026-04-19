"use client";

import { useMemo } from "react";

function formatLocalUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

type LocalBriefingUpdatedProps = {
  value: string | null;
};

export default function LocalBriefingUpdated({ value }: LocalBriefingUpdatedProps) {
  const formatted = useMemo(() => (value ? formatLocalUpdatedAt(value) : "--"), [value]);

  return (
    <time dateTime={value ?? undefined} suppressHydrationWarning>
      {formatted}
    </time>
  );
}
