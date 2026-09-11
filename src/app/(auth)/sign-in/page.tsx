import type { Metadata } from "next";
import Link from "next/link";

import { SignInForm } from "@/components/auth/sign-in-form";
import { AuthCard } from "@/components/auth/auth-card";
import { safeRedirect } from "@/lib/auth/redirect";
import { requireAnonymous } from "@/server/auth/require-user";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeRedirect(params.next, "");

  // A signed-in user has no use for this form; send them onward instead.
  await requireAnonymous(next || undefined);

  return (
    <AuthCard
      title="Sign in"
      description="Use the email address and password for your Limenzy CRM account."
      footer={
        <>
          New to Limenzy CRM?{" "}
          <Link
            href={
              next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"
            }
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm next={next} />
    </AuthCard>
  );
}
