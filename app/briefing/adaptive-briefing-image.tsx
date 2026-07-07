"use client";

import { useState } from "react";
import { imageObjectPosition } from "@/app/lib/image-focus";
import { shouldUseContainedStoryImage } from "@/app/lib/story-image-layout";
import type { StoryWithViews } from "@/app/lib/types";

type AdaptiveBriefingImageProps = {
  priority?: boolean;
  story: StoryWithViews;
  variant: "briefing-card" | "briefing-lead";
};

const imageFrameClass =
  "overflow-hidden rounded-[12px] border border-[#1d3b56]/75 bg-[#020b14] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_14px_34px_rgba(0,0,0,0.22)]";
const imageInsetShadowClass = "pointer-events-none absolute inset-0 rounded-[12px] shadow-[inset_0_0_30px_rgba(2,11,20,0.3)]";

export default function AdaptiveBriefingImage({ priority = false, story, variant }: AdaptiveBriefingImageProps) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const useContainedImage = shouldUseContainedStoryImage(story.image_display, aspectRatio, variant);
  const alt = story.beacon_headline?.trim() || story.title;

  function updateAspectRatio(image: HTMLImageElement) {
    if (!image.naturalWidth || !image.naturalHeight) return;
    setAspectRatio((current) => current ?? image.naturalWidth / image.naturalHeight);
  }

  if (useContainedImage) {
    if (variant === "briefing-lead") {
      return (
        <div className="relative mt-6 flex justify-center">
          <div className={`relative inline-block max-w-full ${imageFrameClass}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={story.image_url!}
              alt={alt}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              loading={priority ? "eager" : "lazy"}
              onLoad={(event) => updateAspectRatio(event.currentTarget)}
              className="mx-auto block max-h-[42rem] max-w-full rounded-[11px] object-contain"
            />
            <div className={imageInsetShadowClass} />
          </div>
        </div>
      );
    }

    return (
      <div className="mt-5 flex justify-center">
        <div className={`relative inline-block max-w-full ${imageFrameClass}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={story.image_url!}
            alt={alt}
            decoding="async"
            loading="lazy"
            onLoad={(event) => updateAspectRatio(event.currentTarget)}
            className="mx-auto block max-h-[28rem] max-w-full rounded-[11px] object-contain"
          />
          <div className={imageInsetShadowClass} />
        </div>
      </div>
    );
  }

  if (variant === "briefing-lead") {
    return (
      <div className={`relative mt-6 ${imageFrameClass}`}>
        <div className="relative aspect-[4/3] md:aspect-[16/10]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={story.image_url!}
            alt={alt}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            loading={priority ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
            style={{ objectPosition: imageObjectPosition(story) }}
            onLoad={(event) => updateAspectRatio(event.currentTarget)}
          />
          <div className={imageInsetShadowClass} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="relative mx-auto aspect-[5/4] w-full max-w-[22rem]">
        <div className={`absolute inset-0 ${imageFrameClass}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={story.image_url!}
            alt={alt}
            decoding="async"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
            style={{ objectPosition: imageObjectPosition(story) }}
            onLoad={(event) => updateAspectRatio(event.currentTarget)}
          />
          <div className={imageInsetShadowClass} />
        </div>
      </div>
    </div>
  );
}
