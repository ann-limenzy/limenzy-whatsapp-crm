import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeRedirect } from "@/lib/auth/redirect";
import { requireAnonymous } from "@/server/auth/require-user";

export const metadata: Metadata = { title: "Create account" };

/**
 * Is this sign-up the start of accepting an invitation?
 *
 * Read from the validated `next`, which is where the journey already records
 * itself — no new parameter, and nothing the browser can use to change what
 * the account becomes. The wording is the only thing that differs: whoever
 * signs up here is the same kind of account either way, and what they may do
 * afterwards is decided by stored memberships, not by this page.
 */
const isJoiningTeam = (next: string): boolean => next === "/invitations";

export default async function SignUpPage({
  searchParams,
}: PageProps<"/sign-up">) {
  const params = await searchParams;
  const next = safeRedirect(params.next, "");
  const joining = isJoiningTeam(next);

  await requireAnonymous(next || undefined);

  return (
    <AuthCard
      title={
        joining
          ? "Create your account to join your team"
          : "Create your account"
      }
      description={
        joining
          ? "Use the email address that received your invitation. After confirming your email, you can join your team's CRM."
          : "Set up the owner account for your business. You can create your workspace after confirming your email address."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={
              next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"
            }
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={next} />
    </AuthCard>
  );
}
