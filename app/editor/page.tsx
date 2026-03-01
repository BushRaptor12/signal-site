"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Story } from "../lib/types";
import { ENTITIES, TOPICS, normalize } from "../lib/vocab";

type Lean = "Left" | "Center" | "Right";

function slugify(s: string) {
  return normalize(s)
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function EditorPage() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<string[]>(["", "", ""]);
  const [topics, setTopics] = useState<string[]>([]);

  // entities stored as canonical entity names (ENTITIES.name)
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [primaryEntities, setPrimaryEntities] = useState<string[]>([]);

  const [sources, setSources] = useState<
    { name: string; url: string; lean: Lean }[]
  >([
    { name: "", url: "", lean: "Center" },
    { name: "", url: "", lean: "Center" },
    { name: "", url: "", lean: "Center" },
  ]);

  const generatedId = useMemo(() => {
    const base = title ? slugify(title) : "new-story";
    return base.length ? base : "new-story";
  }, [title]);

  function toggleTopic(t: string) {
    const key = normalize(t);
    setTopics((prev) =>
      prev.map(normalize).includes(key)
        ? prev.filter((x) => normalize(x) !== key)
        : [...prev, t]
    );
  }

  function updateSummary(i: number, val: string) {
    setSummary((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
  }

  function updateSource(i: number, patch: Partial<(typeof sources)[number]>) {
    setSources((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function addSourceRow() {
    setSources((prev) => [...prev, { name: "", url: "", lean: "Center" }]);
  }

  function toggleEntity(name: string) {
    const n = name; // canonical already
    setSelectedEntities((prev) => {
      const has = prev.includes(n);
      const next = has ? prev.filter((x) => x !== n) : [...prev, n];

      // If you remove an entity, also remove it from primary
      if (has) {
        setPrimaryEntities((p) => p.filter((x) => x !== n));
      }
      return next;
    });
  }

  function togglePrimaryEntity(name: string) {
    const n = name;

    // Only allow primary if entity is selected
    if (!selectedEntities.includes(n)) {
      setSelectedEntities((prev) => (prev.includes(n) ? prev : [...prev, n]));
    }

    setPrimaryEntities((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
  }

  async function onSave() {
    const cleanedSummary = summary.map((s) => s.trim()).filter(Boolean);
    const cleanedSources = sources
      .map((s) => ({
        name: s.name.trim(),
        url: s.url.trim(),
        lean: s.lean,
      }))
      .filter((s) => s.name && s.url);

    if (!title.trim()) {
      alert("Title is required.");
      return;
    }
    if (cleanedSummary.length === 0) {
      alert("Add at least 1 summary line.");
      return;
    }
    if (cleanedSources.length === 0) {
      alert("Add at least 1 source.");
      return;
    }

    // Build entities array from vocab (keeps canonical + aliases)
    const entities = selectedEntities
      .map((name) => ENTITIES.find((e) => e.name === name))
      .filter(Boolean)
      .map((e) => ({ name: e!.name, aliases: e!.aliases }));

    const story: Story = {
      id: generatedId,
      title: title.trim(),
      summary: cleanedSummary,
      sources: cleanedSources,
      "views": 0,
      comments: 0,
      date,

      // Keep tags for now so existing tab logic doesn't break
      tags: [
        ...topics.map(normalize),
        ...selectedEntities.map((n) => normalize(n)),
      ],

      // NEW structured fields (if your Story type includes them)
      topics: topics,
      entities,
      primaryEntities,
    };
    const res = await fetch("/api/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(story),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        hint?: string;
      };
      const message = [err.error ?? res.statusText, err.details, err.hint]
        .filter(Boolean)
        .join("\n");
      alert(`Save failed:\n${message}`);
      return;
    }

    alert(`Saved! Story id: ${story.id}`);
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Story Editor</h1>
          <Link href="/" className="text-neutral-300 hover:text-white">
            ← Back to feed
          </Link>
        </div>

        <div className="mt-8 space-y-6">
          {/* Title + Date */}
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <label className="block text-sm text-neutral-300 mb-2">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
              placeholder="Headline..."
            />

            <div className="mt-3 text-sm text-neutral-500">
              ID preview:{" "}
              <span className="text-neutral-300">{generatedId}</span>
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

          {/* Topics */}
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">
              Topics
            </div>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => {
                const selected = topics.map(normalize).includes(normalize(t));
                return (
                  <button
                    key={t}
                    onClick={() => toggleTopic(t)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      selected
                        ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                        : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Keep it tight (2–4 usually).
            </div>
          </div>

          {/* Entities */}
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">
              Entities
            </div>

            <div className="text-xs text-neutral-500 mb-3">
              Click to include. Click “Primary” to mark what the story is mainly about.
            </div>

            <div className="flex flex-wrap gap-2">
              {ENTITIES.map((e) => {
                const selected = selectedEntities.includes(e.name);
                const primary = primaryEntities.includes(e.name);

                return (
                  <div
                    key={e.name}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                      selected
                        ? "border-neutral-500 bg-neutral-950/30"
                        : "border-neutral-700 bg-neutral-900"
                    }`}
                  >
                    <button
                      onClick={() => toggleEntity(e.name)}
                      className={`text-xs transition ${
                        selected ? "text-neutral-100" : "text-neutral-300"
                      }`}
                      title={selected ? "Remove entity" : "Add entity"}
                    >
                      {selected ? "✓ " : "+ "}
                      {e.name}
                    </button>

                    <button
                      onClick={() => togglePrimaryEntity(e.name)}
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

            <div className="mt-4 text-xs text-neutral-500">
              Selected:{" "}
              <span className="text-neutral-300">
                {selectedEntities.length}
              </span>
              {" • "}
              Primary:{" "}
              <span className="text-neutral-300">
                {primaryEntities.length}
              </span>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">
              Summary
            </div>
            <div className="space-y-3">
              {summary.map((line, i) => (
                <input
                  key={i}
                  value={line}
                  onChange={(e) => updateSummary(i, e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                  placeholder={`Summary line ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Sources */}
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-neutral-300 uppercase">
                Sources
              </div>
              <button
                onClick={addSourceRow}
                className="text-xs px-3 py-1.5 rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              >
                + Add source
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {sources.map((s, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2">
                  <input
                    value={s.name}
                    onChange={(e) => updateSource(i, { name: e.target.value })}
                    className="md:col-span-2 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                    placeholder="Outlet (e.g. Reuters)"
                  />
                  <input
                    value={s.url}
                    onChange={(e) => updateSource(i, { url: e.target.value })}
                    className="md:col-span-3 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                    placeholder="https://..."
                  />
                  <select
                    value={s.lean}
                    onChange={(e) =>
                      updateSource(i, { lean: e.target.value as Lean })
                    }
                    className="md:col-span-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                  >
                    <option value="Left">Left</option>
                    <option value="Center">Center</option>
                    <option value="Right">Right</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={onSave}
            className="w-full py-3 rounded-xl bg-neutral-100 text-neutral-900 font-semibold"
          >
            Save story
          </button>

          <div className="text-xs text-neutral-500">
            Saved stories are written to <code>app/data/stories.json</code> via <code>/api/stories</code>.
          </div>
        </div>
      </div>
    </main>
  );
}
