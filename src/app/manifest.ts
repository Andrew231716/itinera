import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Itinera — Intelligent Route Planner",
    short_name: "Itinera",
    description:
      "Crea, personalizza e condividi itinerari di viaggio con tappe e preferenze stradali.",
    start_url: "/",
    display: "standalone",
    background_color: "#e8eef3",
    theme_color: "#2c5f7c",
    orientation: "portrait-primary",
    lang: "it",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
