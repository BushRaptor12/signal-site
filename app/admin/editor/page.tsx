"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { DEFAULT_IMAGE_FOCUS, clampImageFocus, imageObjectPosition } from "@/app/lib/image-focus";
import { STORY_IMAGE_ACCEPT } from "@/app/lib/story-images";
import type { Lean, Story, StoryWithViews } from "@/app/lib/types";
import { detectSourceLean } from "@/app/lib/source-lean";
import { TOPICS, normalize, slugify } from "@/app/lib/vocab";

type Entity = { name: string; aliases: string[] };
type SourceEditorRow = { name: string; title: string; url: string; lean: Lean; leanMode: "auto" | "manual" };

const TOKEN_KEY = "signal_admin_token";

function createSourceRow(): SourceEditorRow {
  return { name: "", title: "", url: "", lean: "Center", leanMode: "auto" };
}

function getAutoLean(name: string, url: string): Lean {
  return detectSourceLean(name, url) ?? "Center";
}

function toEditorSource(source: Story["sources"][number]): SourceEditorRow {
  const detectedLean = getAutoLean(source.name, source.url);
  return {
    ...source,
    title: source.title ?? "",
    leanMode: detectedLean === source.lean ? "auto" : "manual",
  };
}

function blankSummary() {
  return ["", "", ""];
}

function blankSources() {
  return [createSourceRow(), createSourceRow(), createSourceRow()];
}

function getInitialToken() {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem(TOKEN_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export default function EditorPage() {
  const initialToken = getInitialToken();

  const [adminToken, setAdminToken] = useState(initialToken);
  const [showTokenInput, setShowTokenInput] = useState(!initialToken);
  const [tokenDraft, setTokenDraft] = useState(initialToken);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});
  const [storySearch, setStorySearch] = useState("");
  const [stories, setStories] = useState<StoryWithViews[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageFocusX, setImageFocusX] = useState(DEFAULT_IMAGE_FOCUS);
  const [imageFocusY, setImageFocusY] = useState(DEFAULT_IMAGE_FOCUS);
  const [savedImagePath, setSavedImagePath] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [pinnedStory, setPinnedStory] = useState(false);
  const [beaconInclude, setBeaconInclude] = useState(false);
  const [beaconHeadline, setBeaconHeadline] = useState("");
  const [summary, setSummary] = useState<string[]>(blankSummary());
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [primaryEntities, setPrimaryEntities] = useState<string[]>([]);
  const [sources, setSources] = useState<SourceEditorRow[]>(blankSources());

  const generatedId = title ? slugify(title) : "new-story";
  const storyId = activeStoryId ?? generatedId;

  async function loadStories() {
    setLoadingStories(true);

    try {
      const res = await fetch("/api/stories", { cache: "no-store" });
      const data = (await res.json().catch(() => [])) as StoryWithViews[];
      if (Array.isArray(data)) setStories(data);
    } finally {
      setLoadingStories(false);
    }
  }

  function resetForm() {
    setActiveStoryId(null);
    setTitle("");
    setDate(new Date().toISOString().slice(0, 10));
    setImageUrl(null);
    setImagePath(null);
    setImageFocusX(DEFAULT_IMAGE_FOCUS);
    setImageFocusY(DEFAULT_IMAGE_FOCUS);
    setSavedImagePath(null);
    setUrgent(false);
    setPinnedStory(false);
    setBeaconInclude(false);
    setBeaconHeadline("");
    setSummary(blankSummary());
    setTopics([]);
    setSelectedEntities([]);
    setPrimaryEntities([]);
    setSources(blankSources());
  }

  function loadStoryIntoForm(story: StoryWithViews) {
    setActiveStoryId(story.id);
    setTitle(story.title);
    setDate(story.date);
    setImageUrl(story.image_url ?? null);
    setImagePath(story.image_path ?? null);
    setImageFocusX(clampImageFocus(story.image_focus_x));
    setImageFocusY(clampImageFocus(story.image_focus_y));
    setSavedImagePath(story.image_path ?? null);
    setUrgent(story.urgent);
    setPinnedStory(story.pinned);
    setBeaconInclude(story.beacon_include);
    setBeaconHeadline(story.beacon_headline ?? "");
    setSummary([...story.summary, "", "", ""].slice(0, Math.max(3, story.summary.length)));
    setTopics(story.topics);
    setSelectedEntities(story.entities.map((entity) => entity.name));
    setPrimaryEntities(story.primary_entities);
    setSources(story.sources.length > 0 ? story.sources.map(toEditorSource) : blankSources());
  }

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/entities", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) setEntities(data);
    })();
    void loadStories();
  }, []);

  const filteredStories = useMemo(() => {
    const query = storySearch.trim().toLowerCase();
    if (!query) return stories;

    return stories.filter((story) => {
      const headline = story.title.toLowerCase();
      const id = story.id.toLowerCase();
      const briefingHeadline = (story.beacon_headline ?? "").toLowerCase();
      return headline.includes(query) || id.includes(query) || briefingHeadline.includes(query);
    });
  }, [stories, storySearch]);
  function saveToken() {
    const token = tokenDraft.trim();
    if (!token) return;

    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // ignore localStorage write failure
    }

    setAdminToken(token);
    setShowTokenInput(false);
    setTokenDraft(token);
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore localStorage remove failure
    }
    setAdminToken("");
    setTokenDraft("");
    setShowTokenInput(true);
  }

  function toggleTopic(topic: string) {
    const key = normalize(topic);
    setTopics((prev) =>
      prev.map(normalize).includes(key) ? prev.filter((x) => normalize(x) !== key) : [...prev, topic]
    );
  }

  function updateSummary(index: number, value: string) {
    setSummary((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function updateSource(index: number, patch: Partial<SourceEditorRow>) {
    setSources((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;

      const merged = { ...current, ...patch };

      next[index] =
        merged.leanMode === "auto"
          ? {
              ...merged,
              lean: getAutoLean(merged.name, merged.url),
            }
          : merged;
      return next;
    });
  }

  function addSourceRow() {
    setSources((prev) => [...prev, createSourceRow()]);
  }

  function setSourceLeanMode(index: number, leanMode: "auto" | "manual") {
    setSources((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;

      next[index] =
        leanMode === "auto"
          ? { ...current, leanMode, lean: getAutoLean(current.name, current.url) }
          : { ...current, leanMode };

      return next;
    });
  }

  function toggleEntity(name: string) {
    setSelectedEntities((prev) => {
      const has = prev.includes(name);
      const next = has ? prev.filter((x) => x !== name) : [...prev, name];
      if (has) setPrimaryEntities((existing) => existing.filter((x) => x !== name));
      return next;
    });
  }

  function togglePrimary(name: string) {
    if (!selectedEntities.includes(name)) {
      setSelectedEntities((prev) => (prev.includes(name) ? prev : [...prev, name]));
    }
    setPrimaryEntities((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  }

  async function uploadImage(file: File) {
    if (!adminToken) {
      alert("Admin token required.");
      setShowTokenInput(true);
      return;
    }

    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("storyId", storyId);
      if (imagePath && imagePath !== savedImagePath) {
        formData.append("previousPath", imagePath);
      }

      const res = await fetch("/api/admin/story-images", {
        method: "POST",
        headers: { "x-admin-token": adminToken },
        body: formData,
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        imagePath?: string;
        imageUrl?: string;
      };

      if (!res.ok || !json.imagePath || !json.imageUrl) {
        alert(`Upload failed: ${json.error ?? res.statusText}`);
        return;
      }

      setImagePath(json.imagePath);
      setImageUrl(json.imageUrl);
      setImageFocusX(DEFAULT_IMAGE_FOCUS);
      setImageFocusY(DEFAULT_IMAGE_FOCUS);
    } finally {
      setUploadingImage(false);
    }
  }

  async function removeImage() {
    if (!imagePath && !imageUrl) return;

    if (imagePath && imagePath !== savedImagePath) {
      const res = await fetch("/api/admin/story-images", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ imagePath }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Image removal failed: ${json.error ?? res.statusText}`);
        return;
      }
    }

    setImageUrl(null);
    setImagePath(null);
    setImageFocusX(DEFAULT_IMAGE_FOCUS);
    setImageFocusY(DEFAULT_IMAGE_FOCUS);
  }

  function updateImageFocusFromClick(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setImageFocusX(clampImageFocus(x));
    setImageFocusY(clampImageFocus(y));
  }

  async function onSave() {
    if (!adminToken) {
      alert("Admin token required.");
      setShowTokenInput(true);
      return;
    }

    const cleanedSummary = summary.map((line) => line.trim()).filter(Boolean);
    const cleanedSources = sources
      .map((source) => ({
        name: source.name.trim(),
        title: source.title.trim() || null,
        url: source.url.trim(),
        lean: source.lean,
      }))
      .filter((source) => source.name && source.url);
    const trimmedBeaconHeadline = beaconHeadline.trim();

    if (!title.trim()) return alert("Title is required.");
    if (cleanedSummary.length === 0) return alert("Add at least 1 summary line.");
    if (cleanedSources.length === 0) return alert("Add at least 1 source.");

    const storyEntities = selectedEntities
  .map((name) => entities.find((e) => e.name === name))
  .filter(Boolean)
  .map((e) => ({ name: e!.name, aliases: e!.aliases }));

    const story: Story = {
      id: storyId,
      title: title.trim(),
      summary: cleanedSummary,
      sources: cleanedSources,
      date,
      image_url: imageUrl,
      image_path: imagePath,
      image_focus_x: imageUrl ? imageFocusX : null,
      image_focus_y: imageUrl ? imageFocusY : null,
      urgent,
      pinned: pinnedStory,
      beacon_include: beaconInclude,
      beacon_headline: trimmedBeaconHeadline || null,
      topics: topics.map(normalize),
      entities: storyEntities,
      primary_entities: primaryEntities,
      tags: [...topics.map(normalize), ...selectedEntities.map(normalize)],
      comments: 0,
    };

    const res = await fetch("/api/stories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify(story),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string; story?: Story };
    if (!res.ok) {
      alert(`Save failed: ${json.error ?? res.statusText}`);
      return;
    }

    await loadStories();
    setActiveStoryId(story.id);
    setImageUrl(json.story?.image_url ?? imageUrl);
    setImagePath(json.story?.image_path ?? imagePath ?? null);
    setSavedImagePath(json.story?.image_path ?? imagePath ?? null);
    alert(`Saved! id: ${story.id}`);
  }

  async function onDelete() {
    if (!adminToken) {
      alert("Admin token required.");
      setShowTokenInput(true);
      return;
    }

    const id = storyId;
    if (!id || id === "new-story") {
      alert("Enter a title first so the story ID exists.");
      return;
    }

    if (!confirm(`Delete story "${id}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/stories/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      alert(`Delete failed: ${err.error ?? res.statusText}`);
      return;
    }

    await loadStories();
    resetForm();
    alert(`Deleted: ${id}`);
  }
  async function createEntity(name: string) {
    const res = await fetch("/api/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, aliases: [] }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(`Create entity failed: ${json?.error ?? res.statusText}`);
      return null;
    }

    const created = json.entity as Entity;
    setEntities((prev) => {
      const next = [...prev, created];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });

    return created;
  }

  async function saveAliases(entityName: string, aliases: string[]) {
    const res = await fetch(`/api/entities/${encodeURIComponent(entityName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aliases }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(`Update aliases failed: ${json?.error ?? res.statusText}`);
      return;
    }

    const updated = json.entity as Entity;
    setEntities((prev) => prev.map((e) => (e.name === updated.name ? updated : e)));
  }
  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Story Editor</h1>
          <div className="flex items-center gap-4">
            <button onClick={resetForm} className="text-xs text-neutral-400 hover:text-neutral-200">
              New story
            </button>
            <Link href="/admin/briefing" className="text-xs text-neutral-400 hover:text-neutral-200">
              Manage briefing order
            </Link>
            <button onClick={clearToken} className="text-xs text-neutral-400 hover:text-neutral-200">
              Change token
            </button>
            <Link href="/" className="text-neutral-300 hover:text-white">
              {"<- Back"}
            </Link>
          </div>
        </div>

        {showTokenInput && (
          <div className="mt-6 bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Admin Token Required</div>
            <input
              type="password"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder="Enter admin token..."
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg mb-3"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveToken();
              }}
            />
            <button onClick={saveToken} className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg text-sm">
              Save Token
            </button>
          </div>
        )}

        <div className="mt-8 grid gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 h-fit xl:sticky xl:top-8">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold uppercase text-neutral-300">Current Stories</div>
              <button
                onClick={() => void loadStories()}
                className="text-xs text-neutral-400 hover:text-neutral-200"
                type="button"
              >
                Refresh
              </button>
            </div>
            <input
              value={storySearch}
              onChange={(e) => setStorySearch(e.target.value)}
              placeholder="Search stories..."
              className="mt-4 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            />
            <div className="mt-4 text-xs text-neutral-500">
              {loadingStories ? "Loading..." : `${filteredStories.length} stories`}
            </div>
            <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {filteredStories.map((story) => {
                const active = story.id === activeStoryId;
                return (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => loadStoryIntoForm(story)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      active
                        ? "border-neutral-300 bg-neutral-100/10"
                        : "border-neutral-700 bg-neutral-950/40 hover:border-neutral-500"
                    }`}
                  >
                    <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">{story.date}</div>
                    <div className="mt-2 text-sm font-semibold text-neutral-100">{story.title}</div>
                    <div className="mt-2 text-xs text-neutral-500">{story.id}</div>
                    {story.beacon_include ? (
                      <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-red-300">In briefing</div>
                    ) : null}
                    {story.pinned ? (
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-amber-300">Tracking</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="space-y-6">
            <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-6">
              <div className="text-sm font-semibold uppercase text-neutral-300">
                {activeStoryId ? "Editing Existing Story" : "Creating New Story"}
              </div>
              <div className="mt-3 text-sm text-neutral-500">
                Story ID: <span className="text-neutral-300">{storyId}</span>
              </div>
              {activeStoryId ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Changing the title will not change this story&apos;s ID. Use `New story` if you want to create a separate item.
                </p>
              ) : null}
            </div>

            <div className="space-y-6">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <label className="block text-sm text-neutral-300 mb-2">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
              placeholder="Headline..."
            />
            <div className="mt-3 text-sm text-neutral-500">
              ID preview: <span className="text-neutral-300">{generatedId}</span>
            </div>
            <div className="mt-4">
              <label className="block text-sm text-neutral-300 mb-2">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
              />
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Story Image</div>
            <p className="text-sm text-neutral-500">
              Optional. Upload straight from this browser and it will appear above the headline on the home page card.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900">
                {uploadingImage ? "Uploading..." : imageUrl ? "Replace image" : "Upload image"}
                <input
                  type="file"
                  accept={STORY_IMAGE_ACCEPT}
                  className="sr-only"
                  disabled={uploadingImage}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    await uploadImage(file);
                  }}
                />
              </label>

              {imageUrl ? (
                <button
                  type="button"
                  onClick={() => void removeImage()}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Remove image
                </button>
              ) : null}
            </div>

            <p className="mt-3 text-xs text-neutral-500">
              JPG, PNG, WEBP, or GIF up to 5MB.
            </p>
            {imageUrl ? (
              <div className="mt-4 rounded-2xl border border-neutral-700 bg-neutral-950/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Image Framing</div>
                <p className="mt-2 text-sm text-neutral-500">
                  Click the preview to choose what part of the image stays centered in cropped story and briefing cards.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-neutral-300">
                    Horizontal focus: {Math.round(imageFocusX)}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={imageFocusX}
                      onChange={(e) => setImageFocusX(clampImageFocus(Number(e.target.value)))}
                      className="mt-2 w-full"
                    />
                  </label>
                  <label className="text-sm text-neutral-300">
                    Vertical focus: {Math.round(imageFocusY)}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={imageFocusY}
                      onChange={(e) => setImageFocusY(clampImageFocus(Number(e.target.value)))}
                      className="mt-2 w-full"
                    />
                  </label>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setImageFocusX(DEFAULT_IMAGE_FOCUS);
                      setImageFocusY(DEFAULT_IMAGE_FOCUS);
                    }}
                    className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Reset framing
                  </button>
                </div>
              </div>
            ) : null}
            {savedImagePath && !imagePath ? (
              <p className="mt-2 text-xs text-amber-300">
                This saved image will be removed after you click Save story.
              </p>
            ) : null}

            {imageUrl ? (
              <button
                type="button"
                onClick={updateImageFocusFromClick}
                className="mt-5 block w-full overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-950 text-left"
                title="Click to set the crop focus point"
              >
                <div className="relative aspect-[16/10]">
                  <Image
                    src={imageUrl}
                    alt="Story image preview"
                    fill
                    sizes="(max-width: 768px) 100vw, 720px"
                    className="object-cover"
                    style={{ objectPosition: imageObjectPosition({ image_focus_x: imageFocusX, image_focus_y: imageFocusY }) }}
                  />
                  <div
                    className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_999px_rgba(255,255,255,0)]"
                    style={{ left: `${imageFocusX}%`, top: `${imageFocusY}%` }}
                  />
                </div>
              </button>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 p-6 text-sm text-neutral-500">
                No image selected.
              </div>
            )}
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4" />
              Urgent (Drudge-style emphasis)
            </label>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
              <input type="checkbox" checked={pinnedStory} onChange={(e) => setPinnedStory(e.target.checked)} className="h-4 w-4" />
              Pin this story to the top of Popular and Recent as a tracking story
            </label>
            <p className="mt-3 text-xs text-neutral-500">
              Pinned stories stay at the top of the built-in home tabs. Keyword tabs keep their normal ordering.
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-4 uppercase">The Briefing</div>
            <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={beaconInclude}
                onChange={(e) => setBeaconInclude(e.target.checked)}
                className="h-4 w-4"
              />
              Show this story in The Briefing
            </label>

            <div className="mt-4">
              <label className="block text-sm text-neutral-300 mb-2">Briefing Headline</label>
              <input
                value={beaconHeadline}
                onChange={(e) => setBeaconHeadline(e.target.value)}
                disabled={!beaconInclude}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg disabled:opacity-50"
                placeholder="Optional alternate headline"
              />
            </div>

            <p className="mt-3 text-xs text-neutral-500">
              Placement is now handled in the briefing manager. Leave the headline blank to reuse the main story title.
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Topics</div>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((topic) => {
                const selected = topics.map(normalize).includes(normalize(topic));
                return (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      selected
                        ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                        : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Entities */}
<div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
  <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">
    Entities
  </div>

  {/* Search + create */}
  <div className="flex gap-2 mb-4">
    <input
      value={entitySearch}
      onChange={(e) => setEntitySearch(e.target.value)}
      placeholder='Search entities (e.g. "Middle East")'
      className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-sm"
    />
    <button
      onClick={async () => {
        const name = entitySearch.trim();
        if (!name) return;

        // If it exists, just select it
        const existing = entities.find((e) => e.name.toLowerCase() === name.toLowerCase());
        const entity = existing ?? (await createEntity(name));
        if (!entity) return;

        // select it
        setSelectedEntities((prev) => (prev.includes(entity.name) ? prev : [...prev, entity.name]));
        setEntitySearch("");
      }}
      className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg text-sm"
      title="Create if missing, otherwise select"
    >
      Add
    </button>
  </div>

  <div className="text-xs text-neutral-500 mb-3">
    Tip: Type a new entity name and hit <span className="text-neutral-300">Add</span> to create it instantly.
  </div>

  {/* List entities (filtered) */}
  <div className="flex flex-wrap gap-2">
    {entities
      .filter((e) =>
        !entitySearch.trim()
          ? true
          : e.name.toLowerCase().includes(entitySearch.trim().toLowerCase())
      )
      .slice(0, 50)
      .map((e) => {
        const selected = selectedEntities.includes(e.name);
        const primary = primaryEntities.includes(e.name);

        return (
          <div
            key={e.name}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${
              selected ? "border-neutral-500 bg-neutral-950/30" : "border-neutral-700 bg-neutral-900"
            }`}
          >
            <button
              onClick={() => toggleEntity(e.name)}
              className={`text-xs transition ${selected ? "text-neutral-100" : "text-neutral-300"}`}
              title={selected ? "Remove entity" : "Add entity"}
            >
              {selected ? "✓ " : "+ "}
              {e.name}
            </button>

            <button
              onClick={() => togglePrimary(e.name)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                primary
                  ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
              title="Toggle primary"
            >
              Primary
            </button>
          </div>
        );
      })}
  </div>

  {/* Alias editor for selected entities */}
  {selectedEntities.length > 0 && (
    <div className="mt-6 space-y-4">
      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
        Aliases (for selected entities)
      </div>

      {selectedEntities.map((name) => {
        const entity = entities.find((e) => e.name === name);
        const aliases = entity?.aliases ?? [];
        const draft = aliasDraft[name] ?? "";

        return (
          <div key={name} className="border border-neutral-700 rounded-xl p-4 bg-neutral-950/20">
            <div className="flex items-center justify-between">
              <div className="text-sm text-neutral-200 font-medium">{name}</div>
              <div className="text-xs text-neutral-500">{aliases.length} aliases</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {aliases.map((a) => (
                <button
                  key={a}
                  onClick={async () => {
                    const next = aliases.filter((x) => x !== a);
                    await saveAliases(name, next);
                  }}
                  className="text-xs px-2 py-1 rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  title="Remove alias"
                >
                  ✕ {a}
                </button>
              ))}
              {aliases.length === 0 && (
                <span className="text-xs text-neutral-500">No aliases yet.</span>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setAliasDraft((prev) => ({ ...prev, [name]: e.target.value }))}
                placeholder='Add alias (e.g. "Dubai")'
                className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-sm"
                onKeyDown={async (e) => {
                  if (e.key !== "Enter") return;
                  const alias = draft.trim();
                  if (!alias) return;
                  await saveAliases(name, [...aliases, alias]);
                  setAliasDraft((prev) => ({ ...prev, [name]: "" }));
                }}
              />
              <button
                onClick={async () => {
                  const alias = draft.trim();
                  if (!alias) return;
                  await saveAliases(name, [...aliases, alias]);
                  setAliasDraft((prev) => ({ ...prev, [name]: "" }));
                }}
                className="px-3 py-2 rounded-lg bg-neutral-100 text-neutral-900 text-sm"
              >
                Add alias
              </button>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Summary</div>
            <div className="space-y-3">
              {summary.map((line, index) => (
                <input
                  key={index}
                  value={line}
                  onChange={(e) => updateSummary(index, e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                  placeholder={`Summary line ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-neutral-300 uppercase">Sources</div>
              <button
                onClick={addSourceRow}
                className="text-xs px-3 py-1.5 rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              >
                + Add source
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {sources.map((source, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-2">
                  <input
                    value={source.title}
                    onChange={(e) => updateSource(index, { title: e.target.value })}
                    className="md:col-span-6 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                    placeholder="Article title for this source (paste full title)"
                  />
                  <input
                    value={source.name}
                    onChange={(e) => updateSource(index, { name: e.target.value })}
                    className="md:col-span-2 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                    placeholder="Outlet (e.g. Reuters)"
                  />
                  <input
                    value={source.url}
                    onChange={(e) => updateSource(index, { url: e.target.value })}
                    className="md:col-span-3 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                    placeholder="https://..."
                  />
                  <select
                    value={source.lean}
                    onChange={(e) => updateSource(index, { lean: e.target.value as Lean, leanMode: "manual" })}
                    className="md:col-span-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                  >
                    <option value="Left">Left</option>
                    <option value="Center">Center</option>
                    <option value="Right">Right</option>
                  </select>
                  <div className="md:col-span-6 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                    <span>
                      {source.leanMode === "auto"
                        ? `Auto-detected lean: ${source.lean}`
                        : `Manual override: ${source.lean}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSourceLeanMode(index, "auto")}
                      className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:bg-neutral-800"
                    >
                      Use auto
                    </button>
                    <span>Edit the dropdown anytime to override.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={onSave} className="w-full py-3 rounded-xl bg-neutral-100 text-neutral-900 font-semibold">
            Save story
          </button>

          <button
            onClick={onDelete}
            className="w-full py-3 rounded-xl border border-red-400 text-red-300 hover:bg-red-950/30 font-semibold"
          >
            Delete story
          </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
