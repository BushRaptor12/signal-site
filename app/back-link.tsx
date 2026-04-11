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
      className={`inline-flex w-fit rounded-full border border-[#0d2438] bg-[#020b14] px-5 py-2 text-sm text-[#d7e2ef] transition hover:border-[#163754] hover:bg-[#03101b] ${className}`.trim()}
    >
      {label}
    </Link>
  );
}
