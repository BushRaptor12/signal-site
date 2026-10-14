import { PUBLIC_INSET_ELEVATED, PUBLIC_PANEL } from "@/app/lib/surfaces";
import type { ElectionSnapshot } from "@/app/lib/election-snapshot.server";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function partyColor(label: string) {
  return /democrat/i.test(label) ? "bg-blue-400" : /republican/i.test(label) ? "bg-red-400" : "bg-[#d7c08d]";
}

export default function ElectionSnapshotPanel({ snapshot }: { snapshot: ElectionSnapshot }) {
  return (
    <section className={`${PUBLIC_PANEL} p-6`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d7c08d]">Control of Congress</div>
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
          <span className="size-1.5 rounded-full bg-[#d7c08d] motion-safe:animate-pulse" />
          Odds snapshot
        </span>
      </div>

      {snapshot.controls.length > 0 ? (
        <div className="mt-4 space-y-3">
          {snapshot.controls.map((control) => (
            <a
              key={control.chamber}
              href={control.url}
              target="_blank"
              rel="noreferrer"
              className={`${PUBLIC_INSET_ELEVATED} block px-4 py-4 transition hover:border-[#8f7740]/60`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-neutral-100">{control.chamber}</span>
                <span className="text-[10px] uppercase tracking-[0.13em] text-neutral-500">Control odds</span>
              </div>
              <div className="mt-3 space-y-2">
                {control.outcomes.slice(0, 2).map((outcome) => (
                  <div key={outcome.label}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="text-neutral-400">
                        {outcome.label}
                        {outcome.manual ? <span className="ml-1.5 text-[9px] uppercase tracking-[0.1em] text-[#d7c08d]">Manual</span> : null}
                      </span>
                      <span className="font-semibold tabular-nums text-neutral-100">{percent(outcome.probability)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#102234]">
                      <div className={`h-full rounded-full ${partyColor(outcome.label)}`} style={{ width: percent(outcome.probability) }} />
                    </div>
                  </div>
                ))}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-neutral-400">Election market data is temporarily unavailable.</p>
      )}

      <div className="mt-6 border-t border-[#163754]/60 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7c08d]">Races to watch</div>
        </div>
        {snapshot.senateRaces.length > 0 ? (
          <div className="mt-3 space-y-2">
            {snapshot.senateRaces.map((race) => {
              const content = (
                <>
                  <span className="text-xs leading-5 text-neutral-400">{race.title}</span>
                  <span className="shrink-0 text-right text-xs font-semibold text-neutral-100">
                    {race.leader.label}
                    {" "}<span className="text-[#d7c08d]">{percent(race.leader.probability)}</span>
                  </span>
                </>
              );
              return race.url ? (
                <a key={race.title} href={race.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-4 border-b border-[#163754]/45 py-2 last:border-0 hover:text-white">
                  {content}
                </a>
              ) : (
                <div key={race.title} className="flex items-start justify-between gap-4 border-b border-[#163754]/45 py-2 last:border-0">
                  {content}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Browse current state-by-state Senate ratings and filter for the closest races.
          </p>
        )}
      </div>

      <div className="mt-4 text-[10px] leading-5 text-neutral-600">
        Live odds from <a className="underline decoration-[#8f7740]/50 underline-offset-2 hover:text-neutral-400" href="https://polymarket.com" target="_blank" rel="noreferrer">Polymarket</a> are market-implied, not a newsroom forecast. Manual values are editor-entered. Live data refreshes about every five minutes.
      </div>
    </section>
  );
}
