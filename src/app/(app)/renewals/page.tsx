import { BellRing } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";

export const metadata: Metadata = { title: "Renewals & Reminders" };

export default function RenewalsPage() {
  return (
    <ModulePlaceholder
      icon={BellRing}
      title="Renewals & Reminders"
      description="Customer products and services approaching or past their due date, with reminder status, assignment, and renewal or not-renewing outcomes."
      specSections="§64–§75"
      milestone="Milestone 4+"
    />
  );
}
