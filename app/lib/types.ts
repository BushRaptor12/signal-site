export type Lean = "Left" | "Center" | "Right";

export type Source = {
  name: string;
  url: string;
  lean: Lean;
};

export type Entity = {
  name: string;        // canonical
  aliases: string[];   // common mentions
};

export type Story = {
  id: string;
  title: string;
  summary: string[];
  sources: Source[];
  date: string; // YYYY-MM-DD

  // keyword system
  topics: string[];          // high-level sections
  entities: Entity[];        // canonical + aliases
  primary_entities: string[];// canonical names

  // legacy / optional
  tags: string[];

  comments: number;
};

export type StoryWithViews = Story & {
  views: number;
};