"use client";

import Link from "next/link";
import { useEffect } from "react";
import { track } from "@vercel/analytics";

type FunnelProperties = Record<string, boolean | number | string | null | undefined>;

export function trackFunnelEvent(name: string, properties: FunnelProperties = {}) {
  track(name, Object.fromEntries(Object.entries(properties).filter(([, value]) => value != null)) as Record<string, boolean | number | string>);
}

export function FunnelView({ name, properties = {} }: { name: string; properties?: FunnelProperties }) {
  useEffect(() => {
    trackFunnelEvent(name, properties);
  }, [name, properties]);

  return null;
}

export function TrackedLink({
  children,
  className,
  eventName,
  href,
  properties = {},
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & {
  eventName: string;
  href: string;
  properties?: FunnelProperties;
}) {
  return (
    <Link
      {...props}
      href={href}
      className={className}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) {
          trackFunnelEvent(eventName, { href, ...properties });
        }
      }}
    >
      {children}
    </Link>
  );
}
