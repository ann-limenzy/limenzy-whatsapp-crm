import { Settings } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ModulePlaceholder
      icon={Settings}
      title="Settings"
      description="Workspace administration: business settings, users, roles and permissions, pipeline, products and services, custom fields, reminder defaults and modules."
      specSections="§157–§174"
      milestone="Milestone 2"
    />
  );
}
