import type { MetadataRoute } from "next";

/** Web app manifest: what a phone shows when Secret Side is added to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Secret Side · Porto",
    short_name: "Secret Side",
    description: "Self-guided city adventures in Porto. Check in, solve the clue, unlock the next secret.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0E1320",
    theme_color: "#0E1320",
    // MOCK: placeholder keyhole mark (rendered from app/icon.svg) until real branding.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
