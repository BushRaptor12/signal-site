"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Story } from "../lib/types";
import { ENTITIES, TOPICS, normalize } from "../lib/vocab";

type Lean = "Left" | "Center" | "Right";

const ADMIN_TOKEN_KEY = "signal:adminToken:v1";

function slugify(value: string) {
  return normalize(value)
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function EditorPage() {
  const initialAdminToken = (() => {
    if (typeof window === "undefined") return "";
    try {
      return (localStorage.getItem(ADMIN_TOKEN_KEY) ?? "").trim();
    } catch {
      return "";
    }
  })();

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

  const [adminToken, setAdminToken] = useState(initialAdminToken);
  const [tokenInput, setTokenInput] = useState(initialAdminToken);
  const [showTokenInput, setShowTokenInput] = useState(!initialAdminToken);

  const generatedId = useMemo(() => {
    const base = title ? slugify(title) : "new-story";
    return base.length ? base : "new-story";
  }, [title]);

  function saveAdminToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      alert("Enter your admin token.");
      return;
    }

    try {
      localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
    } catch {
      // ignore localStorage write failure
    }

    setAdminToken(trimmed);
    setShowTokenInput(false);
  }

  function clearAdminToken() {
    try {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      // ignore localStorage remove failure
    }
    setAdminToken("");
    setTokenInput("");
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

  function togglePrimaryEntity(name: string) {
    if (!selectedEntities.includes(name)) {
      setSelectedEntities((prev) => (prev.includes(name) ? prev : [...prev, name]));
    }
    setPrimaryEntities((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  }

  async function onSave() {
    if (!adminToken.trim()) {
      setShowTokenInput(true);
      alert("Admin token required.");
      return;
    }

    const cleanedSummary = summary.map((line) => line.trim()).filter(Boolean);
    const cleanedSources = sources
      .map((source) => ({
        name: source.name.trim(),
        url: source.url.trim(),
        lean: source.lean,
      }))
      .filter((source) => source.name && source.url);

    if (!title.trim()) return alert("Title is required.");
    if (cleanedSummary.length === 0) return alert("Add at least 1 summary line.");
    if (cleanedSources.length === 0) return alert("Add at least 1 source.");

    const entities = selectedEntities
      .map((name) => ENTITIES.find((entity) => entity.name === name))
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
      tags: [...topics.map(normalize), ...selectedEntities.map((name) => normalize(name))],
      topics,
      entities,
      primaryEntities,
    };

    const res = await fetch("/api/stories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken.trim(),
      },
      body: JSON.stringify(story),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        hint?: string;
      };
      const message = [err.error ?? res.statusText, err.details, err.hint].filter(Boolean).join("\n");
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
          <div className="flex items-center gap-4">
            <button onClick={clearAdminToken} className="text-xs text-neutral-400 hover:text-neutral-200">
              Change admin token
            </button>
            <Link href="/" className="text-neutral-300 hover:text-white">
              {"<- Back to feed"}
            </Link>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          {showTokenInput && (
            <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6">
              <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Admin Token Required</div>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAdminToken();
                }}
                placeholder="Enter admin token..."
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg mb-3"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveAdminToken}
                  className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg text-sm"
                >
                  Save token
                </button>
                {adminToken && (
                  <button
                    onClick={() => setShowTokenInput(false)}
                    className="px-4 py-2 border border-neutral-700 text-neutral-300 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

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
            <div className="text-sm font-semibold text-neutral-300 mb-3 uppercase">Entities</div>
            <div className="text-xs text-neutral-500 mb-3">
              Click to include. Mark primary entities for stronger matching.
            </div>
            <div className="flex flex-wrap gap-2">
              {ENTITIES.map((entity) => {
                const selected = selectedEntities.includes(entity.name);
                const primary = primaryEntities.includes(entity.name);
                return (
                  <div
                    key={entity.name}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                      selected ? "border-neutral-500 bg-neutral-950/30" : "border-neutral-700 bg-neutral-900"
                    }`}
                  >
                    <button
                      onClick={() => toggleEntity(entity.name)}
                      className={`text-xs transition ${selected ? "text-neutral-100" : "text-neutral-300"}`}
                    >
                      {selected ? "OK " : "+ "}
                      {entity.name}
                    </button>
                    <button
                      onClick={() => togglePrimaryEntity(entity.name)}
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
        </div>
      </div>
    </main>
  );
}
