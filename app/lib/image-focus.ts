type FocusLike = {
  image_focus_x?: number | null;
  image_focus_y?: number | null;
};

export const DEFAULT_IMAGE_FOCUS = 50;

export function clampImageFocus(value: number | null | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_IMAGE_FOCUS;
  return Math.min(100, Math.max(0, Number(value)));
}

export function imageObjectPosition(value: FocusLike) {
  return `${clampImageFocus(value.image_focus_x)}% ${clampImageFocus(value.image_focus_y)}%`;
}
