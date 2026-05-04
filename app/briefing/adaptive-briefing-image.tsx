"use client";

import Image from "next/image";
import { useState } from "react";
import { imageObjectPosition } from "@/app/lib/image-focus";
import { shouldUseContainedStoryImage } from "@/app/lib/story-image-layout";
import type { StoryWithViews } from "@/app/lib/types";

type AdaptiveBriefingImageProps = {
  priority?: boolean;
  story: StoryWithViews;
  variant: "briefing-card" | "briefing-lead";
};

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
          <div className="w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={story.image_url!}
              alt={alt}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              loading={priority ? "eager" : "lazy"}
              onLoad={(event) => updateAspectRatio(event.currentTarget)}
              className="mx-auto block max-h-[42rem] max-w-full object-contain"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="mt-5 flex justify-center">
        <div className="w-full max-w-[26rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={story.image_url!}
            alt={alt}
            decoding="async"
            loading="lazy"
            onLoad={(event) => updateAspectRatio(event.currentTarget)}
            className="mx-auto block max-h-[28rem] max-w-full object-contain"
          />
        </div>
      </div>
    );
  }

  if (variant === "briefing-lead") {
    return (
      <div className="relative mt-6 overflow-hidden">
        <div className="relative aspect-[4/3] md:aspect-[16/10]">
          <Image
            src={story.image_url!}
            alt={alt}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, 1152px"
            className="object-cover"
            style={{ objectPosition: imageObjectPosition(story) }}
            onLoad={(event) => updateAspectRatio(event.currentTarget)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-hidden">
      <div className="relative mx-auto aspect-[5/4] max-w-[22rem]">
        <Image
          src={story.image_url!}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 352px"
          className="object-cover"
          style={{ objectPosition: imageObjectPosition(story) }}
          onLoad={(event) => updateAspectRatio(event.currentTarget)}
        />
      </div>
    </div>
  );
}
