export type Lean = "Left" | "Center" | "Right";
export type BriefingPosition = "lead" | "left" | "right";
export type StoryImageDisplay = "cover" | "contain";
export type StoryStatus = "draft" | "published" | "archived";
export type BriefingLeadStyle = "default" | "alert";

export type Source = {
  badge?: string | null;
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
  status: StoryStatus;
  title: string;
  summary: string[];
  sources: Source[];
  date: string; // YYYY-MM-DD
  image_url?: string | null;
  image_path?: string | null;
  image_focus_x?: number | null;
  image_focus_y?: number | null;
  image_display?: StoryImageDisplay | null;
  image_show_on_homepage?: boolean;
  image_show_on_briefing?: boolean;
  image_show_on_story_page?: boolean;
  urgent: boolean;
  beacon_include: boolean;
  beacon_lead_style?: BriefingLeadStyle | null;
  beacon_rank?: number | null;
  beacon_position?: BriefingPosition | null;
  beacon_order?: number | null;
  beacon_headline?: string | null;
  beacon_summary?: string | null;
  created_at?: string;
  updated_at?: string;
  content_updated_at?: string;
  // keyword system
  topics: string[];          // high-level sections
  entities: Entity[];        // canonical + aliases
  primary_entities: string[];// canonical names
  locations: string[];
  organizations: string[];
  people: string[];
  industries: string[];
  sports_teams: string[];
  offices: string[];
  facets: string[];
  related_interest_signals: string[];
  related_story_ids: string[];

  // legacy / optional
  tags: string[];

  comments: number;
  pinned: boolean;
};

export type StoryWithViews = Story & {
  views: number;
};

