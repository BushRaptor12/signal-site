import Image from "next/image";
import Link from "next/link";
import { formatStoryDate, formatUpdatedAt } from "@/app/lib/dates";
import { imageObjectPosition } from "@/app/lib/image-focus";
import type { BriefingArchiveRecord, BriefingArchiveStory } from "@/app/lib/briefing-archive";

export function archiveTitle(capturedAt: string) {
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return "Archived briefing";

  return `Archived ${new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "long",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(date)}`;
}

export function archiveEyebrow() {
  return "Archived";
}

export function displayArchiveHeadline(story: BriefingArchiveStory) {
  return story.beacon_headline?.trim() || story.title;
}

function displayArchiveSummary(story: BriefingArchiveStory) {
  return story.beacon_summary?.trim() || story.summary[0] || "";
}

function leadSummaryPoints(story: BriefingArchiveStory) {
  const override = story.beacon_summary?.trim();
  if (override) {
    const points = override
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return points.length > 0 ? points.slice(0, 2) : [override];
  }

  return story.summary.map((line) => line.trim()).filter(Boolean).slice(0, 2);
}

function shouldShowImage(story: BriefingArchiveStory) {
  return Boolean(story.image_url) && (story.image_show_on_briefing ?? true);
}

function ArchiveStoryImage({ lead = false, story }: { lead?: boolean; story: BriefingArchiveStory }) {
  if (!shouldShowImage(story)) return null;

  return (
    <div className={lead ? "mt-6 overflow-hidden" : "mt-5 overflow-hidden"}>
      <div className={lead ? "relative aspect-[4/3] sm:aspect-[16/10]" : "relative mx-auto aspect-[5/4] max-w-[22rem]"}>
        <Image
          src={story.image_url!}
          alt={displayArchiveHeadline(story)}
          fill
          sizes={lead ? "(max-width: 768px) 100vw, 1152px" : "(max-width: 768px) 100vw, 352px"}
          className={story.image_display === "contain" ? "object-contain" : "object-cover"}
          style={{ objectPosition: imageObjectPosition(story) }}
        />
      </div>
    </div>
  );
}

function StoryMetaRow({ story }: { story: BriefingArchiveStory }) {
  return (
    <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
      {formatStoryDate(story.date)}
    </div>
  );
}

function ArchiveBriefingList({ stories }: { stories: BriefingArchiveStory[] }) {
  return (
    <div className="space-y-6">
      {stories.map((story) => (
        <Link
          key={`${story.beacon_position}-${story.beacon_order}-${story.id}`}
          href={`/story/${story.id}?from=briefing-archive`}
          className="relative flex flex-col justify-start rounded-[12px] border border-[#183149]/65 bg-[#07131e] p-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.2)] transition hover:border-[#28445d] sm:p-6"
        >
          <div className="text-[1.35rem] font-semibold leading-tight text-neutral-100 transition hover:text-[#d7c08d] sm:text-[1.85rem]">
            {displayArchiveHeadline(story)}
          </div>
          <StoryMetaRow story={story} />
          {displayArchiveSummary(story) ? (
            <p className="mt-3 text-[15px] leading-7 text-neutral-300">{displayArchiveSummary(story)}</p>
          ) : null}
          <ArchiveStoryImage story={story} />
        </Link>
      ))}
    </div>
  );
}

export function ArchiveTimestamp({ archive }: { archive: BriefingArchiveRecord }) {
  if (!archive.briefing_updated_at) return null;

  return (
    <div className="text-sm text-neutral-500">
      Briefing updated {formatUpdatedAt(archive.briefing_updated_at)}
    </div>
  );
}

export function ArchiveBriefingView({ archive }: { archive: BriefingArchiveRecord }) {
  const { lead, leftColumn, rightColumn } = archive.snapshot;
  const leadUsesAlertStyle = lead?.beacon_lead_style === "alert";
  const leadPoints = lead ? leadSummaryPoints(lead) : [];

  if (!lead) {
    return (
      <div className="mt-8 rounded-2xl border border-[#183149]/65 bg-[#07131e] px-5 py-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.3)] sm:px-6 sm:py-10">
        <h2 className="text-2xl font-semibold text-neutral-100 sm:text-3xl">No stories were archived</h2>
        <p className="mt-3 text-base text-neutral-400">This archive snapshot did not contain briefing stories.</p>
      </div>
    );
  }

  return (
    <>
      <Link
        href={`/story/${lead.id}?from=briefing-archive`}
        className={`relative block overflow-hidden rounded-[14px] border bg-[#07131e] p-4 shadow-[0_20px_46px_rgba(0,0,0,0.22)] transition sm:p-6 lg:p-8 ${
          leadUsesAlertStyle ? "border-red-500/55 hover:border-red-400" : "border-[#183149]/70 hover:border-[#28445d]"
        }`}
      >
        <div className="relative text-center">
          <div
            className={`font-semibold leading-tight transition md:text-6xl lg:leading-[0.95] ${
              leadUsesAlertStyle ? "text-3xl text-red-500 hover:text-red-400 sm:text-4xl" : "text-[2rem] text-neutral-100 hover:text-[#d7c08d] sm:text-[2.9rem]"
            }`}
          >
            {displayArchiveHeadline(lead)}
          </div>
          <StoryMetaRow story={lead} />

          {leadPoints.length > 0 ? (
            <div className="mx-auto mt-4 max-w-4xl space-y-3 text-base leading-7 text-neutral-300 sm:mt-5 sm:text-lg sm:leading-8">
              {leadPoints.map((point, index) => (
                <p key={`${lead.id}-summary-${index}`}>{point}</p>
              ))}
            </div>
          ) : null}
        </div>
        <ArchiveStoryImage lead story={lead} />
      </Link>

      {leftColumn.length > 0 || rightColumn.length > 0 ? (
        <section className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
          <ArchiveBriefingList stories={leftColumn} />
          <ArchiveBriefingList stories={rightColumn} />
        </section>
      ) : null}
    </>
  );
}
