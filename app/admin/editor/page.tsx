"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import type { Story } from "@/app/lib/types";
import { ENTITIES, TOPICS, normalize, slugify } from "@/app/lib/vocab";

type Lean = "Left" | "Center" | "Right";
type Entity = { name: string; aliases: string[] };

const TOKEN_KEY = "signal_admin_token";

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
const [newEntityName, setNewEntityName] = useState("");
const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [urgent, setUrgent] = useState(false);
  const [summary, setSummary] = useState<string[]>(["", "", ""]);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [primaryEntities, setPrimaryEntities] = useState<string[]>([]);
  const [sources, setSources] = useState<{ name: string; url: string; lean: Lean }[]>([
    { name: "", url: "", lean: "Center" },
    { name: "", url: "", lean: "Center" },
    { name: "", url: "", lean: "Center" },
  ]);

  const generatedId = title ? slugify(title) : "new-story";
useEffect(() => {
  (async () => {
    const res = await fetch("/api/entities", { cache: "no-store" });
    const data = await res.json();
    if (Array.isArray(data)) setEntities(data);
  })();
}, []);
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

  function updateSource(index: number, patch: Partial<(typeof sources)[number]>) {
    setSources((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
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

  async function onSave() {
    if (!adminToken) {
      alert("Admin token required.");
      setShowTokenInput(true);
      return;
    }

    const cleanedSummary = summary.map((line) => line.trim()).filter(Boolean);
    const cleanedSources = sources
      .map((source) => ({ name: source.name.trim(), url: source.url.trim(), lean: source.lean }))
      .filter((source) => source.name && source.url);

    if (!title.trim()) return alert("Title is required.");
    if (cleanedSummary.length === 0) return alert("Add at least 1 summary line.");
    if (cleanedSources.length === 0) return alert("Add at least 1 source.");

    const storyEntities = selectedEntities
  .map((name) => entities.find((e) => e.name === name))
  .filter(Boolean)
  .map((e) => ({ name: e!.name, aliases: e!.aliases }));

    const story: Story = {
      id: generatedId,
      title: title.trim(),
      summary: cleanedSummary,
      sources: cleanedSources,
      date,
      urgent,
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

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      alert(`Save failed: ${err.error ?? res.statusText}`);
      return;
    }

    alert(`Saved! id: ${story.id}`);
  }

  async function onDelete() {
    if (!adminToken) {
      alert("Admin token required.");
      setShowTokenInput(true);
      return;
    }

    const id = generatedId;
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
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Story Editor</h1>
          <div className="flex items-center gap-4">
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

        <div className="mt-8 space-y-6">
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
            <label className="inline-flex items-center gap-3 text-sm text-neutral-300">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4" />
              Urgent (Drudge-style emphasis)
            </label>
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
                    onChange={(e) => updateSource(index, { lean: e.target.value as Lean })}
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
    </main>
  );
}
