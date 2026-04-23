"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatStoryDate } from "@/app/lib/dates";
import { ADMIN_INSET, ADMIN_PANEL } from "@/app/lib/surfaces";
import type { CoverageHubDefinition, CoverageHubPick, CoverageHubStored, CoverageHubStorySection } from "@/app/lib/coverage-hubs";
import type { StoryWithViews } from "@/app/lib/types";

type CoverageEditorClientProps = {
  initialHubs: CoverageHubStored[];
  initialStories: StoryWithViews[];
};

type CoverageApiResponse = {
  error?: string;
  hub?: CoverageHubStored;
  hubs?: CoverageHubStored[];
  ok?: boolean;
};

type InsertTarget = "hero" | "latest" | `section:${string}`;

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseLines(value: string) {
  return uniqueStrings(value.split(/\r?\n|,/));
}

function formatLines(values: string[] | undefined) {
  return (values ?? []).join("\n");
}

function formatPicks(picks: CoverageHubPick[]) {
  return picks
    .map((pick) => [pick.pick, pick.team, pick.player, pick.school ?? "", pick.note ?? ""].join(" | "))
    .join("\n");
}

function parsePicks(value: string): CoverageHubPick[] {
  const picks: CoverageHubPick[] = [];

  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const [pick, team, player, school, note] = line.split("|").map((part) => part.trim());
    if (!pick || !team || !player) continue;

    picks.push({
      pick,
      team,
      player,
      school: school || undefined,
      note: note || undefined,
    });
  }

  return picks;
}

function cloneHub(hub: CoverageHubStored): CoverageHubStored {
  return {
    ...hub,
    latestStoryIds: [...hub.latestStoryIds],
    sections: hub.sections.map((section) => ({ ...section, storyIds: [...section.storyIds] })),
    picks: hub.picks.map((pick) => ({ ...pick })),
    notes: hub.notes ? [...hub.notes] : [],
  };
}

function createBlankHub(slug: string, title: string): CoverageHubStored {
  return {
    slug,
    eyebrow: "Special Coverage",
    title,
    dek: "",
    dateLabel: "",
    description: "",
    heroStoryId: "",
    latestStoryIds: [],
    sections: [],
    picksTitle: "Pick Tracker",
    picksDescription: "",
    picks: [],
    notes: [],
    updatedAt: null,
    updatedBy: null,
  };
}

export default function CoverageEditorClient({ initialHubs, initialStories }: CoverageEditorClientProps) {
  const [hubs, setHubs] = useState<CoverageHubStored[]>(initialHubs);
  const [stories] = useState<StoryWithViews[]>(initialStories);
  const [selectedSlug, setSelectedSlug] = useState(initialHubs[0]?.slug ?? "");
  const [draft, setDraft] = useState<CoverageHubStored | null>(initialHubs[0] ? cloneHub(initialHubs[0]) : null);
  const [search, setSearch] = useState("");
  const [insertTarget, setInsertTarget] = useState<InsertTarget>("latest");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [picksDraft, setPicksDraft] = useState(initialHubs[0] ? formatPicks(initialHubs[0].picks) : "");
  const [newHubSlug, setNewHubSlug] = useState("");
  const [newHubTitle, setNewHubTitle] = useState("");

  const selectedHub = useMemo(
    () => hubs.find((hub) => hub.slug === selectedSlug) ?? null,
    [hubs, selectedSlug]
  );

  const savedSnapshot = useMemo(() => (selectedHub ? JSON.stringify(selectedHub) : ""), [selectedHub]);
  const draftSnapshot = useMemo(() => (draft ? JSON.stringify(draft) : ""), [draft]);
  const isDirty = Boolean(draft && selectedHub) && savedSnapshot !== draftSnapshot;

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const filteredStories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return stories.slice(0, 40);

    return stories
      .filter((story) => story.title.toLowerCase().includes(query) || story.id.toLowerCase().includes(query))
      .slice(0, 40);
  }, [search, stories]);

  function updateDraft(patch: Partial<CoverageHubDefinition>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setStatus("");
    setError("");
  }

  function confirmNavigation() {
    return !isDirty || window.confirm("You have unsaved coverage hub changes. Continue without saving?");
  }

  function switchHub(slug: string) {
    if (!confirmNavigation()) return;
    const nextHub = hubs.find((hub) => hub.slug === slug);
    if (!nextHub) return;
    setSelectedSlug(slug);
    setDraft(cloneHub(nextHub));
    setPicksDraft(formatPicks(nextHub.picks));
    setStatus("");
    setError("");
  }

  function addNewHub() {
    const slug = newHubSlug.trim();
    const title = newHubTitle.trim();
    if (!slug || !title) {
      setError("New coverage hub needs a slug and title.");
      return;
    }

    if (hubs.some((hub) => hub.slug === slug)) {
      setError("That coverage hub slug already exists.");
      return;
    }

    if (!confirmNavigation()) return;

    const hub = createBlankHub(slug, title);
    setHubs((current) => [...current, hub]);
    setSelectedSlug(slug);
    setDraft(cloneHub(hub));
    setPicksDraft("");
    setNewHubSlug("");
    setNewHubTitle("");
    setStatus("New coverage hub draft created. Save it when you're ready.");
    setError("");
  }

  function updateSection(sectionId: string, patch: Partial<CoverageHubStorySection>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            sections: current.sections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)),
          }
        : current
    );
    setStatus("");
  }

  function addSection() {
    setDraft((current) =>
      current
        ? {
            ...current,
            sections: [
              ...current.sections,
              {
                id: `section-${current.sections.length + 1}`,
                title: `Section ${current.sections.length + 1}`,
                description: "",
                storyIds: [],
              },
            ],
          }
        : current
    );
    setStatus("");
  }

  function removeSection(sectionId: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            sections: current.sections.filter((section) => section.id !== sectionId),
          }
        : current
    );
    setStatus("");
  }

  function insertStory(storyId: string) {
    setDraft((current) => {
      if (!current) return current;

      if (insertTarget === "hero") {
        return { ...current, heroStoryId: storyId };
      }

      if (insertTarget === "latest") {
        return { ...current, latestStoryIds: uniqueStrings([...current.latestStoryIds, storyId]) };
      }

      const sectionId = insertTarget.replace("section:", "");
      return {
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId
            ? { ...section, storyIds: uniqueStrings([...section.storyIds, storyId]) }
            : section
        ),
      };
    });
    setStatus("");
  }

  async function saveHub() {
    if (!draft) return;
    if (!draft.slug.trim() || !draft.title.trim()) {
      setError("Coverage hub must have a slug and title.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/admin/coverage", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          hub: {
            ...draft,
            heroStoryId: draft.heroStoryId?.trim() || "",
            latestStoryIds: uniqueStrings(draft.latestStoryIds),
            sections: draft.sections.map((section) => ({
              ...section,
              title: section.title.trim(),
              description: section.description?.trim() || "",
              storyIds: uniqueStrings(section.storyIds),
            })),
            picks: parsePicks(picksDraft),
            notes: draft.notes ?? [],
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as CoverageApiResponse;
      if (!response.ok || !data.hub) {
        throw new Error(data.error ?? "We couldn't save that coverage hub.");
      }

      setHubs((current) => {
        const exists = current.some((hub) => hub.slug === data.hub!.slug);
        return exists ? current.map((hub) => (hub.slug === data.hub!.slug ? data.hub! : hub)) : [...current, data.hub!];
      });
      setSelectedSlug(data.hub.slug);
      setDraft(cloneHub(data.hub));
      setPicksDraft(formatPicks(data.hub.picks));
      setStatus("Coverage hub saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We couldn't save that coverage hub.");
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return (
      <main className="min-h-screen bg-neutral-900 p-8 text-neutral-100">
        <div className="mx-auto max-w-5xl">
          <div className={`${ADMIN_PANEL} p-8 text-sm text-neutral-400`}>No coverage hubs available.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-900 p-8 text-neutral-100">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-3xl font-bold">Coverage Editor</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
              Mini editor for special coverage hubs like the NFL Draft, Super Bowl, or election night. This first version is optimized for quick setup and manual updates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              Control center
            </Link>
            <Link href={`/coverage/${draft.slug}`} className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white">
              View hub
            </Link>
            <button
              type="button"
              onClick={() => {
                setDraft(selectedHub ? cloneHub(selectedHub) : null);
                setPicksDraft(selectedHub ? formatPicks(selectedHub.picks) : "");
              }}
              disabled={!isDirty || saving}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={() => void saveHub()}
              disabled={saving}
              className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save hub"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          {isDirty ? <div className="text-sm text-amber-300">Unsaved changes</div> : null}
          {status ? <div className="text-sm text-emerald-400">{status}</div> : null}
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)]">
          <section className={`${ADMIN_PANEL} p-6`}>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Coverage Hubs</div>
            <div className="mt-4 space-y-3">
              {hubs.map((hub) => {
                const active = hub.slug === selectedSlug;
                return (
                  <button
                    key={hub.slug}
                    type="button"
                    onClick={() => switchHub(hub.slug)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      active ? "border-[#8f7740]/70 bg-[#0d1a26]" : "border-[#1a334b]/75 bg-[#081521] hover:border-[#28445d]"
                    }`}
                  >
                    <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">{hub.slug}</div>
                    <div className="mt-2 text-base font-semibold text-neutral-100">{hub.title}</div>
                    <div className="mt-2 text-sm leading-6 text-neutral-400">{hub.dek || "No dek set yet."}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 border-t border-neutral-800 pt-6">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">New Hub</div>
              <input
                value={newHubSlug}
                onChange={(event) => setNewHubSlug(event.target.value)}
                placeholder="coverage slug"
                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
              />
              <input
                value={newHubTitle}
                onChange={(event) => setNewHubTitle(event.target.value)}
                placeholder="Coverage title"
                className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
              />
              <button
                type="button"
                onClick={addNewHub}
                className="mt-3 rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
              >
                Create draft hub
              </button>
            </div>
          </section>

          <section className={`${ADMIN_PANEL} p-6`}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Slug</label>
                <input
                  value={draft.slug}
                  onChange={(event) => updateDraft({ slug: event.target.value })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Eyebrow</label>
                <input
                  value={draft.eyebrow}
                  onChange={(event) => updateDraft({ eyebrow: event.target.value })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Title</label>
                <input
                  value={draft.title}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Date Label</label>
                <input
                  value={draft.dateLabel}
                  onChange={(event) => updateDraft({ dateLabel: event.target.value })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Hero Story Id</label>
                <input
                  value={draft.heroStoryId ?? ""}
                  onChange={(event) => updateDraft({ heroStoryId: event.target.value })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Dek</label>
                <textarea
                  value={draft.dek}
                  onChange={(event) => updateDraft({ dek: event.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Description</label>
                <textarea
                  value={draft.description}
                  onChange={(event) => updateDraft({ description: event.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
                />
              </div>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-6">
                <div className={`${ADMIN_INSET} p-5`}>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Latest Story Ids</div>
                  <textarea
                    value={formatLines(draft.latestStoryIds)}
                    onChange={(event) => updateDraft({ latestStoryIds: parseLines(event.target.value) })}
                    rows={5}
                    className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
                    placeholder={"story-id-one\nstory-id-two"}
                  />
                </div>

                <div className={`${ADMIN_INSET} p-5`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Sections</div>
                    <button
                      type="button"
                      onClick={addSection}
                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800"
                    >
                      Add section
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    {draft.sections.map((section) => (
                      <div key={section.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">{section.id}</div>
                          <button
                            type="button"
                            onClick={() => removeSection(section.id)}
                            className="rounded-full border border-red-400/40 px-3 py-1.5 text-[11px] text-red-200 transition hover:bg-red-950/30"
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          value={section.title}
                          onChange={(event) => updateSection(section.id, { title: event.target.value })}
                          className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                          placeholder="Section title"
                        />
                        <textarea
                          value={section.description ?? ""}
                          onChange={(event) => updateSection(section.id, { description: event.target.value })}
                          rows={2}
                          className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
                          placeholder="Section description"
                        />
                        <textarea
                          value={formatLines(section.storyIds)}
                          onChange={(event) => updateSection(section.id, { storyIds: parseLines(event.target.value) })}
                          rows={4}
                          className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
                          placeholder={"story-id-one\nstory-id-two"}
                        />
                      </div>
                    ))}
                    {draft.sections.length === 0 ? <div className="text-sm text-neutral-500">No sections yet.</div> : null}
                  </div>
                </div>

                <div className={`${ADMIN_INSET} p-5`}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Picks Title</div>
                      <input
                        value={draft.picksTitle ?? ""}
                        onChange={(event) => updateDraft({ picksTitle: event.target.value })}
                        className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Picks Description</div>
                      <input
                        value={draft.picksDescription ?? ""}
                        onChange={(event) => updateDraft({ picksDescription: event.target.value })}
                        className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                      />
                    </div>
                  </div>
                  <div className="mt-4 text-xs leading-5 text-neutral-500">Use one pick per line: `Pick | Team | Player | School | Note`</div>
                  <textarea
                    value={picksDraft}
                    onChange={(event) => setPicksDraft(event.target.value)}
                    rows={8}
                    className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
                    placeholder={"1 | Tennessee Titans | Cam Ward | Miami | Franchise QB swing"}
                  />
                </div>

                <div className={`${ADMIN_INSET} p-5`}>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Notes</div>
                  <textarea
                    value={formatLines(draft.notes)}
                    onChange={(event) => updateDraft({ notes: parseLines(event.target.value) })}
                    rows={5}
                    className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
                    placeholder={"Keep this page manual for tonight.\nUpdate latest stories after each major pick."}
                  />
                </div>
              </div>

              <div className={`${ADMIN_INSET} p-5`}>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Story Picker</div>
                <div className="mt-4">
                  <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-500">Insert Into</label>
                  <select
                    value={insertTarget}
                    onChange={(event) => setInsertTarget(event.target.value as InsertTarget)}
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                  >
                    <option value="hero">Hero story</option>
                    <option value="latest">Latest stories</option>
                    {draft.sections.map((section) => (
                      <option key={section.id} value={`section:${section.id}`}>
                        {section.title || section.id}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search published stories"
                  className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                />

                <div className="mt-4 space-y-3">
                  {filteredStories.map((story) => (
                    <div key={story.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                        {formatStoryDate(story.date)} • {story.id}
                      </div>
                      <div className="mt-2 text-sm font-semibold leading-6 text-neutral-100">{story.title}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => insertStory(story.id)}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800"
                        >
                          Insert
                        </button>
                        <Link
                          href={`/story/${story.id}`}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                        >
                          Preview
                        </Link>
                        <Link
                          href={`/admin/editor?story=${story.id}`}
                          className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                        >
                          Edit story
                        </Link>
                      </div>
                    </div>
                  ))}
                  {filteredStories.length === 0 ? <div className="text-sm text-neutral-500">No matching stories.</div> : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
