"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { imageObjectPosition } from "@/app/lib/image-focus";
import type { StoryWithViews } from "@/app/lib/types";
import { normalize, TOPICS, toTitleCase } from "@/app/lib/vocab";

type HomeNewsTabsProps = {
  initialNowMs: number;
  stories: StoryWithViews[];
};

const TAB_KEYS = ["popular", "recent", ...TOPICS.map((topic) => normalize(topic))];

function publishedAtMs(story: StoryWithViews): number {
  const created = new Date(story.created_at ?? "").getTime();
  if (Number.isFinite(created) && created > 0) return created;

  const dateOnly = new Date(story.date ?? "").getTime();
  return Number.isFinite(dateOnly) ? dateOnly : 0;
}

function updatedAtMs(story: StoryWithViews): number {
  const contentUpdated = new Date(story.content_updated_at ?? "").getTime();
  if (Number.isFinite(contentUpdated) && contentUpdated > 0) return contentUpdated;

  const updated = new Date(story.updated_at ?? "").getTime();
  if (Number.isFinite(updated) && updated > 0) return updated;

  return publishedAtMs(story);
}

function popularScore(story: StoryWithViews, nowMs: number): number {
  const hoursSincePublish = Math.max(0, (nowMs - publishedAtMs(story)) / 3_600_000);
  return Number(story.views ?? 0) / (hoursSincePublish + 2);
}

function sortPopular(stories: StoryWithViews[], nowMs: number) {
  return [...stories].sort((left, right) => {
    const score = popularScore(right, nowMs) - popularScore(left, nowMs);
    if (score !== 0) return score;

    const views = Number(right.views ?? 0) - Number(left.views ?? 0);
    if (views !== 0) return views;

    return updatedAtMs(right) - updatedAtMs(left);
  });
}

function tabLabel(tab: string) {
  if (tab === "popular") return "Popular";
  if (tab === "recent") return "Latest";
  return toTitleCase(tab);
}

function storyImage(story: StoryWithViews) {
  if (!story.image_url || story.image_show_on_homepage === false) return null;

  return (
    <div className="relative overflow-hidden rounded-[10px] border border-[#1d3b56]/75 bg-[#020b14] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_12px_28px_rgba(0,0,0,0.18)]">
      <div className="relative aspect-[16/10]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={story.image_url}
          alt={story.title}
          decoding="async"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
          style={{ objectPosition: imageObjectPosition(story) }}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[inset_0_0_26px_rgba(2,11,20,0.28)]" />
    </div>
  );
}

function StoryTease({ compact = false, story }: { compact?: boolean; story: StoryWithViews }) {
  return (
    <Link href={`/story/${story.id}?from=home-tab`} className="group block">
      {storyImage(story)}
      <div className={story.image_url && story.image_show_on_homepage !== false ? "mt-3" : ""}>
        <div className={compact ? "text-base font-semibold leading-snug text-neutral-100 transition group-hover:text-[#d7c08d]" : "text-xl font-semibold leading-tight text-neutral-100 transition group-hover:text-[#d7c08d] sm:text-2xl"}>
          {story.title}
        </div>
        {story.summary[0] ? (
          <p className={compact ? "mt-2 line-clamp-2 text-sm leading-[1.45] text-neutral-400" : "mt-3 line-clamp-3 text-sm leading-[1.5] text-neutral-300 sm:text-[15px]"}>
            {story.summary[0]}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export default function HomeNewsTabs({ initialNowMs, stories }: HomeNewsTabsProps) {
  const [activeTab, setActiveTab] = useState("popular");
  const visibleStories = useMemo(() => {
    if (activeTab === "recent") {
      return [...stories].sort((left, right) => publishedAtMs(right) - publishedAtMs(left));
    }

    if (activeTab !== "popular") {
      return [...stories]
        .filter((story) => story.topics.map(normalize).includes(activeTab))
        .sort((left, right) => publishedAtMs(right) - publishedAtMs(left));
    }

    return sortPopular(stories, initialNowMs);
  }, [activeTab, initialNowMs, stories]);

  const [lead, ...rest] = visibleStories;
  const sideStories = rest.slice(0, 2);
  const lowerStories = rest.slice(2, 5);

  if (!lead) return null;

  return (
    <section className="mb-7 rounded-[14px] border border-[#183149]/65 bg-[#06131e]/72 p-3 shadow-[0_12px_28px_rgba(0,0,0,0.14)] sm:mb-8 sm:p-4">
      <div className="-mx-1 flex min-w-0 items-center gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:none] sm:gap-5 [&::-webkit-scrollbar]:hidden">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 border-b-[3px] px-1 pb-2 text-sm font-semibold transition ${
              activeTab === tab
                ? "border-[#e3cca0] text-neutral-100"
                : "border-transparent text-[#c5d3e1] hover:border-[#30516d] hover:text-white"
            }`}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 border-t border-[#163754]/60 pt-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.75fr)]">
        <StoryTease story={lead} />

        {sideStories.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {sideStories.map((story) => (
              <StoryTease compact key={story.id} story={story} />
            ))}
          </div>
        ) : null}
      </div>

      {lowerStories.length > 0 ? (
        <div className="mt-4 grid gap-4 border-t border-[#163754]/60 pt-4 md:grid-cols-3">
          {lowerStories.map((story) => (
            <StoryTease compact key={story.id} story={story} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
