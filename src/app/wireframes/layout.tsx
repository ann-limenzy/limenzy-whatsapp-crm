import type { Metadata } from "next";
import { Suspense } from "react";

import { PresentationChrome } from "@/components/wireframes/presentation-chrome";
import { PresentationProvider } from "@/components/wireframes/presentation-mode";
import { ThemeFromQuery } from "@/components/wireframes/theme-from-query";

/**
 * Wireframe section.
 *
 * Deliberately OUTSIDE the `(app)` route group, so it inherits none of the
 * authenticated shell: no `requireUser()`, no workspace resolution, no
 * Supabase client. The screens are presentation artefacts built entirely from
 * `src/lib/wireframes/mock-data.ts`, and nothing here reads or writes a
 * database.
 */

export const metadata: Metadata = {
  title: {
    default: "Wireframes",
    template: "%s · Limenzy CRM wireframes",
  },
  description:
    "Concept wireframes for the A&S Fincare CRM workflows. Not production functionality.",
  robots: { index: false, follow: false },
};

export default function WireframesLayout({
  children,
}: LayoutProps<"/wireframes">) {
  return (
    <PresentationProvider>
      {/* useSearchParams needs a Suspense boundary to avoid opting the whole
          subtree out of static rendering. */}
      <Suspense fallback={null}>
        <ThemeFromQuery />
      </Suspense>
      <PresentationChrome />
      {children}
    </PresentationProvider>
  );
}
