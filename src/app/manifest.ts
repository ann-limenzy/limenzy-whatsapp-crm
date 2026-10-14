import type { MetadataRoute } from "next";

import { MANIFEST_BACKGROUND, MANIFEST_THEME } from "@/lib/brand-colors";

/**
 * The web app manifest — Milestone 1E, spec §179.1.
 *
 * `start_url: "/"` rather than `/dashboard`: §179.1 requires an installed
 * application to resolve where the user belongs on launch instead of assuming
 * a destination. The root route already does that — it resolves identity and
 * workspace and routes accordingly — so a launch after sign-out lands on
 * sign-in, and a launch with no workspace selected lands on the chooser,
 * rather than on a dashboard that then redirects.
 *
 * `scope: "/"` keeps every in-app navigation inside the installed window.
 *
 * `display: "standalone"` is what makes the launcher icon open without browser
 * chrome. `display_override` asks for `minimal-ui` first on browsers that
 * support it, because a visible reload affordance is genuinely useful in an
 * application that refuses to cache its own pages: when the network is down
 * there is nothing to fall back to but the offline screen.
 *
 * Icons are derived from the approved logo by `scripts/generate-app-icons.mjs`;
 * the `maskable` pair is drawn into a 60% safe zone so an aggressive circular
 * or squircle mask cannot clip the symbol.
 *
 * Deliberately absent: `shortcuts` to authenticated destinations. A shortcut
 * is a public, unauthenticated entry point into the launcher, and pointing one
 * at a workspace screen would advertise application structure and land a
 * signed-out user on a redirect. Also absent: `share_target`, `protocol_handlers`
 * and `file_handlers`, none of which Milestone 1E includes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Limenzy CRM",
    short_name: "Limenzy",
    description:
      "Lightweight CRM for small businesses — leads, customers, follow-ups and renewals.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["minimal-ui", "standalone"],
    orientation: "portrait-primary",
    background_color: MANIFEST_BACKGROUND,
    theme_color: MANIFEST_THEME,
    categories: ["business", "productivity"],
    lang: "en",
    dir: "ltr",
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
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
