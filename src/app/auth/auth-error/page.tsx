import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Link problem" };

/**
 * Explains a failed authentication callback.
 *
 * The reason is mapped from a small allow-list. No Supabase error text, token
 * or identifier is rendered — an unrecognised reason falls back to the generic
 * message rather than being echoed to the page.
 */
const REASONS: Record<string, { title: string; body: string }> = {
  invalid_link: {
    title: "That link isn't valid",
    body: "The link appears to be incomplete or malformed. Request a new one and open it directly from your email.",
  },
  expired_link: {
    title: "That link has expired",
    body: "Verification and password reset links are short-lived, and each one can be used only once. Request a new link to continue.",
  },
};

const FALLBACK = {
  title: "We couldn't complete that",
  body: "The link could not be used. Request a new one and try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: PageProps<"/auth/auth-error">) {
  const params = await searchParams;
  const key = typeof params.reason === "string" ? params.reason : "";
  const { title, body } = REASONS[key] ?? FALLBACK;

  return (
    <div className="app-ambient flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <AuthCard title={title} description={body}>
          <div className="grid gap-3">
            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-3">
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-warning-on-subtle"
                aria-hidden="true"
              />
              <p className="text-sm leading-relaxed text-warning-on-subtle">
                For your security, links can only be used once.
              </p>
            </div>

            <Button asChild className="w-full">
              <Link href="/sign-in">Back to sign in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
          </div>
        </AuthCard>
      </div>
    </div>
  );
}
