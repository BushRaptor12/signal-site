"use client";

import { useMemo, useState } from "react";
import { formatUpdatedAt } from "@/app/lib/dates";
import type { AdminEntity, AdminInterestSignal } from "@/app/lib/admin-tools";

type AdminEntitiesManagerClientProps = {
  initialEntities: AdminEntity[];
  initialInterestSignals: AdminInterestSignal[];
};

function parseAliasDraft(value: string) {
  return [...new Set(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))];
}

function toAliasDraft(aliases: string[]) {
  return aliases.join("\n");
}

function normalizeEntityKey(value: string) {
  return value.trim().toLowerCase();
}

export default function AdminEntitiesManagerClient({
  initialEntities,
  initialInterestSignals,
}: AdminEntitiesManagerClientProps) {
  const [entities, setEntities] = useState(initialEntities);
  const [interestSignals, setInterestSignals] = useState(initialInterestSignals);
  const [entitySearch, setEntitySearch] = useState("");
  const [interestSearch, setInterestSearch] = useState("");
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityAliases, setNewEntityAliases] = useState("");
  const [expandedEntityNames, setExpandedEntityNames] = useState<string[]>([]);
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [signalTargets, setSignalTargets] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const filteredEntities = useMemo(() => {
    const query = entitySearch.trim().toLowerCase();
    if (!query) return entities;

    return entities.filter((entity) => {
      if (entity.name.toLowerCase().includes(query)) return true;
      return entity.aliases.some((alias) => alias.toLowerCase().includes(query));
    });
  }, [entities, entitySearch]);

  const filteredInterestSignals = useMemo(() => {
    const query = interestSearch.trim().toLowerCase();
    if (!query) return interestSignals;

    return interestSignals.filter((signal) => {
      if (signal.query.toLowerCase().includes(query)) return true;
      return (signal.entityMatchName ?? "").toLowerCase().includes(query);
    });
  }, [interestSearch, interestSignals]);

  function toggleEntity(name: string) {
    setExpandedEntityNames((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  }

  function getAliasDraft(entity: AdminEntity) {
    return aliasDrafts[entity.name] ?? toAliasDraft(entity.aliases);
  }

  async function saveAliases(entity: AdminEntity) {
    const nextAliases = parseAliasDraft(getAliasDraft(entity));
    const actionKey = `save:${entity.name}`;
    setBusyKey(actionKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch(`/api/entities/${encodeURIComponent(entity.name)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ aliases: nextAliases }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entity?: AdminEntity;
        error?: string;
      };
      if (!response.ok || !data.entity) {
        throw new Error(data.error ?? "We couldn't update aliases.");
      }

      setEntities((current) =>
        current.map((item) => (item.name === entity.name ? { aliases: data.entity!.aliases, name: data.entity!.name } : item))
      );
      setAliasDrafts((current) => ({
        ...current,
        [entity.name]: toAliasDraft(data.entity!.aliases),
      }));
      setStatus(`Updated aliases for ${entity.name}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We couldn't update aliases.");
    } finally {
      setBusyKey(null);
    }
  }

  async function mergeEntity(entity: AdminEntity) {
    const targetName = mergeTargets[entity.name]?.trim();
    if (!targetName) {
      setError("Choose an entity to merge into.");
      setStatus("");
      return;
    }

    if (normalizeEntityKey(targetName) === normalizeEntityKey(entity.name)) {
      setError("Choose a different merge target.");
      setStatus("");
      return;
    }

    const actionKey = `merge:${entity.name}`;
    setBusyKey(actionKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch(`/api/entities/${encodeURIComponent(entity.name)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ mergeIntoName: targetName }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entity?: AdminEntity;
        error?: string;
        mergedFrom?: string;
      };
      if (!response.ok || !data.entity) {
        throw new Error(data.error ?? "We couldn't merge that entity.");
      }

      const mergedFromName = data.mergedFrom ?? entity.name;
      setEntities((current) =>
        current
          .filter((item) => item.name !== mergedFromName)
          .map((item) =>
            item.name === data.entity!.name ? { aliases: data.entity!.aliases ?? [], name: data.entity!.name } : item
          )
          .sort((left, right) => left.name.localeCompare(right.name))
      );
      setAliasDrafts((current) => {
        const next = { ...current };
        delete next[mergedFromName];
        next[data.entity!.name] = toAliasDraft(data.entity!.aliases ?? []);
        return next;
      });
      setMergeTargets((current) => {
        const next = { ...current };
        delete next[mergedFromName];
        return next;
      });
      setExpandedEntityNames((current) => current.filter((item) => item !== mergedFromName));
      setInterestSignals((current) =>
        current.map((signal) => {
          if (signal.entityMatchName !== mergedFromName) return signal;

          return {
            ...signal,
            entityMatchName: data.entity!.name,
            entityMatchType:
              normalizeEntityKey(signal.query) === normalizeEntityKey(data.entity!.name) ? "entity" : "alias",
          };
        })
      );
      setStatus(`Merged ${mergedFromName} into ${data.entity!.name}.`);
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : "We couldn't merge that entity.");
    } finally {
      setBusyKey(null);
    }
  }

  async function createEntityFromSignal(signal: AdminInterestSignal) {
    const actionKey = `create:${signal.normalizedQuery}`;
    setBusyKey(actionKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/entities", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ aliases: [], name: signal.query }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entity?: AdminEntity;
        error?: string;
      };
      if (!response.ok || !data.entity) {
        throw new Error(data.error ?? "We couldn't create that entity.");
      }

      const nextEntity = { aliases: data.entity.aliases ?? [], name: data.entity.name };
      setEntities((current) => [...current, nextEntity].sort((left, right) => left.name.localeCompare(right.name)));
      setInterestSignals((current) =>
        current.map((item) =>
          item.normalizedQuery === signal.normalizedQuery
            ? { ...item, entityMatchName: nextEntity.name, entityMatchType: "entity", query: nextEntity.name }
            : item
        )
      );
      setStatus(`Created entity ${nextEntity.name}.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "We couldn't create that entity.");
    } finally {
      setBusyKey(null);
    }
  }

  async function createManualEntity() {
    const trimmedName = newEntityName.trim();
    if (!trimmedName) {
      setError("Entity name is required.");
      setStatus("");
      return;
    }

    const actionKey = "create-manual-entity";
    setBusyKey(actionKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/entities", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          aliases: parseAliasDraft(newEntityAliases),
          name: trimmedName,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entity?: AdminEntity;
        error?: string;
      };
      if (!response.ok || !data.entity) {
        throw new Error(data.error ?? "We couldn't create that entity.");
      }

      const nextEntity = { aliases: data.entity.aliases ?? [], name: data.entity.name };
      setEntities((current) => [...current, nextEntity].sort((left, right) => left.name.localeCompare(right.name)));
      setNewEntityName("");
      setNewEntityAliases("");
      setStatus(`Created entity ${nextEntity.name}.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "We couldn't create that entity.");
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteEntity(entity: AdminEntity) {
    const actionKey = `delete:${entity.name}`;
    setBusyKey(actionKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch(`/api/entities/${encodeURIComponent(entity.name)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "We couldn't delete that entity.");
      }

      setEntities((current) => current.filter((item) => item.name !== entity.name));
      setAliasDrafts((current) => {
        const next = { ...current };
        delete next[entity.name];
        return next;
      });
      setMergeTargets((current) => {
        const next = { ...current };
        delete next[entity.name];
        return next;
      });
      setExpandedEntityNames((current) => current.filter((item) => item !== entity.name));
      setInterestSignals((current) =>
        current.map((signal) =>
          signal.entityMatchName === entity.name
            ? {
                ...signal,
                entityMatchName: null,
                entityMatchType: "none",
              }
            : signal
        )
      );
      setStatus(`Deleted ${entity.name}.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "We couldn't delete that entity.");
    } finally {
      setBusyKey(null);
    }
  }

  async function addSignalAsAlias(signal: AdminInterestSignal) {
    const targetName = signalTargets[signal.normalizedQuery]?.trim();
    if (!targetName) {
      setError("Choose an entity first.");
      setStatus("");
      return;
    }

    const targetEntity = entities.find((entity) => entity.name === targetName);
    if (!targetEntity) {
      setError("That entity no longer exists.");
      setStatus("");
      return;
    }

    const nextAliases = [...new Set([...targetEntity.aliases, signal.query].filter(Boolean))];
    const actionKey = `alias:${signal.normalizedQuery}`;
    setBusyKey(actionKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch(`/api/entities/${encodeURIComponent(targetEntity.name)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ aliases: nextAliases }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entity?: AdminEntity;
        error?: string;
      };
      if (!response.ok || !data.entity) {
        throw new Error(data.error ?? "We couldn't add that alias.");
      }

      setEntities((current) =>
        current.map((item) =>
          item.name === targetEntity.name ? { aliases: data.entity!.aliases, name: data.entity!.name } : item
        )
      );
      setAliasDrafts((current) => ({
        ...current,
        [targetEntity.name]: toAliasDraft(data.entity!.aliases),
      }));
      setInterestSignals((current) =>
        current.map((item) =>
          item.normalizedQuery === signal.normalizedQuery
            ? {
                ...item,
                entityMatchName: data.entity!.name,
                entityMatchType: "alias",
              }
            : item
        )
      );
      setStatus(`Added ${signal.query} as an alias on ${data.entity!.name}.`);
    } catch (aliasError) {
      setError(aliasError instanceof Error ? aliasError.message : "We couldn't add that alias.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {status ? <div className="text-sm text-emerald-400">{status}</div> : null}
        {error ? <div className="text-sm text-red-300">{error}</div> : null}
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Reader Interests</div>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Promote what readers are asking for</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Create a new entity when an interest should stand on its own, or attach it as an alias when readers are using a different phrase for something you already track.
            </p>
          </div>

          <input
            value={interestSearch}
            onChange={(event) => setInterestSearch(event.target.value)}
            placeholder="Search reader interests"
            className="mt-6 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
          />

          <div className="mt-4 space-y-3">
            {filteredInterestSignals.map((signal) => {
              const createKey = `create:${signal.normalizedQuery}`;
              const aliasKey = `alias:${signal.normalizedQuery}`;

              return (
                <div key={signal.normalizedQuery} className="rounded-2xl border border-[#13314b] bg-[#04111b] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-medium text-neutral-100">{signal.query}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {signal.readerCount} reader{signal.readerCount === 1 ? "" : "s"} • Updated {formatUpdatedAt(signal.updatedAt)}
                      </div>
                      <div className="mt-3 text-sm text-neutral-400">
                        {signal.entityMatchType === "entity"
                          ? `Already a canonical entity: ${signal.entityMatchName}`
                          : signal.entityMatchType === "alias"
                            ? `Already covered as an alias on ${signal.entityMatchName}`
                            : "Not in the entity system yet."}
                      </div>
                    </div>

                    {signal.entityMatchType === "none" ? (
                      <button
                        type="button"
                        onClick={() => void createEntityFromSignal(signal)}
                        disabled={busyKey === createKey}
                        className="rounded-full border border-[#8f7740]/70 bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyKey === createKey ? "Creating..." : "Create entity"}
                      </button>
                    ) : (
                      <span className="rounded-full border border-[#163754] px-3 py-2 text-xs uppercase tracking-[0.16em] text-neutral-300">
                        {signal.entityMatchType === "entity" ? "Entity exists" : "Alias exists"}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <select
                      value={signalTargets[signal.normalizedQuery] ?? ""}
                      onChange={(event) =>
                        setSignalTargets((current) => ({
                          ...current,
                          [signal.normalizedQuery]: event.target.value,
                        }))
                      }
                      className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100"
                    >
                      <option value="">Add as alias to...</option>
                      {entities.map((entity) => (
                        <option key={entity.name} value={entity.name}>
                          {entity.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void addSignalAsAlias(signal)}
                      disabled={busyKey === aliasKey}
                      className="rounded-xl border border-[#163754] bg-[#07101a] px-4 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-[#8f7740]/50 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyKey === aliasKey ? "Saving..." : "Add as alias"}
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredInterestSignals.length === 0 ? <div className="text-sm text-neutral-500">No reader interests matched that search.</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-[#0d2438] bg-[var(--surface)] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Entities</div>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Canonical names and aliases</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Search the entity system, expand one, and edit aliases directly. This is the place to clean up duplicate phrasing before it turns into matching noise.
            </p>
          </div>

          <input
            value={entitySearch}
            onChange={(event) => setEntitySearch(event.target.value)}
            placeholder="Search entities or aliases"
            className="mt-6 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
          />

          <div className="mt-6 rounded-2xl border border-[#13314b] bg-[#04111b] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Create entity</div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <input
                value={newEntityName}
                onChange={(event) => setNewEntityName(event.target.value)}
                placeholder="Canonical entity name"
                className="rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/70"
              />
              <input
                value={newEntityAliases}
                onChange={(event) => setNewEntityAliases(event.target.value)}
                placeholder="Optional aliases, comma separated"
                className="rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/70"
              />
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void createManualEntity()}
                disabled={busyKey === "create-manual-entity"}
                className="rounded-full border border-[#8f7740]/70 bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === "create-manual-entity" ? "Creating..." : "Create"}
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filteredEntities.map((entity) => {
              const isExpanded = expandedEntityNames.includes(entity.name);
              const saveKey = `save:${entity.name}`;
              const mergeKey = `merge:${entity.name}`;
              const deleteKey = `delete:${entity.name}`;

              return (
                <div key={entity.name} className="rounded-2xl border border-[#13314b] bg-[#04111b] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-medium text-neutral-100">{entity.name}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {entity.aliases.length} alias{entity.aliases.length === 1 ? "" : "es"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleEntity(entity.name)}
                      className="rounded-full border border-[#163754] bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-300 transition hover:border-[#8f7740]/50 hover:text-neutral-100"
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>

                  {!isExpanded ? null : (
                    <div className="mt-4">
                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Aliases</div>
                        <textarea
                          value={getAliasDraft(entity)}
                          onChange={(event) =>
                            setAliasDrafts((current) => ({
                              ...current,
                              [entity.name]: event.target.value,
                            }))
                          }
                          rows={6}
                          placeholder="One alias per line"
                          className="mt-2 w-full rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-[#8f7740]/70"
                        />
                      </label>

                      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                        <select
                          value={mergeTargets[entity.name] ?? ""}
                          onChange={(event) =>
                            setMergeTargets((current) => ({
                              ...current,
                              [entity.name]: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-[#163754] bg-[#020b14] px-4 py-3 text-sm text-neutral-100"
                        >
                          <option value="">Merge into...</option>
                          {entities
                            .filter((item) => item.name !== entity.name)
                            .map((item) => (
                              <option key={item.name} value={item.name}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void mergeEntity(entity)}
                          disabled={busyKey === mergeKey}
                          className="rounded-full border border-[#163754] bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 transition hover:border-[#8f7740]/50 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyKey === mergeKey ? "Merging..." : "Merge"}
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void saveAliases(entity)}
                          disabled={busyKey === saveKey}
                          className="rounded-full border border-[#8f7740]/70 bg-[#07101a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 transition hover:border-[#b89a55] hover:bg-[#0a1724] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyKey === saveKey ? "Saving..." : "Save aliases"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteEntity(entity)}
                          disabled={busyKey === deleteKey}
                          className="rounded-full border border-[#5b2a2a] bg-[#120708] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#f0c8c8] transition hover:border-[#7a3737] hover:bg-[#190b0c] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyKey === deleteKey ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredEntities.length === 0 ? <div className="text-sm text-neutral-500">No entities matched that search.</div> : null}
          </div>
        </section>
      </div>
    </>
  );
}
