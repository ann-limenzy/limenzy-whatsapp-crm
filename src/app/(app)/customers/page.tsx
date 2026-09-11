import { Building2 } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <ModulePlaceholder
      icon={Building2}
      title="Customers"
      description="The central customer record: profile, products and services, upcoming actions, activity timeline and documents."
      specSections="§52–§80"
      milestone="Milestone 3"
    />
  );
}
