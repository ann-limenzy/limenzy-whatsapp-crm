import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeRedirect } from "@/lib/auth/redirect";
import { requireAnonymous } from "@/server/auth/require-user";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: PageProps<"/sign-up">) {
  const params = await searchParams;
  const next = safeRedirect(params.next, "");

  await requireAnonymous(next || undefined);

  return (
    <AuthCard
      title="Create your account"
      description="Set up the owner account for your business. You can create your workspace after confirming your email address."
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
