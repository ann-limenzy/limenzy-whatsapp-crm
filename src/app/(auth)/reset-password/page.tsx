import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getAuthenticatedUser } from "@/server/auth/require-user";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * Set-new-password screen.
 *
 * Only reachable with the short-lived session the recovery link established.
 * An expired, missing or replayed link leaves no session, so the user is sent
 * to an explanation rather than shown a form that cannot work.
 */
export default async function ResetPasswordPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/auth/auth-error?reason=expired_link");

  return (
    <AuthCard
      title="Set a new password"
      description="Choose a new password for your account."
      footer={
        <Link
          href="/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
