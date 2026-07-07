"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { imageObjectPosition } from "@/app/lib/image-focus";
import type { StoryWithViews } from "@/app/lib/types";

const STORY_BATCH_SIZE = 10;
const INITIAL_LAYOUT_STORY_POOL = 20;
const SIDE_RAIL_UNITS = 6;
const SIDE_IMAGE_UNITS = 2;
const SIDE_RAIL_TALL_IMAGE_MAX_RATIO = 0.95;
const SIDE_RAIL_SECOND_SUMMARY_MAX_CHARS = 90;

type SideRailItem = {
  kind: "image" | "text";
  story: StoryWithViews;
};

type SideRailResult = {
  items: SideRailItem[];
  usedImageCount: number;
  usedTextCount: number;
};

function hasHomepageImage(story: StoryWithViews) {
  return Boolean(story.image_url) && story.image_show_on_homepage !== false;
}

function storyDateLabel(story: StoryWithViews) {
  const value = story.created_at ?? story.date;
  const date = new Date(value ?? "");

  if (!Number.isFinite(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function StoryImage({
  compact = false,
  fixedFrame = false,
  onImageLoad,
  priority = false,
  story,
}: {
  compact?: boolean;
  fixedFrame?: boolean;
  onImageLoad?: (image: HTMLImageElement) => void;
  priority?: boolean;
  story: StoryWithViews;
}) {
  if (!hasHomepageImage(story)) return null;

  const contained = story.image_display === "contain";
  const frameClass =
    "relative overflow-hidden rounded-[12px] border border-[#1d3b56]/75 bg-[#020b14] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_14px_34px_rgba(0,0,0,0.22)]";
  const insetShadow = "pointer-events-none absolute inset-0 rounded-[12px] shadow-[inset_0_0_30px_rgba(2,11,20,0.3)]";

  if (contained) {
    const maxHeightClass = fixedFrame ? "max-h-[8.5rem]" : compact ? "max-h-[22rem]" : "max-h-[38rem]";

    return (
      <div className="flex justify-center">
        <div className={`inline-block max-w-full ${frameClass}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={story.image_url!}
            alt={story.title}
            decoding="async"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            onLoad={(event) => onImageLoad?.(event.currentTarget)}
            className={`mx-auto block max-w-full rounded-[11px] object-contain ${maxHeightClass}`}
          />
          <div className={insetShadow} />
        </div>
      </div>
    );
  }

  const aspectClass = fixedFrame && compact ? "aspect-[16/8]" : compact ? "aspect-[4/3] sm:aspect-[5/4]" : "aspect-[16/10]";

  return (
    <div className={frameClass}>
      <div className={`relative ${aspectClass}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={story.image_url!}
          alt={story.title}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={(event) => onImageLoad?.(event.currentTarget)}
          className={`absolute inset-0 h-full w-full transition duration-500 group-hover:scale-[1.015] ${contained ? "object-contain p-2" : "object-cover"}`}
          style={{ objectPosition: imageObjectPosition(story) }}
        />
      </div>
      <div className={insetShadow} />
    </div>
  );
}

function LeadStory({ story }: { story: StoryWithViews }) {
  const date = storyDateLabel(story);

  return (
    <Link href={`/story/${story.id}?from=section`} className="group flex self-start flex-col rounded-[14px] border border-[#183149]/70 bg-[#07131e] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.18)] transition hover:border-[#8f7740]/45 hover:bg-[#071622] sm:p-6 lg:h-full">
      <div>
        <StoryImage priority story={story} />
        <h1 className={hasHomepageImage(story) ? "mt-5 text-3xl font-semibold leading-tight text-neutral-100 transition group-hover:text-[#d7c08d] sm:text-4xl" : "text-3xl font-semibold leading-tight text-neutral-100 transition group-hover:text-[#d7c08d] sm:text-4xl"}>
          {story.title}
        </h1>
        {story.summary[0] ? (
          <p className="mt-4 text-base leading-[1.55] text-neutral-300 sm:text-lg">{story.summary[0]}</p>
        ) : null}
      </div>
      {date ? <div className="mt-auto pt-5 text-xs font-medium text-neutral-500">{date}</div> : null}
    </Link>
  );
}

function SideTextStoryCard({ story }: { story: StoryWithViews }) {
  const date = storyDateLabel(story);

  return (
    <Link href={`/story/${story.id}?from=section`} className="group flex min-h-0 flex-col justify-between overflow-hidden rounded-[12px] border border-[#183149]/65 bg-[#07131e] px-4 py-4 shadow-[0_10px_22px_rgba(0,0,0,0.12)] transition hover:border-[#8f7740]/45 hover:bg-[#071622] sm:px-5 lg:h-full">
      <div className="min-w-0">
        <h2 className="line-clamp-3 text-base font-semibold leading-snug text-neutral-100 transition group-hover:text-[#d7c08d]">
          {story.title}
        </h2>
        {story.summary[0] ? <p className="mt-2 line-clamp-2 text-xs leading-[1.4] text-neutral-400 xl:text-sm">{story.summary[0]}</p> : null}
      </div>
      {date ? <div className="mt-3 text-xs font-medium text-neutral-500">{date}</div> : null}
    </Link>
  );
}

function SideImageStoryCard({ story }: { story: StoryWithViews }) {
  const date = storyDateLabel(story);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const useHorizontalRailLayout =
    aspectRatio && Number.isFinite(aspectRatio) ? aspectRatio < SIDE_RAIL_TALL_IMAGE_MAX_RATIO : story.image_display === "contain";
  const availableSummaryPoints = story.summary.filter(Boolean);
  const firstSummary = availableSummaryPoints[0] ?? "";
  const canShowSecondSummary =
    useHorizontalRailLayout && firstSummary.length > 0 && firstSummary.length <= SIDE_RAIL_SECOND_SUMMARY_MAX_CHARS;
  const summaryPoints = useHorizontalRailLayout && canShowSecondSummary ? availableSummaryPoints.slice(0, 2) : availableSummaryPoints.slice(0, 1);

  function updateAspectRatio(image: HTMLImageElement) {
    if (!image.naturalWidth || !image.naturalHeight) return;
    setAspectRatio((current) => current ?? image.naturalWidth / image.naturalHeight);
  }

  if (useHorizontalRailLayout) {
    return (
      <Link href={`/story/${story.id}?from=section`} className="group grid min-h-0 grid-cols-[minmax(0,1fr)_6.75rem] gap-3 overflow-hidden rounded-[12px] border border-[#183149]/65 bg-[#07131e] p-4 shadow-[0_10px_22px_rgba(0,0,0,0.14)] transition hover:border-[#8f7740]/45 hover:bg-[#071622] sm:grid-cols-[minmax(0,1fr)_7.5rem] lg:h-full">
        <div className="flex min-w-0 flex-col justify-between">
          <div>
            <h2 className="line-clamp-3 text-base font-semibold leading-tight text-neutral-100 transition group-hover:text-[#d7c08d]">
              {story.title}
            </h2>
            {summaryPoints.length > 0 ? (
              <div className="mt-2.5 space-y-2">
                {summaryPoints.map((point, index) => (
                  <p key={`${story.id}-side-summary-${index}`} className={`${index === 0 && !canShowSecondSummary ? "line-clamp-4" : "line-clamp-2"} text-xs leading-[1.45] text-neutral-400 xl:text-sm`}>
                    {point}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          {date ? <div className="mt-3 text-xs font-medium text-neutral-500">{date}</div> : null}
        </div>
        <div className="flex min-h-0 items-start justify-end">
          <div className="relative inline-block max-h-full max-w-full overflow-hidden rounded-[10px] border border-[#1d3b56]/75 bg-[#020b14]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={story.image_url!}
              alt={story.title}
              decoding="async"
              loading="lazy"
              onLoad={(event) => updateAspectRatio(event.currentTarget)}
              className="block max-h-[11.5rem] max-w-full rounded-[9px] object-contain"
            />
            <div className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[inset_0_0_24px_rgba(2,11,20,0.28)]" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/story/${story.id}?from=section`} className="group flex min-h-0 flex-col justify-between overflow-hidden rounded-[12px] border border-[#183149]/65 bg-[#07131e] p-4 shadow-[0_10px_22px_rgba(0,0,0,0.14)] transition hover:border-[#8f7740]/45 hover:bg-[#071622] lg:h-full">
      <div className="min-w-0">
        <StoryImage compact fixedFrame onImageLoad={updateAspectRatio} story={story} />
        <h2 className="mt-3 line-clamp-2 text-base font-semibold leading-tight text-neutral-100 transition group-hover:text-[#d7c08d]">
          {story.title}
        </h2>
        {summaryPoints[0] ? <p className="mt-2 line-clamp-2 text-xs leading-[1.4] text-neutral-400">{summaryPoints[0]}</p> : null}
      </div>
      {date ? <div className="mt-3 text-xs font-medium text-neutral-500">{date}</div> : null}
    </Link>
  );
}

function buildSideRailItems(textStories: StoryWithViews[], imageStories: StoryWithViews[]): SideRailResult {
  const items: SideRailItem[] = [];
  let remainingUnits = SIDE_RAIL_UNITS;
  const preferredTextCount = imageStories.length > 0 ? Math.min(textStories.length, 4) : Math.min(textStories.length, SIDE_RAIL_UNITS);

  for (const story of textStories.slice(0, preferredTextCount)) {
    items.push({ kind: "text", story });
    remainingUnits -= 1;
  }

  let usedImageCount = 0;
  while (remainingUnits >= SIDE_IMAGE_UNITS && usedImageCount < imageStories.length) {
    items.push({ kind: "image", story: imageStories[usedImageCount] });
    usedImageCount += 1;
    remainingUnits -= SIDE_IMAGE_UNITS;
  }

  let usedTextCount = preferredTextCount;
  while (remainingUnits > 0 && usedTextCount < textStories.length) {
    items.push({ kind: "text", story: textStories[usedTextCount] });
    usedTextCount += 1;
    remainingUnits -= 1;
  }

  return { items, usedImageCount, usedTextCount };
}

function buildBelowGridStories(imageStories: StoryWithViews[], textStories: StoryWithViews[]) {
  const imageSlots = imageStories.slice(0, 4);
  const textSlots = textStories.slice(0, 4 - imageSlots.length);

  return {
    stories: [...imageSlots, ...textSlots],
    usedImageCount: imageSlots.length,
    usedTextCount: textSlots.length,
  };
}

function SideRail({ items }: { items: SideRailItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid items-start gap-3 lg:h-[49rem] lg:grid-rows-6 lg:items-stretch">
      {items.map((item) =>
        item.kind === "image" ? (
          <div key={item.story.id} className="lg:row-span-2">
            <SideImageStoryCard story={item.story} />
          </div>
        ) : (
          <SideTextStoryCard key={item.story.id} story={item.story} />
        )
      )}
    </div>
  );
}

function SecondaryStoryItem({ story }: { story: StoryWithViews }) {
  const showImage = hasHomepageImage(story);
  const date = storyDateLabel(story);
  const summaryPoints = story.summary.filter(Boolean).slice(0, showImage ? 1 : 2);

  return (
    <Link
      href={`/story/${story.id}?from=section`}
      className={`group h-full rounded-[12px] border border-[#183149]/65 bg-[#07131e] p-4 shadow-[0_10px_22px_rgba(0,0,0,0.12)] transition hover:border-[#8f7740]/45 hover:bg-[#071622] ${
        showImage ? "grid gap-3 sm:grid-cols-[7.5rem_1fr] sm:grid-rows-[1fr_auto]" : "flex flex-col sm:p-5"
      }`}
    >
      {showImage ? (
        story.image_display === "contain" ? (
          <div className="flex items-start sm:min-h-[6.75rem]">
            <div className="inline-block max-w-full overflow-hidden rounded-[10px] border border-[#1d3b56]/75 bg-[#020b14]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={story.image_url!}
                alt={story.title}
                decoding="async"
                loading="lazy"
                className="block max-h-[7.5rem] max-w-full rounded-[9px] object-contain"
              />
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[10px] border border-[#1d3b56]/75 bg-[#020b14] sm:h-full sm:min-h-[6.75rem]">
            <div className="relative aspect-[16/10] sm:h-full sm:aspect-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={story.image_url!}
                alt={story.title}
                decoding="async"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
                style={{ objectPosition: imageObjectPosition(story) }}
              />
            </div>
          </div>
        )
      ) : null}
      <div className={showImage ? "min-w-0" : "min-w-0"}>
        <h2 className={`${showImage ? "line-clamp-3" : "line-clamp-4"} text-base font-semibold leading-snug text-neutral-100 transition group-hover:text-[#d7c08d] sm:text-lg`}>
          {story.title}
        </h2>
        {summaryPoints.length > 0 ? (
          <div className="mt-3 space-y-2.5">
            {summaryPoints.map((point, index) => (
              <p key={`${story.id}-secondary-summary-${index}`} className="line-clamp-2 text-sm leading-[1.5] text-neutral-400">
                {point}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      {date ? <div className={`text-xs font-medium text-neutral-500 ${showImage ? "sm:col-span-2" : "mt-auto pt-4"}`}>{date}</div> : null}
    </Link>
  );
}

function SecondaryStoryList({ stories }: { stories: StoryWithViews[] }) {
  if (stories.length === 0) return null;

  return (
    <section className="grid gap-3 md:grid-cols-2">
      {stories.map((story) => (
        <SecondaryStoryItem key={story.id} story={story} />
      ))}
    </section>
  );
}

function TextStoryGroup({ stories }: { stories: StoryWithViews[] }) {
  if (stories.length === 0) return null;

  return (
    <section className="self-start rounded-[12px] border border-[#183149]/65 bg-[#07131e] shadow-[0_10px_22px_rgba(0,0,0,0.12)]">
      <div className="divide-y divide-[#163754]/60">
        {stories.map((story) => (
          <Link key={story.id} href={`/story/${story.id}?from=section`} className="group block px-4 py-4 transition hover:bg-[#0a1926] sm:px-5">
            <h2 className="text-base font-semibold leading-snug text-neutral-100 transition group-hover:text-[#d7c08d] sm:text-lg">
              {story.title}
            </h2>
            {story.summary[0] ? (
              <p className="mt-1.5 line-clamp-2 text-sm leading-[1.45] text-neutral-400">{story.summary[0]}</p>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function SectionStories({ stories }: { stories: StoryWithViews[] }) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_LAYOUT_STORY_POOL);
  const layoutStories = useMemo(() => stories.slice(0, visibleCount), [stories, visibleCount]);
  const visualLead = layoutStories.find(hasHomepageImage) ?? layoutStories[0] ?? null;
  const rest = layoutStories.filter((story) => story.id !== visualLead?.id);
  const textStories = rest.filter((story) => !hasHomepageImage(story));
  const imageStories = rest.filter(hasHomepageImage);
  const sideRail = buildSideRailItems(textStories, imageStories);
  const remainingImageStories = imageStories.slice(sideRail.usedImageCount);
  const remainingTextCandidates = textStories.slice(sideRail.usedTextCount);
  const belowGrid = buildBelowGridStories(remainingImageStories, remainingTextCandidates);
  const belowStories = belowGrid.stories;
  const remainingTextStories = remainingTextCandidates.slice(belowGrid.usedTextCount);

  if (!visualLead) return null;

  return (
      <div className="grid gap-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.85fr)]">
          <LeadStory story={visualLead} />
          <SideRail items={sideRail.items} />
        </div>

      <SecondaryStoryList stories={belowStories} />

      {remainingTextStories.length > 0 ? (
        <TextStoryGroup stories={remainingTextStories} />
      ) : null}

      {visibleCount < stories.length ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((current) => Math.min(current + STORY_BATCH_SIZE, stories.length))}
            className="min-h-11 rounded-full border border-[#8f7740]/70 bg-[#07101a] px-6 py-2.5 text-sm font-semibold text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724]"
          >
            Read more
          </button>
        </div>
      ) : null}
    </div>
  );
}
