"use client";

import Image from "next/image";
import Link from "next/link";
import BackLink from "@/app/back-link";

type PageBrandHeaderProps = {
  backHref: string;
};

export default function PageBrandHeader({ backHref }: PageBrandHeaderProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
      <BackLink href={backHref} className="justify-self-start" />
      <div className="justify-self-center text-center">
        <Link href="/" aria-label="Go to The Beacon home page" className="inline-block">
          <Image
            src="/small logo.png"
            alt="The Beacon"
            width={600}
            height={140}
            priority
            className="h-auto w-[122px] sm:w-[144px] md:w-[168px]"
          />
        </Link>
        <p className="mt-1 hidden text-[11px] text-neutral-500 sm:block md:text-xs">One Story, Multiple Perspectives.</p>
      </div>
      <div />
    </div>
  );
}
