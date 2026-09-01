import type { MetadataRoute } from "next";

// Installable-app metadata. Icons are generated from public/logo-mark.svg
// (rounded, purpose "any") and public/icon-maskable.svg (full-bleed, purpose
// "maskable") — see scripts/gen-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StudyUp",
    short_name: "StudyUp",
    description: "Your study group's chat, files, assignments and scheduling in one place",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f4",
    theme_color: "#1aa76b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
