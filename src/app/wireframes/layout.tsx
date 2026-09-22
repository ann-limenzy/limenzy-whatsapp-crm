import type { Metadata } from "next";
import { Suspense } from "react";

import { PresentationChrome } from "@/components/wireframes/presentation-chrome";
import { PresentationProvider } from "@/components/wireframes/presentation-mode";
import { ThemeFromQuery } from "@/components/wireframes/theme-from-query";
import { WF_SIDEBAR_INIT_SCRIPT } from "@/lib/wireframes/sidebar-preference";

/**
 * Wireframe section.
 *
 * Deliberately OUTSIDE the `(app)` route group, so it inherits none of the
 * authenticated shell: no `requireUser()`, no workspace resolution, no
 * Supabase client. The screens are presentation artefacts built entirely from
 * `src/lib/wireframes/mock-data.ts`, and nothing here reads or writes a
 * database.
 *
 * The rail-collapse script lives here rather than in the root layout for the
 * same reason: the wireframes carry their own preference, and the production
 * shell must not have to know the demo exists.
 */

export const metadata: Metadata = {
  title: {
    default: "Wireframes",
    template: "%s · A & S Fincare CRM wireframes",
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
      {/*
        Applies the stored rail preference to <html> while the browser is still
        parsing, so a collapsed rail paints collapsed in the first frame rather
        than snapping shut once React hydrates. It only ever sets an attribute.

        `suppressHydrationWarning` because the attribute it writes is not in
        React's output for <html>; the root layout already marks that element.
      */}
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: WF_SIDEBAR_INIT_SCRIPT }}
      />
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
