export type Lean = "Left" | "Center" | "Right";
export type BriefingPosition = "lead" | "left" | "right";
export type StoryImageDisplay = "cover" | "contain";

export type Source = {
  name: string;
  url: string;
  lean: Lean;
  title?: string | null;
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
  image_url?: string | null;
  image_path?: string | null;
  image_focus_x?: number | null;
  image_focus_y?: number | null;
  image_display?: StoryImageDisplay | null;
  urgent: boolean;
  beacon_include: boolean;
  beacon_rank?: number | null;
  beacon_position?: BriefingPosition | null;
  beacon_order?: number | null;
  beacon_headline?: string | null;
  created_at?: string;
  updated_at?: string;
  content_updated_at?: string;
  // keyword system
  topics: string[];          // high-level sections
  entities: Entity[];        // canonical + aliases
  primary_entities: string[];// canonical names

  // legacy / optional
  tags: string[];

  comments: number;
  pinned: boolean;
};

export type StoryWithViews = Story & {
  views: number;
};

