import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <ModulePlaceholder
      icon={ChartColumn}
      title="Reports"
      description="Simple operational reporting across leads, follow-ups, renewals, customers and staff activity, with drill-down into the matching records."
      specSections="§144–§156"
      milestone="Later milestone"
    />
  );
}
