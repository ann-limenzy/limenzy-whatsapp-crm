import { LimenzyLogo } from "@/components/brand/limenzy-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Shell for the public authentication screens.
 *
 * Shares the approved visual system with the application: the same ambient
 * field painted once, the same design tokens, the same glass treatment. It is
 * deliberately NOT the application shell — there is no navigation, because
 * there is no session yet and nothing to navigate to.
 *
 * Single column at every width, so 320px needs no special case.
 */
/**
 * The authentication screens check whether someone is already signed in, so
 * they depend on request cookies and cannot be static either.
 */
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="app-ambient flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <LimenzyLogo />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10 sm:items-center sm:px-6">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}
