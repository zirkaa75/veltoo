import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VELTO Business Workspace",
    short_name: "VELTO",
    description: "Maamul ganacsigaaga adigoo adeegsanaya VELTO.",
    start_url: "/admin/notifications",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1d7752",
    icons: [
      {
        src: "/velto-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
