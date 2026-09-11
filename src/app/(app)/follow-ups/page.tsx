import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";

export const metadata: Metadata = { title: "Follow-ups" };

export default function FollowUpsPage() {
  return (
    <ModulePlaceholder
      icon={CalendarCheck}
      title="Follow-ups"
      description="One work list combining lead and customer follow-ups across Today, Upcoming, Overdue and Completed, with complete and reschedule actions."
      specSections="§43–§44"
      milestone="Milestone 4"
    />
  );
}
