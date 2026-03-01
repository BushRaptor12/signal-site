"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Story } from "../../lib/types";
import { ENTITIES, TOPICS, normalize } from "../../lib/vocab";

type Lean = "Left" | "Center" | "Right";

const ADMIN_TOKEN_KEY = "signal:adminToken:v1";

function slugify(s: string) {
  return normalize(s)
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function AdminEditorPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id"); // existing story id to edit

  const [adminToken, setAdminToken] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<string[]>(["", "", ""]);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [primaryEntities, setPrimaryEntities] = useState<string[]>([]);
  const [sources, setSources] = useState<{ name: string; url: string; lean: Lean }[]>([
    { name: "", url: "", lean: "Center" },
    { name: "", url: "", lean: "Center" },
    { name: "", url: "", lean: "Center" },
  ]);

  // For NEW stories: derive an id from title. For editing: keep idParam.
  const generatedId = useMemo(() => {
    if (idParam) return idParam;
    const base = title ? slugify(title) : "new-story";
    return base.length ? base : "new-story";
  }, [title, idParam]);

  // Load story into editor when editing
  useEffect(() => {
    if (!idParam) return;

    (async () => {
      const res = await fetch(`/api/stories/${encodeURIComponent(idParam)}`, { cache: "no-store" });
      if (!res.ok) return;

      const story = (await res.json()) as Story;

      setTitle(story.title ?? "");
      setDate(story.date ?? new Date().toISOString().slice(0, 10));
      setSummary(Array.isArray(story.summary) && story.summary.length ? [...story.summary] : ["", "", ""]);
      setTopics(Array.isArray(story.topics) ? story.topics : []);

      setSelectedEntities(
        Array.isArray(story.entities)
          ? story.entities
              .map((entity) => entity.name)
              .filter((name): name is string => Boolean(name))
          : []
      );
      setPrimaryEntities(Array.isArray(story.primaryEntities) ? story.primaryEntities : []);

      setSources(
        Array.isArray(story.sources) && story.sources.length
          ? story.sources
          : [{ name: "", url: "", lean: "Center" }]
      );
    })();
  }, [idParam]);

  function toggleTopic(t: string) {
    const key = normalize(t);
    setTopics((prev) =>
      prev.map(normalize).includes(key) ? prev.filter((x) => normalize(x) !== key) : [...prev, t]
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
    setSelectedEntities((prev) => {
      const has = prev.includes(name);
      const next = has ? prev.filter((x) => x !== name) : [...prev, name];
      if (has) setPrimaryEntities((p) => p.filter((x) => x !== name));
      return next;
    });
  }

  function togglePrimaryEntity(name: string) {
    if (!selectedEntities.includes(name)) {
      setSelectedEntities((prev) => (prev.includes(name) ? prev : [...prev, name]));
    }
    setPrimaryEntities((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  }

  function ensureAdminToken() {
    const t = adminToken.trim();
    if (!t) {
      alert("Enter your admin token first.");
      return null;
    }
    try {
      localStorage.setItem(ADMIN_TOKEN_KEY, t);
    } catch {}
    return t;
  }

  async function onSave() {
    const token = ensureAdminToken();
    if (!token) return;

    const cleanedSummary = summary.map((s) => s.trim()).filter(Boolean);
    const cleanedSources = sources
      .map((s) => ({ name: s.name.trim(), url: s.url.trim(), lean: s.lean }))
      .filter((s) => s.name && s.url);

    if (!title.trim()) return alert("Title is required.");
    if (cleanedSummary.length === 0) return alert("Add at least 1 summary line.");
    if (cleanedSources.length === 0) return alert("Add at least 1 source.");

    const entities = selectedEntities
      .map((name) => ENTITIES.find((e) => e.name === name))
      .filter((entity): entity is (typeof ENTITIES)[number] => Boolean(entity))
      .map((entity) => ({ name: entity.name, aliases: entity.aliases }));

    const story: Story = {
      id: generatedId,
      title: title.trim(),
      summary: cleanedSummary,
      sources: cleanedSources,
      views: 0,
      comments: 0,
      date,
      tags: [...topics.map(normalize), ...selectedEntities.map((n) => normalize(n))],
      topics,
      entities,
      primaryEntities,
    };

    const isEditing = Boolean(idParam);

    const url = isEditing
      ? `/api/admin/stories/${encodeURIComponent(generatedId)}`
      : "/api/admin/stories";

    const method = isEditing ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify(story),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Save failed: ${err?.error ?? res.statusText}`);
      return;
    }

    alert(isEditing ? "Updated!" : "Created!");
    router.push(`/story/${encodeURIComponent(story.id)}`);
    router.refresh();
  }

  async function onDelete() {
    const token = ensureAdminToken();
    if (!token) return;
    if (!idParam) return;

    if (!confirm(`Delete story "${idParam}"?`)) return;

    const res = await fetch(`/api/admin/stories/${encodeURIComponent(idParam)}`, {
      method: "DELETE",
      headers: { "x-admin-token": token },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Delete failed: ${err?.error ?? res.statusText}`);
      return;
    }

    alert("Deleted.");
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{idParam ? "Edit Story" : "New Story"}</h1>
          <Link href="/" className="text-neutral-300 hover:text-white">
            ← Back
          </Link>
        </div>

        <div className="mt-6 bg-neutral-900 border border-neutral-700 rounded-2xl p-5">
          <label className="block text-sm text-neutral-300 mb-2">Admin token</label>
          <input
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
            placeholder="Enter admin token"
          />
          <p className="mt-2 text-xs text-neutral-500">
            Stored locally in your browser for this device.
          </p>
        </div>

        <div className="mt-6 space-y-6">
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
              ID: <span className="text-neutral-300">{generatedId}</span>
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
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Topics</div>
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
          </div>

          {/* Entities */}
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Entities</div>
            <div className="flex flex-wrap gap-2">
              {ENTITIES.map((e) => {
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
                      className={`text-xs ${selected ? "text-neutral-100" : "text-neutral-300"}`}
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
                    >
                      Primary
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Summary</div>
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
              <div className="text-sm font-semibold text-neutral-300 uppercase">Sources</div>
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
                    placeholder="Outlet"
                  />
                  <input
                    value={s.url}
                    onChange={(e) => updateSource(i, { url: e.target.value })}
                    className="md:col-span-3 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
                    placeholder="https://..."
                  />
                  <select
                    value={s.lean}
                    onChange={(e) => updateSource(i, { lean: e.target.value as Lean })}
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

          <button onClick={onSave} className="w-full py-3 rounded-xl bg-neutral-100 text-neutral-900 font-semibold">
            {idParam ? "Update story" : "Create story"}
          </button>

          {idParam && (
            <button
              onClick={onDelete}
              className="w-full py-3 rounded-xl border border-red-500/40 text-red-300 hover:bg-red-500/10 transition"
            >
              Delete story
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export default function AdminEditorPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
          <div className="max-w-3xl mx-auto text-neutral-300">Loading editor...</div>
        </main>
      }
    >
      <AdminEditorPageInner />
    </Suspense>
  );
}
