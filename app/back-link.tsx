"use client";

import Link from "next/link";

type BackLinkProps = {
  className?: string;
  href: string;
  label?: string;
};

export default function BackLink({ className = "", href, label = "Back" }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-block w-fit text-sm font-medium text-neutral-400 underline decoration-[#35556f]/55 decoration-1 underline-offset-4 transition hover:text-white hover:decoration-[#8f7740]/65 ${className}`.trim()}
    >
      <span>{`← ${label}`}</span>
    </Link>
  );
}
