import type { Lean } from "@/app/lib/types";
import { guessSourceLabel } from "@/app/lib/source-lean";

export type SourceEditorRow = {
  badge: string;
  name: string;
  title: string;
  url: string;
  lean: Lean;
  leanMode: "auto" | "manual";
};

type SourceEditorSectionProps = {
  addSourceFromUrl: (url: string, preferredIndex?: number) => void;
  addSourceRow: () => void;
  moveSourceRow: (index: number, direction: "up" | "down") => void;
  removeSourceRow: (index: number) => void;
  setSourceLeanMode: (index: number, leanMode: "auto" | "manual") => void;
  setSourceUrlDraft: (value: string) => void;
  sourcePreviewLoading: boolean;
  sourceUrlDraft: string;
  sources: SourceEditorRow[];
  updateSource: (index: number, patch: Partial<SourceEditorRow>) => void;
};

export default function SourceEditorSection({
  addSourceFromUrl,
  addSourceRow,
  moveSourceRow,
  removeSourceRow,
  setSourceLeanMode,
  setSourceUrlDraft,
  sourcePreviewLoading,
  sourceUrlDraft,
  sources,
  updateSource,
}: SourceEditorSectionProps) {
  return (
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
            onChange={(event) => setSourceUrlDraft(event.target.value)}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            placeholder="Paste article URL to add a source row automatically"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addSourceFromUrl(sourceUrlDraft);
              }
            }}
          />
          <button
            type="button"
            onClick={() => addSourceFromUrl(sourceUrlDraft)}
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
              onChange={(event) => updateSource(index, { title: event.target.value })}
              className="md:col-span-6 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
              placeholder="Article title for this source (paste full title)"
            />
            <input
              value={source.name}
              onChange={(event) => updateSource(index, { name: event.target.value })}
              className="md:col-span-2 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg"
              placeholder="Outlet (e.g. Reuters)"
            />
            <input
              value={source.url}
              onChange={(event) => updateSource(index, { url: event.target.value })}
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
              onChange={(event) => updateSource(index, { lean: event.target.value as Lean, leanMode: "manual" })}
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
                  onChange={(event) => updateSource(index, { badge: event.target.value })}
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
                  onClick={() => addSourceFromUrl(source.url, index)}
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
  );
}
