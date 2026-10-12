"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BackLink from "@/app/back-link";
import { clampImageFocus, DEFAULT_IMAGE_FOCUS } from "@/app/lib/image-focus";
import { STORY_IMAGE_ACCEPT, STORY_IMAGE_MAX_BYTES } from "@/app/lib/story-images";
import type { StoryWithViews } from "@/app/lib/types";
import { ADMIN_PANEL } from "@/app/lib/surfaces";

type Notice = { tone: "error" | "info" | "success"; text: string } | null;

function todayInNewYork() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function defaultGraphicHeadline(title: string) {
  const trimmed = title.trim();
  if (trimmed.length <= 72) return trimmed;
  const shortened = trimmed.slice(0, 69);
  const wordBoundary = shortened.lastIndexOf(" ");
  return `${(wordBoundary > 40 ? shortened.slice(0, wordBoundary) : shortened).trim()}…`;
}

function previewKey(storyId: string, headline: string, date: string, focusX: number, focusY: number, image: File | null) {
  const imageKey = image ? `${image.name}:${image.size}:${image.lastModified}` : "story-image";
  return `${storyId}\n${headline.trim()}\n${date}\n${focusX}\n${focusY}\n${imageKey}`;
}

export default function FacebookPublisher() {
  const [stories, setStories] = useState<StoryWithViews[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState("");
  const [headline, setHeadline] = useState("");
  const [date, setDate] = useState(todayInNewYork);
  const [focusX, setFocusX] = useState(DEFAULT_IMAGE_FOCUS);
  const [focusY, setFocusY] = useState(DEFAULT_IMAGE_FOCUS);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewedKey, setPreviewedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"preview" | "download" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const selectedStory = useMemo(() => stories.find((story) => story.id === selectedStoryId) ?? null, [selectedStoryId, stories]);
  const currentPreviewKey = previewKey(selectedStoryId, headline, date, focusX, focusY, uploadedImage);
  const previewIsCurrent = Boolean(previewUrl && previewedKey === currentPreviewKey);
  const sourceImageUrl = uploadedImageUrl || selectedStory?.image_url || "";

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setLoading(true);
      try {
        const storiesResponse = await fetch("/api/stories?statuses=published&limit=250", { cache: "no-store" });
        const storiesJson = (await storiesResponse.json().catch(() => [])) as StoryWithViews[] | { error?: string };
        if (!storiesResponse.ok) {
          throw new Error(!Array.isArray(storiesJson) && storiesJson.error ? storiesJson.error : "We couldn't load published stories.");
        }
        const storyList = Array.isArray(storiesJson) ? storiesJson : [];
        if (cancelled) return;
        setStories(storyList);
        setSelectedStoryId(storyList.find((story) => story.image_url)?.id ?? storyList[0]?.id ?? "");
      } catch (error) {
        if (!cancelled) setNotice({ tone: "error", text: error instanceof Error ? error.message : "We couldn't load the Facebook publisher." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPageData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedStory) {
      setHeadline("");
      setUploadedImage(null);
      return;
    }
    setHeadline(defaultGraphicHeadline(selectedStory.title));
    setFocusX(clampImageFocus(selectedStory.image_focus_x));
    setFocusY(clampImageFocus(selectedStory.image_focus_y));
    setUploadedImage(null);
    setPreviewedKey("");
  }, [selectedStory]);

  useEffect(() => {
    if (!uploadedImage) {
      setUploadedImageUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(uploadedImage);
    setUploadedImageUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [uploadedImage]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function generatePreview() {
    if (!selectedStory) return;
    setBusyAction("preview");
    setNotice(null);
    try {
      const response = await fetch("/api/admin/facebook/preview", {
        method: "POST",
        body: createGraphicFormData(),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "We couldn't create the graphic preview.");
      }
      const image = await response.blob();
      const nextUrl = URL.createObjectURL(image);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
      setPreviewedKey(previewKey(selectedStory.id, headline, date, focusX, focusY, uploadedImage));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "We couldn't create the graphic preview." });
    } finally {
      setBusyAction(null);
    }
  }

  function createGraphicFormData(download = false) {
    const formData = new FormData();
    formData.set("date", date);
    formData.set("focusX", String(focusX));
    formData.set("focusY", String(focusY));
    formData.set("headline", headline);
    formData.set("storyId", selectedStoryId);
    if (uploadedImage) formData.set("image", uploadedImage);
    if (download) formData.set("download", "true");
    return formData;
  }

  async function downloadHighResolutionImage() {
    if (!selectedStory || !previewIsCurrent) return;
    setBusyAction("download");
    setNotice(null);
    try {
      const response = await fetch("/api/admin/facebook/preview", {
        method: "POST",
        body: createGraphicFormData(true),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "We couldn't download the high-resolution image.");
      }
      const image = await response.blob();
      const objectUrl = URL.createObjectURL(image);
      const filenameSlug = selectedStory.title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 72) || "story";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `the-beacon-${filenameSlug}-facebook-hd.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setNotice({ tone: "success", text: "Downloaded the 2400 × 2400 high-resolution PNG." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "We couldn't download the high-resolution image." });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-900 p-5 text-neutral-100 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <BackLink href="/admin" label="Admin control center" />
        <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin · Social</div>
            <h1 className="mt-2 text-3xl font-bold">Facebook graphic maker</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
              Choose a published story, review the Beacon graphic, then download a high-resolution PNG to post wherever you like.
            </p>
          </div>
          <Link href="/admin/editor" className="w-fit rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
            Open story editor
          </Link>
        </div>

        {notice ? (
          <div className={`mt-6 rounded-xl border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-900 bg-red-950/40 text-red-200" : notice.tone === "success" ? "border-emerald-900 bg-emerald-950/30 text-emerald-200" : "border-neutral-800 bg-neutral-900 text-neutral-300"}`}>
            {notice.text}
          </div>
        ) : null}

        {loading ? <p className="mt-8 text-sm text-neutral-500">Loading Facebook publisher…</p> : null}
        {!loading && stories.length === 0 ? (
          <section className={`${ADMIN_PANEL} mt-6 p-5 text-sm text-neutral-400`}>There are no published stories available yet.</section>
        ) : null}
        {!loading && stories.length > 0 ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <section className={`${ADMIN_PANEL} p-5 sm:p-6`}>
              <h2 className="text-lg font-semibold">Graphic details</h2>
              <label className="mt-5 block text-sm font-medium text-neutral-300" htmlFor="facebook-story">Published story</label>
              <select
                id="facebook-story"
                value={selectedStoryId}
                onChange={(event) => setSelectedStoryId(event.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-amber-300"
              >
                {stories.map((story) => <option key={story.id} value={story.id}>{story.title} · {story.image_url ? "Has image" : "No image"}</option>)}
              </select>
              {selectedStory ? (
                <p className="mt-2 text-xs text-neutral-500">Selected story: {selectedStory.image_url ? "has an image" : "no image attached"}</p>
              ) : null}

              <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
                <label className="block text-sm font-medium text-neutral-200" htmlFor="facebook-image">Post image</label>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  {selectedStory?.image_url
                    ? "Using the story image. Choose another image to override it for this Facebook post only."
                    : "This story has no image. Upload one for this Facebook post; it won’t change the story on the site."}
                </p>
                <input
                  key={selectedStoryId}
                  id="facebook-image"
                  type="file"
                  accept={STORY_IMAGE_ACCEPT}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file && file.size > STORY_IMAGE_MAX_BYTES) {
                      setNotice({ tone: "error", text: "Choose an image that is 5 MB or smaller." });
                      event.target.value = "";
                      return;
                    }
                    setNotice(null);
                    setUploadedImage(file);
                  }}
                  className="mt-3 block w-full text-sm text-neutral-300 file:mr-3 file:rounded-full file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-neutral-100 hover:file:bg-neutral-700"
                />
                {uploadedImage ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
                    <span className="break-all">Using upload: {uploadedImage.name}</span>
                    <button type="button" onClick={() => setUploadedImage(null)} className="text-amber-200 underline underline-offset-2">{selectedStory?.image_url ? "Use story image" : "Remove upload"}</button>
                  </div>
                ) : null}
              </div>

              <label className="mt-5 block text-sm font-medium text-neutral-300" htmlFor="facebook-date">Graphic date</label>
              <input
                id="facebook-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-amber-300"
              />

              <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-200">Image position</h3>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">Adjust the crop before previewing. Wide images use horizontal position; tall images use vertical position.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setFocusX(DEFAULT_IMAGE_FOCUS); setFocusY(DEFAULT_IMAGE_FOCUS); }}
                    className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-800"
                  >
                    Center image
                  </button>
                </div>
                <label className="mt-4 flex items-center gap-4 text-xs text-neutral-400" htmlFor="facebook-focus-x">
                  <span className="w-28 shrink-0">Horizontal</span>
                  <input
                    id="facebook-focus-x"
                    type="range"
                    min="0"
                    max="100"
                    value={focusX}
                    onChange={(event) => setFocusX(Number(event.target.value))}
                    className="min-w-0 flex-1 accent-amber-300"
                  />
                  <span className="w-10 text-right tabular-nums">{focusX}%</span>
                </label>
                <label className="mt-3 flex items-center gap-4 text-xs text-neutral-400" htmlFor="facebook-focus-y">
                  <span className="w-28 shrink-0">Vertical</span>
                  <input
                    id="facebook-focus-y"
                    type="range"
                    min="0"
                    max="100"
                    value={focusY}
                    onChange={(event) => setFocusY(Number(event.target.value))}
                    className="min-w-0 flex-1 accent-amber-300"
                  />
                  <span className="w-10 text-right tabular-nums">{focusY}%</span>
                </label>
              </div>

              <label className="mt-5 block text-sm font-medium text-neutral-300" htmlFor="facebook-headline">Graphic headline</label>
              <input
                id="facebook-headline"
                value={headline}
                maxLength={100}
                onChange={(event) => setHeadline(event.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-amber-300"
              />
              <p className="mt-1 text-xs text-neutral-500">This appears in large type across the bottom of the square graphic.</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!selectedStory || busyAction !== null || !headline.trim() || !date || (!selectedStory.image_url && !uploadedImage)}
                  onClick={() => void generatePreview()}
                  className="rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyAction === "preview" ? "Building preview…" : "Refresh graphic preview"}
                </button>
                <button
                  type="button"
                  disabled={!previewIsCurrent || busyAction !== null || Boolean(selectedStory && !selectedStory.image_url && !uploadedImage)}
                  onClick={() => void downloadHighResolutionImage()}
                  className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-bold text-neutral-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title={!previewIsCurrent ? "Build and review the current graphic preview first" : undefined}
                >
                  {busyAction === "download" ? "Preparing HD download…" : "Download HD image · 2400 × 2400"}
                </button>
              </div>
              {previewUrl && !previewIsCurrent ? <p className="mt-3 text-xs text-amber-200">Refresh the preview after changing the story, image, date, headline, or image position.</p> : null}
            </section>

            <section className={`${ADMIN_PANEL} p-5 sm:p-6`}>
              <h2 className="text-lg font-semibold">Graphic preview</h2>
              {previewIsCurrent && previewUrl ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
                  <Image src={previewUrl} alt="Preview of the Facebook post graphic" width={1200} height={1200} unoptimized className="h-auto w-full" />
                </div>
              ) : sourceImageUrl ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
                  <Image src={sourceImageUrl} alt={selectedStory?.title ?? "Facebook post image"} width={1200} height={1200} unoptimized style={{ objectPosition: `${focusX}% ${focusY}%` }} className="aspect-square h-auto w-full object-cover opacity-70" />
                  <p className="px-4 py-3 text-xs text-neutral-500">Build the preview to see the post image with the date, Beacon mark, headline, and footer.</p>
                </div>
              ) : (
                <div className="mt-4 flex aspect-square items-center justify-center rounded-lg border border-dashed border-neutral-700 text-sm text-neutral-500">Choose a story with an image.</div>
              )}
              <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 text-sm leading-6 text-neutral-300">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Export</div>
                <p>Download a 2400 × 2400 PNG after reviewing the graphic. The downloaded file is ready to upload to Facebook or reuse elsewhere.</p>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
