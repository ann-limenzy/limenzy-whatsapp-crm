import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PreviewShell } from "./preview-shell";

export const metadata: Metadata = {
  title: "Lead detail preview",
  robots: { index: false, follow: false },
};

/**
 * DEVELOPMENT-ONLY visual preview of a proposed Lead detail layout.
 *
 * Deliberately OUTSIDE `(app)`:
 *
 *   * it needs no workspace and no session, because it shows invented data
 *     and so has no tenant to belong to — putting it behind
 *     `requireWorkspaceContext()` would mean signing in to look at a picture;
 *   * nothing it renders can reach a Server Action, so there is no write path
 *     to protect in the first place.
 *
 * It still cannot exist in production. `notFound()` below removes the route
 * entirely rather than hiding the link to it — an unlinked page is still a
 * page, and this one would otherwise sit on a customer's domain showing
 * fabricated people with phone numbers.
 *
 * The real screen is `/leads/[id]`, which this does not touch.
 */
export default function LeadPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewShell />;
}
