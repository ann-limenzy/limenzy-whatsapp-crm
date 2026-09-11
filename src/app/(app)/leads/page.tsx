import { Users } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <ModulePlaceholder
      icon={Users}
      title="Leads"
      description="Searchable list and pipeline views of leads, with stages, record owner, follow-up scheduling, won/lost outcomes and conversion to a customer."
      specSections="§30–§51"
      milestone="Milestone 5+"
    />
  );
}
