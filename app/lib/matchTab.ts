import type { Story } from "../lib/types";

function norm(s: string) {
  return s.trim().toLowerCase();
}

export function storyMatchesTab(story: Story, tab: string) {
  const t = norm(tab);
  if (!t) return false;

  // 1) Topics (NYT-section feel)
  if ((story.topics ?? []).some((x) => norm(x) === t)) return true;

  // 2) Primary entities (high precision)
  if ((story.primaryEntities ?? []).some((x) => norm(x) === t)) return true;

  // 3) Entities + aliases
  for (const e of story.entities ?? []) {
    if (norm(e.name) === t) return true;
    if ((e.aliases ?? []).some((a) => norm(a) === t)) return true;
  }

  // 4) Optional: legacy tags (keeps your old system working)
  if ((story.tags ?? []).some((x) => norm(x) === t)) return true;

  // 5) Optional: strict phrase match in title/summary (still hard filter)
  const haystack = norm([story.title, ...(story.summary ?? [])].join(" "));
  if (haystack.includes(t)) return true;

  return false;
}