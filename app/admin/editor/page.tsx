"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import BackLink from "@/app/back-link";
import { formatUpdatedAt } from "@/app/lib/dates";
import { DEFAULT_IMAGE_FOCUS, clampImageFocus, imageObjectPosition } from "@/app/lib/image-focus";
import { inferStoryKnowledge } from "@/app/lib/story-knowledge";
import { STORY_IMAGE_ACCEPT } from "@/app/lib/story-images";
import { ADMIN_INSET, ADMIN_PANEL } from "@/app/lib/surfaces";
import type { BriefingLeadStyle, Lean, Story, StoryImageDisplay, StoryStatus, StoryWithViews } from "@/app/lib/types";
import { detectSourceLean, guessSourceLabel } from "@/app/lib/source-lean";
import { TOPICS, normalize, slugify } from "@/app/lib/vocab";

type Entity = { name: string; aliases: string[] };
type SourceEditorRow = { badge: string; name: string; title: string; url: string; lean: Lean; leanMode: "auto" | "manual" };
type SourcePreview = { name: string; title: string; url: string };
type EditorNotice = { tone: "error" | "info" | "success"; text: string } | null;
type PendingEditorAction = { action: () => void; description: string } | null;
type StoryRevision = {
  action: "deleted" | "restored" | "saved";
  createdAt: string;
  id: string;
  story: StoryWithViews;
  storyId: string;
};

function createSourceRow(): SourceEditorRow {
  return { badge: "", name: "", title: "", url: "", lean: "Center", leanMode: "auto" };
}

function getAutoLean(name: string, url: string): Lean {
  return detectSourceLean(name, url) ?? "Center";
}

function toEditorSource(source: Story["sources"][number]): SourceEditorRow {
  const detectedLean = getAutoLean(source.name, source.url);
  return {
    ...source,
    badge: source.badge ?? "",
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

function normalizeStoryIdInput(value: string) {
  return slugify(value).slice(0, 80);
}

function normalizeStructuredList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type EditorSectionProps = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

function EditorSection({ title, description, defaultOpen = false, children }: EditorSectionProps) {
  return (
    <details open={defaultOpen} className={`group ${ADMIN_PANEL}`}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-200">{title}</div>
          {description ? <p className="mt-2 text-sm text-neutral-500">{description}</p> : null}
        </div>
        <span className="shrink-0 rounded-full border border-neutral-700 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
          Toggle
        </span>
      </summary>
      <div className="border-t border-neutral-800 px-5 py-5">{children}</div>
    </details>
  );
}

export default function EditorPage() {
  const searchParams = useSearchParams();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});
  const [storySearch, setStorySearch] = useState("");
  const [stories, setStories] = useState<StoryWithViews[]>([]);
  const [searchedStories, setSearchedStories] = useState<StoryWithViews[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<StoryStatus>("draft");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageFocusX, setImageFocusX] = useState(DEFAULT_IMAGE_FOCUS);
  const [imageFocusY, setImageFocusY] = useState(DEFAULT_IMAGE_FOCUS);
  const [imageDisplay, setImageDisplay] = useState<StoryImageDisplay>("cover");
  const [imageShowOnHomepage, setImageShowOnHomepage] = useState(true);
  const [imageShowOnBriefing, setImageShowOnBriefing] = useState(true);
  const [imageShowOnStoryPage, setImageShowOnStoryPage] = useState(false);
  const [savedImagePath, setSavedImagePath] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [pinnedStory, setPinnedStory] = useState(false);
  const [beaconInclude, setBeaconInclude] = useState(false);
  const [beaconLeadStyle, setBeaconLeadStyle] = useState<BriefingLeadStyle>("default");
  const [beaconHeadline, setBeaconHeadline] = useState("");
  const [summary, setSummary] = useState<string[]>(blankSummary());
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [primaryEntities, setPrimaryEntities] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [sportsTeams, setSportsTeams] = useState<string[]>([]);
  const [offices, setOffices] = useState<string[]>([]);
  const [facets, setFacets] = useState<string[]>([]);
  const [relatedStoryIds, setRelatedStoryIds] = useState<string[]>([]);
  const [relatedStorySearch, setRelatedStorySearch] = useState("");
  const [sources, setSources] = useState<SourceEditorRow[]>(blankSources());
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [sourcePreviewLoading, setSourcePreviewLoading] = useState(false);
  const [pendingKnowledgeAutofill, setPendingKnowledgeAutofill] = useState(false);
  const [notice, setNotice] = useState<EditorNotice>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingEditorAction, setPendingEditorAction] = useState<PendingEditorAction>(null);
  const [revisions, setRevisions] = useState<StoryRevision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [busyRevisionId, setBusyRevisionId] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [pendingBaselineSync, setPendingBaselineSync] = useState(true);
  const requestedStoryId = searchParams.get("story");

  const generatedId = title ? normalizeStoryIdInput(title) : "";
  const storyId = activeStoryId ?? normalizeStoryIdInput(slugInput || generatedId || "new-story");

  const loadStories = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      query.set("statuses", "draft,published,archived");
      query.set("limit", "250");

      const res = await fetch(`/api/stories?${query.toString()}`, { cache: "no-store" });

      const data = (await res.json().catch(() => [])) as StoryWithViews[];
      if (Array.isArray(data)) setStories(data);
    } finally {
      // no-op
    }
  }, []);

  const searchStories = useCallback(async (search: string) => {
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      setSearchedStories([]);
      return;
    }

    setLoadingStories(true);
    try {
      const query = new URLSearchParams();
      query.set("statuses", "draft,published,archived");
      query.set("limit", "120");
      query.set("search", trimmedSearch);

      const res = await fetch(`/api/stories?${query.toString()}`, { cache: "no-store" });

      const data = (await res.json().catch(() => [])) as StoryWithViews[];
      setSearchedStories(Array.isArray(data) ? data : []);
    } finally {
      setLoadingStories(false);
    }
  }, []);

  const showNotice = useCallback((text: string, tone: NonNullable<EditorNotice>["tone"] = "info") => {
    setNotice({ text, tone });
  }, []);

  const loadEntities = useCallback(async () => {
    const res = await fetch("/api/entities", {
      cache: "no-store",
    });
    const data = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data)) {
      setEntities(data);
      return;
    }

    setEntities([]);
  }, []);

  function resetForm() {
    setActiveStoryId(null);
    setTitle("");
    setSlugInput("");
    setDate(new Date().toISOString().slice(0, 10));
    setStatus("draft");
    setImageUrl(null);
    setImagePath(null);
    setImageFocusX(DEFAULT_IMAGE_FOCUS);
    setImageFocusY(DEFAULT_IMAGE_FOCUS);
    setImageDisplay("cover");
    setImageShowOnHomepage(true);
    setImageShowOnBriefing(true);
    setImageShowOnStoryPage(false);
    setSavedImagePath(null);
    setUrgent(false);
    setPinnedStory(false);
    setBeaconInclude(false);
    setBeaconLeadStyle("default");
    setBeaconHeadline("");
    setSummary(blankSummary());
    setTopics([]);
    setSelectedEntities([]);
    setPrimaryEntities([]);
    setLocations([]);
    setOrganizations([]);
    setPeople([]);
    setIndustries([]);
    setSportsTeams([]);
    setOffices([]);
    setFacets([]);
    setRelatedStoryIds([]);
    setRelatedStorySearch("");
    setSources(blankSources());
    setPendingDelete(false);
    setPendingEditorAction(null);
    setPendingBaselineSync(true);
  }

  const loadStoryIntoForm = useCallback((story: StoryWithViews) => {
    setActiveStoryId(story.id);
    setTitle(story.title);
    setSlugInput(story.id);
    setDate(story.date);
    setStatus(story.status);
    setImageUrl(story.image_url ?? null);
    setImagePath(story.image_path ?? null);
    setImageFocusX(clampImageFocus(story.image_focus_x));
    setImageFocusY(clampImageFocus(story.image_focus_y));
    setImageDisplay(story.image_display === "contain" ? "contain" : "cover");
    setImageShowOnHomepage(story.image_show_on_homepage ?? true);
    setImageShowOnBriefing(story.image_show_on_briefing ?? true);
    setImageShowOnStoryPage(story.image_show_on_story_page ?? false);
    setSavedImagePath(story.image_path ?? null);
    setUrgent(story.urgent);
    setPinnedStory(story.pinned);
    setBeaconInclude(story.beacon_include);
    setBeaconLeadStyle(story.beacon_lead_style === "alert" ? "alert" : "default");
    setBeaconHeadline(story.beacon_headline ?? "");
    setSummary([...story.summary, "", "", ""].slice(0, Math.max(3, story.summary.length)));
    setTopics(story.topics);
    setSelectedEntities(story.entities.map((entity) => entity.name));
    setPrimaryEntities(story.primary_entities);
    setLocations(story.locations);
    setOrganizations(story.organizations);
    setPeople(story.people);
    setIndustries(story.industries);
    setSportsTeams(story.sports_teams);
    setOffices(story.offices);
    setFacets(story.facets);
    setRelatedStoryIds(story.related_story_ids);
    setRelatedStorySearch("");
    setSources(story.sources.length > 0 ? story.sources.map(toEditorSource) : blankSources());
    setPendingDelete(false);
    setPendingEditorAction(null);
    setPendingBaselineSync(true);
  }, []);

  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchStories(storySearch);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [searchStories, storySearch]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  const loadRevisions = useCallback(async (nextStoryId: string) => {
    if (!nextStoryId || nextStoryId === "new-story") {
      setRevisions([]);
      return;
    }

    setLoadingRevisions(true);
    try {
      const response = await fetch(`/api/admin/story-revisions?storyId=${encodeURIComponent(nextStoryId)}`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; revisions?: StoryRevision[] };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't load revision history.");
      }

      setRevisions(Array.isArray(data.revisions) ? data.revisions : []);
    } catch (revisionError) {
      showNotice(revisionError instanceof Error ? revisionError.message : "We couldn't load revision history.", "error");
      setRevisions([]);
    } finally {
      setLoadingRevisions(false);
    }
  }, [showNotice]);

  useEffect(() => {
    if (!activeStoryId) {
      setRevisions([]);
      return;
    }

    void loadRevisions(activeStoryId);
  }, [activeStoryId, loadRevisions]);

  const filteredStories = storySearch.trim() ? searchedStories : stories;

  useEffect(() => {
    if (!requestedStoryId) return;

    const matchingStory = stories.find((story) => story.id === requestedStoryId);
    if (!matchingStory) return;
    if (activeStoryId === matchingStory.id) return;

    loadStoryIntoForm(matchingStory);
  }, [activeStoryId, loadStoryIntoForm, requestedStoryId, stories]);

  const selectedRelatedStories = useMemo(
    () =>
      relatedStoryIds
        .map((id) => stories.find((story) => story.id === id))
        .filter((story): story is StoryWithViews => Boolean(story)),
    [relatedStoryIds, stories]
  );

  const relatedStoryOptions = useMemo(() => {
    const query = relatedStorySearch.trim().toLowerCase();
    return stories
      .filter((story) => story.id !== storyId && !relatedStoryIds.includes(story.id))
      .filter((story) => {
        if (!query) return true;
        return story.title.toLowerCase().includes(query) || story.id.toLowerCase().includes(query);
      })
      .slice(0, 12);
  }, [relatedStoryIds, relatedStorySearch, stories, storyId]);

  const editorSnapshot = useMemo(
    () =>
      JSON.stringify({
        activeStoryId,
        beaconHeadline,
        beaconInclude,
        date,
        imageDisplay,
        imageFocusX,
        imageFocusY,
        imagePath,
        imageUrl,
        imageShowOnBriefing,
        imageShowOnHomepage,
        imageShowOnStoryPage,
        industries,
        pinnedStory,
        facets,
        locations,
        offices,
        organizations,
        people,
        primaryEntities,
        relatedStoryIds,
        selectedEntities,
        slugInput,
        sources,
        sportsTeams,
        status,
        summary,
        title,
        topics,
        urgent,
      }),
    [
      activeStoryId,
      beaconHeadline,
      beaconInclude,
      date,
      imageDisplay,
      imageFocusX,
      imageFocusY,
      imagePath,
      imageUrl,
      imageShowOnBriefing,
      imageShowOnHomepage,
      imageShowOnStoryPage,
      industries,
      pinnedStory,
      facets,
      locations,
      offices,
      organizations,
      people,
      primaryEntities,
      relatedStoryIds,
      selectedEntities,
      slugInput,
      sources,
      sportsTeams,
      status,
      summary,
      title,
      topics,
      urgent,
    ]
  );
  const isDirty = Boolean(savedSnapshot) && savedSnapshot !== editorSnapshot;

  useEffect(() => {
    if (!pendingBaselineSync) return;
    setSavedSnapshot(editorSnapshot);
    setPendingBaselineSync(false);
  }, [editorSnapshot, pendingBaselineSync]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function requestEditorTransition(action: () => void, description: string) {
    if (!isDirty) {
      action();
      return;
    }

    setPendingEditorAction({ action, description });
    showNotice("You have unsaved changes.", "info");
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

  function removeSourceRow(index: number) {
    setSources((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      if (prev.length === 1) return [createSourceRow()];
      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  function moveSourceRow(index: number, direction: "up" | "down") {
    setSources((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(targetIndex, 0, row);
      return next;
    });
  }

  function applySourceSuggestion(suggested: SourcePreview, preferredIndex?: number) {
    setSources((prev) => {
      const next = [...prev];
      const emptyIndex = next.findIndex((source) => !source.name.trim() && !source.title.trim() && !source.url.trim());
      const index = preferredIndex ?? (emptyIndex >= 0 ? emptyIndex : next.length);
      const existing = next[index] ?? createSourceRow();
      const name = suggested.name.trim() || existing.name.trim() || guessSourceLabel(suggested.url) || "";
      const row: SourceEditorRow = {
        ...existing,
        name,
        title: suggested.title.trim() || existing.title,
        url: suggested.url.trim(),
        lean: getAutoLean(name, suggested.url),
        leanMode: "auto",
      };

      if (index >= next.length) next.push(row);
      else next[index] = row;
      return next;
    });
  }

  async function addSourceFromUrl(rawUrl: string, preferredIndex?: number) {
    const url = rawUrl.trim();
    if (!url) {
      showNotice("Paste a source URL first.", "error");
      return;
    }

    setSourcePreviewLoading(true);

    try {
      const res = await fetch("/api/admin/source-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        source?: SourcePreview;
      };

      if (!res.ok || !json.source) {
        showNotice(`Could not fill source: ${json.error ?? res.statusText}`, "error");
        return;
      }

      applySourceSuggestion(json.source, preferredIndex);
      if (preferredIndex == null) setSourceUrlDraft("");
      showNotice("Source details filled from the article link.", "success");
    } finally {
      setSourcePreviewLoading(false);
    }
  }

  async function previewSource(rawUrl: string) {
    const url = rawUrl.trim();
    if (!url) return null;

    const res = await fetch("/api/admin/source-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      source?: SourcePreview;
    };

    if (!res.ok || !json.source) {
      throw new Error(json.error ?? "We couldn't preview that source.");
    }

    return json.source;
  }

  async function autofillStoryKnowledge() {
    setPendingKnowledgeAutofill(true);

    try {
      const refreshedSources = await Promise.all(
        sources.map(async (source) => {
          if (!source.url.trim() || source.title.trim()) {
            return source;
          }

          try {
            const preview = await previewSource(source.url);
            if (!preview) return source;

            return {
              ...source,
              name: source.name.trim() || preview.name,
              title: source.title.trim() || preview.title,
              url: preview.url,
            };
          } catch {
            return source;
          }
        })
      );

      setSources(refreshedSources);

      const inferred = inferStoryKnowledge({
        current: {
          facets,
          industries,
          locations,
          offices,
          organizations,
          people,
          sports_teams: sportsTeams,
        },
        entityNames: selectedEntities,
        primaryEntities,
        sourceNames: refreshedSources.map((source) => source.name),
        sourceTitles: refreshedSources.map((source) => source.title),
        summary,
        title,
        topics,
      });

      setLocations(inferred.locations);
      setOrganizations(inferred.organizations);
      setPeople(inferred.people);
      setIndustries(inferred.industries);
      setSportsTeams(inferred.sports_teams);
      setOffices(inferred.offices);
      setFacets(inferred.facets);

      showNotice("Story knowledge suggestions filled from the draft and source article titles.", "success");
    } catch (knowledgeError) {
      showNotice(knowledgeError instanceof Error ? knowledgeError.message : "We couldn't auto-fill story knowledge.", "error");
    } finally {
      setPendingKnowledgeAutofill(false);
    }
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

  function toggleRelatedStory(id: string) {
    setRelatedStoryIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function uploadImage(file: File) {
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
        body: formData,
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        imagePath?: string;
        imageUrl?: string;
      };

      if (!res.ok || !json.imagePath || !json.imageUrl) {
        showNotice(`Upload failed: ${json.error ?? res.statusText}`, "error");
        return;
      }

      setImagePath(json.imagePath);
      setImageUrl(json.imageUrl);
      setImageFocusX(DEFAULT_IMAGE_FOCUS);
      setImageFocusY(DEFAULT_IMAGE_FOCUS);
      setImageDisplay("cover");
      setImageShowOnHomepage(true);
      setImageShowOnBriefing(true);
      setImageShowOnStoryPage(false);
      showNotice("Image uploaded.", "success");
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
        },
        body: JSON.stringify({ imagePath }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        showNotice(`Image removal failed: ${json.error ?? res.statusText}`, "error");
        return;
      }
    }

    setImageUrl(null);
    setImagePath(null);
    setImageFocusX(DEFAULT_IMAGE_FOCUS);
    setImageFocusY(DEFAULT_IMAGE_FOCUS);
    setImageDisplay("cover");
    setImageShowOnHomepage(true);
    setImageShowOnBriefing(true);
    setImageShowOnStoryPage(false);
    showNotice("Image removed. Save the story to make that change permanent.", "info");
  }

  function updateImageFocusFromClick(event: MouseEvent<HTMLButtonElement>) {
    if (imageDisplay !== "cover") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setImageFocusX(clampImageFocus(x));
    setImageFocusY(clampImageFocus(y));
  }

  async function onSave() {
    const cleanedSummary = summary.map((line) => line.trim()).filter(Boolean);
    const cleanedSources = sources
      .map((source) => ({
        badge: (source.badge ?? "").trim() || null,
        name: source.name.trim(),
        title: source.title.trim() || null,
        url: source.url.trim(),
        lean: source.lean,
      }))
      .filter((source) => source.name && source.url);
    const trimmedBeaconHeadline = beaconHeadline.trim();
    const nextStoryId = activeStoryId ?? normalizeStoryIdInput(slugInput || generatedId);

    if (!title.trim()) {
      showNotice("Title is required.", "error");
      return;
    }
    if (!nextStoryId) {
      showNotice("Story slug is required.", "error");
      return;
    }
    if (cleanedSummary.length === 0) {
      showNotice("Add at least 1 summary line.", "error");
      return;
    }
    if (cleanedSources.length === 0) {
      showNotice("Add at least 1 source.", "error");
      return;
    }
    const storyEntities = selectedEntities
  .map((name) => entities.find((e) => e.name === name))
  .filter(Boolean)
  .map((e) => ({ name: e!.name, aliases: e!.aliases }));

    const story: Story = {
      id: nextStoryId,
      status,
      title: title.trim(),
      summary: cleanedSummary,
      sources: cleanedSources,
      date,
      image_url: imageUrl,
      image_path: imagePath,
      image_focus_x: imageUrl ? imageFocusX : null,
      image_focus_y: imageUrl ? imageFocusY : null,
      image_display: imageUrl ? imageDisplay : null,
      image_show_on_homepage: imageUrl ? imageShowOnHomepage : false,
      image_show_on_briefing: imageUrl ? imageShowOnBriefing : false,
      image_show_on_story_page: imageUrl ? imageShowOnStoryPage : false,
      urgent,
      pinned: pinnedStory,
      beacon_include: beaconInclude,
      beacon_lead_style: beaconLeadStyle,
      beacon_headline: trimmedBeaconHeadline || null,
      topics: topics.map(normalize),
      entities: storyEntities,
      primary_entities: primaryEntities,
      locations,
      organizations,
      people,
      industries,
      sports_teams: sportsTeams,
      offices,
      facets,
      related_story_ids: relatedStoryIds,
      tags: [
        ...topics.map(normalize),
        ...selectedEntities.map(normalize),
        ...locations.map(normalize),
        ...organizations.map(normalize),
        ...people.map(normalize),
        ...industries.map(normalize),
        ...sportsTeams.map(normalize),
        ...offices.map(normalize),
        ...facets.map(normalize),
      ],
      comments: 0,
    };

    const res = await fetch("/api/stories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(story),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string; story?: Story };
    if (!res.ok) {
      showNotice(`Save failed: ${json.error ?? res.statusText}`, "error");
      return;
    }

    await loadStories();
    await searchStories(storySearch);
    await loadRevisions(story.id);
    setActiveStoryId(story.id);
    setSlugInput(story.id);
    setImageUrl(json.story?.image_url ?? imageUrl);
    setImagePath(json.story?.image_path ?? imagePath ?? null);
    setSavedImagePath(json.story?.image_path ?? imagePath ?? null);
    setPendingDelete(false);
    setPendingBaselineSync(true);
    showNotice(`Saved ${story.status === "published" ? "published" : story.status} story: ${story.id}`, "success");
  }

  async function onDeleteConfirmed() {
    const id = storyId;
    if (!id || id === "new-story") {
      showNotice("Save the story before trying to delete it.", "error");
      return;
    }

    const res = await fetch(`/api/stories/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      showNotice(`Delete failed: ${err.error ?? res.statusText}`, "error");
      return;
    }

    await loadStories();
    await searchStories(storySearch);
    setRevisions([]);
    resetForm();
    setPendingBaselineSync(true);
    showNotice(`Deleted: ${id}`, "success");
  }
  async function createEntity(name: string) {
    const res = await fetch("/api/entities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, aliases: [] }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      showNotice(`Create entity failed: ${json?.error ?? res.statusText}`, "error");
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ aliases }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      showNotice(`Update aliases failed: ${json?.error ?? res.statusText}`, "error");
      return;
    }

    const updated = json.entity as Entity;
    setEntities((prev) => prev.map((e) => (e.name === updated.name ? updated : e)));
    showNotice(`Updated aliases for ${updated.name}.`, "success");
  }

  async function restoreRevision(revisionId: string) {
    if (typeof window !== "undefined" && !window.confirm("Restore this story revision into the editor?")) {
      return;
    }

    setBusyRevisionId(revisionId);
    try {
      const response = await fetch("/api/admin/story-revisions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revisionId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; story?: StoryWithViews };
      if (!response.ok || !data.story) {
        throw new Error(data.error ?? "We couldn't restore that revision.");
      }

      loadStoryIntoForm(data.story);
      await loadStories();
      await searchStories(storySearch);
      await loadRevisions(data.story.id);
      setPendingBaselineSync(true);
      showNotice(`Restored ${data.story.id} from revision history.`, "success");
    } catch (restoreError) {
      showNotice(restoreError instanceof Error ? restoreError.message : "We couldn't restore that revision.", "error");
    } finally {
      setBusyRevisionId(null);
    }
  }
  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Story Editor</h1>
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-xs text-neutral-400 hover:text-neutral-200">
              Control center
            </Link>
            <button
              onClick={() => requestEditorTransition(resetForm, "start a new story")}
              className="text-xs text-neutral-400 hover:text-neutral-200"
            >
              New story
            </button>
            <Link href="/admin/briefing" className="text-xs text-neutral-400 hover:text-neutral-200">
              Manage briefing order
            </Link>
            <Link href="/admin/moderation" className="text-xs text-neutral-400 hover:text-neutral-200">
              Moderation
            </Link>
            <BackLink href="/" />
          </div>
        </div>

        {notice ? (
          <div
            className={`mt-6 rounded-2xl border px-5 py-4 text-sm shadow-[0_18px_45px_rgba(0,0,0,0.25)] ${
              notice.tone === "error"
                ? "border-red-500/60 bg-red-500/10 text-red-100"
                : notice.tone === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                  : "border-[#8f7740]/50 bg-[#07101a] text-[#e6d3a6]"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>{notice.text}</div>
              <button type="button" onClick={() => setNotice(null)} className="text-xs uppercase tracking-[0.18em] opacity-80 hover:opacity-100">
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {pendingEditorAction ? (
          <div className="mt-6 rounded-2xl border border-[#8f7740]/50 bg-[#07101a] px-5 py-4 text-sm text-[#e6d3a6] shadow-[0_18px_45px_rgba(0,0,0,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>You have unsaved changes. Leave them behind and {pendingEditorAction.description}?</div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPendingEditorAction(null)}
                  className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
                >
                  Stay here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = pendingEditorAction.action;
                    setPendingEditorAction(null);
                    action();
                  }}
                  className="rounded-full border border-[#8f7740]/70 bg-[#0a1724] px-4 py-2 text-xs font-semibold text-neutral-100 hover:border-[#b89a55]"
                >
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 grid gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className={`${ADMIN_PANEL} h-fit p-5 xl:sticky xl:top-8`}>
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
                    onClick={() => requestEditorTransition(() => loadStoryIntoForm(story), `open "${story.title}"`)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      active
                        ? "border-neutral-300 bg-neutral-100/10"
                        : "border-[#1a334b]/75 bg-[#081521] hover:border-neutral-500"
                    }`}
                  >
                    <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">{story.date}</div>
                    <div className="mt-2 text-sm font-semibold text-neutral-100">{story.title}</div>
                    <div className="mt-2 text-xs text-neutral-500">{story.id}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">{story.status}</div>
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
            <div className={`${ADMIN_PANEL} p-6`}>
              <div className="text-sm font-semibold uppercase text-neutral-300">
                {activeStoryId ? "Editing Existing Story" : "Creating New Story"}
              </div>
              <div className="mt-3 text-sm text-neutral-500">
                Story slug: <span className="text-neutral-300">{storyId}</span>
              </div>
              {activeStoryId ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Existing stories keep their saved slug here so links stay stable.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span
                  className={`rounded-full border px-3 py-1 uppercase tracking-[0.18em] ${
                    status === "published"
                      ? "border-emerald-500/40 text-emerald-300"
                      : status === "archived"
                        ? "border-neutral-600 text-neutral-400"
                        : "border-amber-500/40 text-amber-300"
                  }`}
                >
                  {status}
                </span>
                {isDirty ? <span className="text-amber-300">Unsaved changes</span> : <span className="text-neutral-500">All changes saved</span>}
              </div>
            </div>

            <div className="space-y-4">
              <EditorSection
                title="Story Setup"
                description="Core story details, image, and publishing controls."
                defaultOpen
              >
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <label className="block text-sm text-neutral-300 mb-2">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
              placeholder="Headline..."
            />
            <div className="mt-4">
              <label className="block text-sm text-neutral-300 mb-2">Story slug</label>
              <input
                value={activeStoryId ? storyId : slugInput || generatedId}
                onChange={(e) => setSlugInput(normalizeStoryIdInput(e.target.value))}
                readOnly={Boolean(activeStoryId)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg read-only:opacity-70"
                placeholder="story-slug"
              />
              <div className="mt-2 text-xs text-neutral-500">
                {activeStoryId
                  ? "Saved stories keep the same slug so existing links do not break."
                  : "This auto-fills from the title until you edit it manually."}
              </div>
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
            <div className="mt-4">
              <div className="block text-sm text-neutral-300 mb-2">Status</div>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: "draft" as StoryStatus, label: "Draft" },
                  { value: "published" as StoryStatus, label: "Published" },
                  { value: "archived" as StoryStatus, label: "Archived" },
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    className={`rounded-full border px-3 py-2 text-sm transition ${
                      status === option.value
                        ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                        : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Drafts stay out of public feeds and story pages. Publish when you want the story to go live.
              </p>
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
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Image placement</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={imageShowOnHomepage}
                      onChange={(e) => setImageShowOnHomepage(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Show this image on the main page
                  </label>
                  <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={imageShowOnBriefing}
                      onChange={(e) => setImageShowOnBriefing(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Show this image on The Briefing
                  </label>
                  <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={imageShowOnStoryPage}
                      onChange={(e) => setImageShowOnStoryPage(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Show this image on story pages
                  </label>
                </div>
              </div>
            ) : null}
            {imageUrl ? (
              <div className="mt-4 rounded-2xl border border-neutral-700 bg-neutral-950/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Image Framing</div>
                <p className="mt-2 text-sm text-neutral-500">
                  Choose whether this image should crop to fill story cards or fit fully inside them. For cropped images,
                  click the preview to choose what part stays centered.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    { value: "cover" as StoryImageDisplay, label: "Crop to fill" },
                    { value: "contain" as StoryImageDisplay, label: "Fit whole image" },
                  ]).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setImageDisplay(option.value)}
                      className={`rounded-full border px-3 py-2 text-sm transition ${
                        imageDisplay === option.value
                          ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                          : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-neutral-300">
                    Horizontal focus: {Math.round(imageFocusX)}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={imageFocusX}
                      disabled={imageDisplay !== "cover"}
                      onChange={(e) => setImageFocusX(clampImageFocus(Number(e.target.value)))}
                      className="mt-2 w-full disabled:opacity-40"
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
                      disabled={imageDisplay !== "cover"}
                      onChange={(e) => setImageFocusY(clampImageFocus(Number(e.target.value)))}
                      className="mt-2 w-full disabled:opacity-40"
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
                className="mt-5 block w-full overflow-hidden rounded-2xl bg-neutral-950 text-left"
                title={imageDisplay === "cover" ? "Click to set the crop focus point" : "Image is shown fully in fit mode"}
              >
                <div className={`relative ${imageDisplay === "contain" ? "flex min-h-[320px] items-center justify-center p-4" : "aspect-[16/10]"}`}>
                  {imageDisplay === "contain" ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt="Story image preview"
                        className="block max-h-[420px] max-w-full rounded-xl object-contain"
                      />
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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
              <label className="block text-sm text-neutral-300 mb-2">Lead story style</label>
              <select
                value={beaconLeadStyle}
                onChange={(e) => setBeaconLeadStyle(e.target.value as BriefingLeadStyle)}
                disabled={!beaconInclude}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg disabled:opacity-50"
              >
                <option value="default">Default lead</option>
                <option value="alert">Huge story alert</option>
              </select>
            </div>

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
              </EditorSection>

              <EditorSection
                title="Metadata and Matching"
                description="Topics, entities, summary, and structured hints used around the site."
              >
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

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Story Knowledge</div>
                <p className="text-sm text-neutral-500">
                  Optional structured hints for matching. Add one item per line or separate values with commas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void autofillStoryKnowledge()}
                disabled={pendingKnowledgeAutofill}
                className="rounded-full border border-[#8f7740]/60 px-4 py-2 text-xs font-semibold text-[#e3cca0] transition hover:bg-[#8f7740]/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingKnowledgeAutofill ? "Filling..." : "Auto-fill from draft"}
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Locations</div>
                <textarea
                  value={locations.join("\n")}
                  onChange={(e) => setLocations(normalizeStructuredList(e.target.value))}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"California\nLos Angeles\nAnaheim"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">People</div>
                <textarea
                  value={people.join("\n")}
                  onChange={(e) => setPeople(normalizeStructuredList(e.target.value))}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Kamala Harris\nEric Swalwell"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Organizations</div>
                <textarea
                  value={organizations.join("\n")}
                  onChange={(e) => setOrganizations(normalizeStructuredList(e.target.value))}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Federal Reserve\nOpenAI"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Industries</div>
                <textarea
                  value={industries.join("\n")}
                  onChange={(e) => setIndustries(normalizeStructuredList(e.target.value))}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Artificial intelligence\nBanking"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Sports Teams</div>
                <textarea
                  value={sportsTeams.join("\n")}
                  onChange={(e) => setSportsTeams(normalizeStructuredList(e.target.value))}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Los Angeles Angels\nGolden State Warriors"}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Offices</div>
                <textarea
                  value={offices.join("\n")}
                  onChange={(e) => setOffices(normalizeStructuredList(e.target.value))}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder={"Vice President\nGovernor"}
                />
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Facets</div>
              <textarea
                value={facets.join("\n")}
                onChange={(e) => setFacets(normalizeStructuredList(e.target.value))}
                rows={3}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                placeholder={"Female politician\nCalifornia sports\nAI company"}
              />
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Related Stories</div>
            <p className="text-sm text-neutral-500">
              Optional. These manual links will show first in the story-page related rail before the automatic matches.
            </p>

            <input
              value={relatedStorySearch}
              onChange={(e) => setRelatedStorySearch(e.target.value)}
              placeholder="Search stories to mark as related"
              className="mt-4 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedRelatedStories.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => toggleRelatedStory(story.id)}
                  className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
                  title="Remove related story"
                >
                  x {story.title}
                </button>
              ))}
              {selectedRelatedStories.length === 0 ? (
                <span className="text-xs text-neutral-500">No manual related stories selected.</span>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {relatedStoryOptions.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => toggleRelatedStory(story.id)}
                  className="flex w-full items-start justify-between gap-4 rounded-xl border border-neutral-700 bg-neutral-950/40 px-4 py-3 text-left transition hover:border-neutral-500"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-100">{story.title}</div>
                    <div className="mt-1 text-xs text-neutral-500">{story.id}</div>
                  </div>
                  <div className="shrink-0 rounded-full border border-neutral-700 px-3 py-1 text-[11px] text-neutral-300">
                    Add
                  </div>
                </button>
              ))}
              {relatedStoryOptions.length === 0 && relatedStorySearch.trim() ? (
                <div className="text-xs text-neutral-500">No matching stories found.</div>
              ) : null}
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
              </EditorSection>

              <EditorSection
                title="Sources"
                description="Source links, titles, and lean settings."
                defaultOpen
              >
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
            <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-950/30 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Paste URL Helper</div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={sourceUrlDraft}
                  onChange={(e) => setSourceUrlDraft(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder="Paste article URL to add a source row automatically"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addSourceFromUrl(sourceUrlDraft);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void addSourceFromUrl(sourceUrlDraft)}
                  disabled={sourcePreviewLoading}
                  className="rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-900 disabled:cursor-wait disabled:opacity-70"
                >
                  {sourcePreviewLoading ? "Adding..." : "Add from link"}
                </button>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                The editor will try to fill the outlet name and article title automatically, then keep lean on auto.
              </p>
            </div>
            <div className="mt-4 space-y-4">
              {sources.map((source, index) => (
                <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-6">
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
                    onBlur={() => {
                      if (!source.name.trim()) {
                        const guessedName = guessSourceLabel(source.url);
                        if (guessedName) updateSource(index, { name: guessedName });
                      }
                    }}
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
                  <details className="md:col-span-6 rounded-xl border border-neutral-800 bg-neutral-950/35">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400 [&::-webkit-details-marker]:hidden">
                      Advanced Source Settings
                    </summary>
                    <div className="border-t border-neutral-800 px-3 py-3">
                      <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                        Badge
                      </label>
                      <input
                        value={source.badge ?? ""}
                        onChange={(e) => updateSource(index, { badge: e.target.value })}
                        className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                        placeholder="Optional badge, e.g. Press Release or Official Broadcast"
                      />
                      <p className="mt-2 text-xs text-neutral-500">
                        Rare. Shows as a gold pill next to the source name on story pages.
                      </p>
                    </div>
                  </details>
                  <div className="md:col-span-6 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                     {source.url.trim() ? (
                        <button
                          type="button"
                          onClick={() => void addSourceFromUrl(source.url, index)}
                         disabled={sourcePreviewLoading}
                         className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-70"
                       >
                         Autofill from URL
                       </button>
                     ) : null}
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
                    <button
                      type="button"
                      onClick={() => moveSourceRow(index, "up")}
                      disabled={index === 0}
                      className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSourceRow(index, "down")}
                      disabled={index === sources.length - 1}
                      className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSourceRow(index)}
                      className="rounded-full border border-[#5b2a2a] px-3 py-1 text-[#f0c8c8] hover:bg-[#190b0c]"
                    >
                      Remove
                    </button>
                    <span>Edit the dropdown anytime to override.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
              </EditorSection>

              <EditorSection
                title="Revision History"
                description="Restore an earlier saved version if you need to roll something back."
              >
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-neutral-300 uppercase">Revision History</div>
                <p className="mt-2 text-sm text-neutral-500">
                  Every save and delete writes a snapshot. Restore a previous version directly into the editor when you need to back out a change.
                </p>
              </div>
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                {activeStoryId ? activeStoryId : "Save first"}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {!activeStoryId ? (
                <div className="text-sm text-neutral-500">Save the story once to start storing revision history.</div>
              ) : loadingRevisions ? (
                <div className="text-sm text-neutral-500">Loading revisions...</div>
              ) : revisions.length === 0 ? (
                <div className="text-sm text-neutral-500">No revisions yet.</div>
              ) : (
                revisions.map((revision) => (
                  <div key={revision.id} className={`flex flex-wrap items-center justify-between gap-4 ${ADMIN_INSET} p-4`}>
                    <div>
                      <div className="text-sm text-neutral-100">{revision.story.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {revision.action} • {formatUpdatedAt(revision.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void restoreRevision(revision.id)}
                      disabled={busyRevisionId === revision.id}
                      className="rounded-full border border-[#8f7740]/60 px-4 py-2 text-xs font-semibold text-[#e3cca0] transition hover:bg-[#8f7740]/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyRevisionId === revision.id ? "Restoring..." : "Restore"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
              </EditorSection>

              <div className={`${ADMIN_PANEL} p-5`}>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => void onSave()} className="flex-1 rounded-xl bg-neutral-100 py-3 font-semibold text-neutral-900">
                    {status === "published" ? "Save and publish" : status === "archived" ? "Save as archived" : "Save draft"}
                  </button>

                  {pendingDelete ? (
                    <div className="flex-1 rounded-2xl border border-red-500/50 bg-red-950/20 p-5">
                      <div className="text-sm font-semibold text-red-100">Delete this story?</div>
                      <p className="mt-2 text-sm leading-6 text-red-100/80">
                        This will permanently remove <span className="font-semibold">{storyId}</span>.
                      </p>
                      <div className="mt-4 flex gap-3">
                        <button
                          type="button"
                          onClick={() => setPendingDelete(false)}
                          className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteConfirmed()}
                          className="rounded-full border border-red-400 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/30"
                        >
                          Confirm delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (!activeStoryId) {
                          showNotice("Save the story before trying to delete it.", "error");
                          return;
                        }
                        setPendingDelete(true);
                      }}
                      className="rounded-xl border border-red-400 px-6 py-3 font-semibold text-red-300 hover:bg-red-950/30"
                    >
                      Delete story
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
