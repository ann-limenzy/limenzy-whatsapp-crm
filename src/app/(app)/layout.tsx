import { AppShell } from "@/components/app-shell/app-shell";

/**
 * Layout for every in-application route.
 *
 * In Milestone 1B/1C this is where `requireUser()` and
 * `requireWorkspaceContext()` will run, making it the single authentication and
 * tenant-resolution gate for the whole application. It performs no such checks
 * yet, and renders no user- or workspace-specific data.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
