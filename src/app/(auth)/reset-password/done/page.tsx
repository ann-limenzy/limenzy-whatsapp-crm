import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Password updated" };

export default function ResetPasswordDonePage() {
  return (
    <AuthCard title="Password updated">
      <div className="grid gap-6">
        <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success-subtle px-3 py-3">
          <CircleCheck
            className="mt-0.5 size-4 shrink-0 text-success-on-subtle"
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-success-on-subtle">
            Your password has been changed. You are signed in on this device.
          </p>
        </div>

        <Button asChild className="w-full">
          <Link href="/dashboard">Continue</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
