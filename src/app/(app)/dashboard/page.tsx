import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <ModulePlaceholder
      icon={LayoutDashboard}
      title="Dashboard"
      description="The dashboard will answer “What needs my attention today?” with summary cards, today’s follow-ups, upcoming renewals, the lead pipeline and recent activity. Admin/Manager and Staff see different versions."
      specSections="§15–§25"
      milestone="Milestone 3+"
    />
  );
}
