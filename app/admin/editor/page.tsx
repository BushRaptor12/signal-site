"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Story } from "@/app/lib/types";
import { ENTITIES, TOPICS, normalize, slugify, toTitleCase } from "@/app/lib/vocab";

type Lean = "Left" | "Center" | "Right";
const TOKEN_KEY = "signal_admin_token";

export default function EditorPage() {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setAdminToken(saved);
    else setShowTokenInput(true);
  }, []);

  function saveToken() {
    const t = tokenDraft.trim();
    if (!t) return;
    localStorage.setItem(TOKEN_KEY, t);
    setAdminToken(t);
    setShowTokenInput(false);
    setTokenDraft("");
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    setAdminToken(null);
    setShowTokenInput(true);
  }
async function onDelete() {
  if (!adminToken) {
    alert("Admin token required.");
    setShowTokenInput(true);
    return;
  }

  const id = generatedId;
  if (!id || id === "new-story") {
    alert("Enter a title first (so an ID exists), or paste the story ID you want to delete.");
    return;
  }

  const ok = confirm(`Delete story "${id}"? This cannot be undone.`);
  if (!ok) return;

  const res = await fetch(`/api/stories/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "x-admin-token": adminToken,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(`Delete failed: ${err?.error ?? res.statusText}`);
    return;
  }

  alert(`Deleted: ${id}`);
}
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

  const generatedId = useMemo(() => (title ? slugify(title) : "new-story"), [title]);

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

    const cleanedSummary = summary.map((s) => s.trim()).filter(Boolean);
    const cleanedSources = sources
      .map((s) => ({ name: s.name.trim(), url: s.url.trim(), lean: s.lean }))
      .filter((s) => s.name && s.url);

    if (!title.trim()) return alert("Title is required.");
    if (cleanedSummary.length === 0) return alert("Add at least 1 summary line.");
    if (cleanedSources.length === 0) return alert("Add at least 1 source.");

    const entities = selectedEntities
      .map((name) => ENTITIES.find((e) => e.name === name))
      .filter(Boolean)
      .map((e) => ({ name: e!.name, aliases: e!.aliases }));

    const story: Story = {
      id: generatedId,
      title: title.trim(),
      summary: cleanedSummary,
      sources: cleanedSources,
      date,
      topics: topics.map(normalize),
      entities,
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
      const err = await res.json().catch(() => ({}));
      alert(`Save failed: ${err?.error ?? res.statusText}`);
      return;
    }

    alert(`Saved! id: ${story.id}`);
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
              ← Back
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
              placeholder="Enter admin token…"
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
              placeholder="Headline…"
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
                      onClick={() => togglePrimary(e.name)}
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
            Save story
          </button>
<button
  onClick={onDelete}
  className="w-full py-3 rounded-xl border border-red-400 text-red-300 hover:bg-red-950/30 font-semibold"
>
  Delete story
</button>
          <div className="text-xs text-neutral-500">
            Editor writes to Supabase via API. Token is stored locally in your browser.
          </div>
        </div>
      </div>
    </main>
  );
}