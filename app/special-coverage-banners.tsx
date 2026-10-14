import Link from "next/link";
import { listCoverageHubs } from "@/app/lib/coverage-hubs.server";

export default async function SpecialCoverageBanners() {
  const hubs = (await listCoverageHubs()).filter((hub) => hub.activeCoverage === true);
  if (hubs.length === 0) return null;

  return (
    <div aria-label="Special coverage" className="w-full">
      {hubs.map((hub) => (
        <Link
          key={hub.slug}
          href={`/coverage/${hub.slug}`}
          className="group flex min-h-12 w-full items-center justify-center gap-2.5 border-y border-[#8f7740]/45 bg-gradient-to-r from-[#0a1722] via-[#172833] to-[#0a1722] px-4 py-1 text-center text-sm font-semibold tracking-[0.04em] text-neutral-100 transition-colors hover:from-[#10202d] hover:via-[#20333d] hover:to-[#10202d] sm:min-h-14 sm:gap-3 sm:text-base"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[#d7c08d] motion-safe:animate-pulse" />
          <span className="text-[#e3cca0]">SPECIAL COVERAGE:</span>
          <span>{hub.title}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="ml-0.5 size-4 shrink-0 fill-none stroke-current stroke-[1.8] text-[#d7c08d] transition-transform group-hover:translate-x-0.5 sm:size-[18px]">
            <path d="M3.5 10h12m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ))}
    </div>
  );
}
