import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Beacon",
    short_name: "Beacon",
    description: "Multi-source news with clear perspective, concise summaries, and source-by-source coverage.",
    start_url: "/beacon",
    scope: "/",
    display: "standalone",
    background_color: "#05111D",
    theme_color: "#05111D",
    orientation: "portrait-primary",
    categories: ["news", "magazines"],
    icons: [
      {
        src: "/beacon-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/beacon-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/beacon-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/beacon-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "The Briefing",
        short_name: "Briefing",
        description: "Open the ranked Beacon briefing.",
        url: "/briefing",
      },
      {
        name: "Following",
        short_name: "Following",
        description: "Open stories tied to followed interests.",
        url: "/?tab=following",
      },
      {
        name: "Notifications",
        short_name: "Alerts",
        description: "Open Beacon alerts and notification settings.",
        url: "/notifications",
      },
    ],
  };
}
