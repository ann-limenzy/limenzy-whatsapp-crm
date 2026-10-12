import { LimenzyLogo } from "@/components/brand/limenzy-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireUser } from "@/server/auth/require-user";

/**
 * Account surfaces: signed in, but not yet inside a workspace.
 *
 * Three screens live here — create the first workspace, choose between
 * several, and the one that explains there is no access to any. All of them
 * exist to answer "which workspace?", so none of them may require an answer to
 * that question. That is the whole reason this group is separate from `(app)`:
 * putting them behind the workspace gate would mean redirecting a user to a
 * page that immediately redirects them back.
 *
 * `requireUser()` is the gate here, and each page calls it again. The layout
 * is defence in depth, not the boundary — a layout is not re-executed for
 * every client-side navigation between its children.
 *
 * Deliberately NOT the application shell: no sidebar, no module navigation, no
 * workspace name. Every one of those needs a workspace, and showing navigation
 * to places the user cannot yet reach would be a menu of dead ends.
 */

/** Per-user content behind an authentication check: never prerendered. */
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    <div className="app-ambient flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <LimenzyLogo />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10 sm:px-6">
        <div className="w-full max-w-3xl py-6 sm:py-10">{children}</div>
      </main>
    </div>
  );
}
