import type { StoryImageDisplay } from "@/app/lib/types";

export type StoryImageVariant = "home-lead" | "home-card" | "briefing-lead" | "briefing-card";

const EXTREME_IMAGE_RATIOS: Record<StoryImageVariant, { max: number; min: number }> = {
  "home-lead": { min: 0.72, max: 2.45 },
  "home-card": { min: 0.95, max: 1.9 },
  "briefing-lead": { min: 0.72, max: 2.45 },
  "briefing-card": { min: 0.88, max: 2.1 },
};

export function shouldUseContainedStoryImage(
  display: StoryImageDisplay | null | undefined,
  aspectRatio: number | null | undefined,
  variant: StoryImageVariant
) {
  if (display === "contain") return true;
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return false;

  const thresholds = EXTREME_IMAGE_RATIOS[variant];
  return aspectRatio < thresholds.min || aspectRatio > thresholds.max;
}
