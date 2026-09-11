import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/data/empty-state";

export default function NotFound() {
  return (
    <div className="app-ambient grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-lg">
        <EmptyState
          icon={FileQuestion}
          title="Page not found"
          description="That address doesn't match any screen in the application."
          action={
            <Button asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
