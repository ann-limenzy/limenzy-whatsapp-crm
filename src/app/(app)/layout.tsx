import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/server/auth/require-user";

/**
 * Layout for every in-application route.
 *
 * This is the single server-side authentication gate for the application.
 * `requireUser()` resolves identity from the verified access token on every
 * request and redirects to sign-in when there is none — so a protected route
 * cannot be reached by typing its URL, by client-side navigation, or by
 * disabling JavaScript.
 *
 * It is not the only check. Each Server Action re-verifies independently,
 * because the Next.js documentation warns that proxy coverage can be removed
 * silently by a matcher change or a refactor.
 *
 * Tenant resolution (`requireWorkspaceContext()`) is Milestone 1C and is
 * deliberately absent: there is no workspace schema yet, and inventing one
 * here would be exactly the fake data the milestone boundary forbids.
 */
/**
 * Every route beneath this layout renders per-user content behind an
 * authentication check, so none of it may be prerendered into static HTML.
 * Stated explicitly rather than relying on implicit `cookies()` detection.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return <AppShell user={user}>{children}</AppShell>;
}
