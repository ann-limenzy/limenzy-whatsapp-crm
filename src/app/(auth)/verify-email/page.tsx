import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

export const metadata: Metadata = { title: "Check your email" };

/** Accept an email only if it looks like one; never echo arbitrary input. */
function safeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254
    ? trimmed
    : undefined;
}

export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/verify-email">) {
  const params = await searchParams;
  const email = safeEmail(params.email);

  return (
    <AuthCard
      title="Check your email"
      description={
        email ? (
          <>
            We sent a verification link to <strong>{email}</strong>. Open it to
            confirm your address and continue setting up your workspace.
          </>
        ) : (
          "We sent you a verification link. Open it to confirm your address and continue setting up your workspace."
        )
      }
      footer={
        <Link
          href="/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <div className="grid gap-6">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-3 py-3">
          <MailCheck
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-muted-foreground">
            The link expires after a short time. If it has expired, or the email
            has not arrived, request another below.
          </p>
        </div>

        <ResendVerificationForm email={email} />
      </div>
    </AuthCard>
  );
}
