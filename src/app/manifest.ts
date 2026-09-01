import type { MetadataRoute } from "next";

// A minimal manifest so the app can be installed to a phone Home Screen — a
// hard requirement for push notifications on iOS 16.4+. Drop icon-192.png and
// icon-512.png into /public (maskable, square) to complete the install UX.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Study Up",
    short_name: "Study Up",
    description: "A collaborative study group experience",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f4",
    theme_color: "#1aa76b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
