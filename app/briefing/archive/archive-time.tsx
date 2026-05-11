"use client";

import { useMemo } from "react";

function toDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocal(value: string) {
  const date = toDate(value);
  if (!date) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function formatUtc(value: string) {
  const date = toDate(value);
  if (!date) return value;

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "long",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
}

export function ArchiveCapturedTitle({ value }: { value: string }) {
  const localTime = useMemo(() => formatLocal(value), [value]);
  const utcTime = useMemo(() => formatUtc(value), [value]);

  return (
    <>
      <time dateTime={value} suppressHydrationWarning>
        {localTime}
      </time>
      <span className="mt-2 block text-sm font-medium leading-6 text-neutral-500" suppressHydrationWarning>
        {utcTime}
      </span>
    </>
  );
}

export function ArchiveCapturedInline({ value }: { value: string }) {
  const localTime = useMemo(() => formatLocal(value), [value]);
  const utcTime = useMemo(() => formatUtc(value), [value]);

  return (
    <span suppressHydrationWarning>
      <time dateTime={value}>{localTime}</time>
      <span className="mx-2 text-[#35556f]">/</span>
      <span>{utcTime}</span>
    </span>
  );
}
