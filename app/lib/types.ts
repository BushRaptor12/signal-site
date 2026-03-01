export type Story = {
  id: string;
  title: string;
  summary: string[];
  sources: { name: string; url: string; lean: "Left" | "Center" | "Right" }[];
  views: number;
  comments: number;
  date: string;
  tags: string[];
  topics?: string[];
  entities?: { name: string; aliases: string[] }[];
  primaryEntities?: string[];
};