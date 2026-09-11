import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";

export const metadata: Metadata = { title: "WhatsApp" };

export default function WhatsappPage() {
  return (
    <ModulePlaceholder
      icon={MessageCircle}
      title="WhatsApp"
      description="A lightweight shared inbox for customer conversations, with assignment, open/closed status, templates and delivery status. Requires a connected WhatsApp business number."
      specSections="§81–§116"
      milestone="Later milestone"
    />
  );
}
