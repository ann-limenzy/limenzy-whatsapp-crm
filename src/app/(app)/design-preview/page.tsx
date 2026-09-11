import type { Metadata } from "next";

import { StatusBadge, type StatusTone } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Design preview" };

/**
 * DESIGN PREVIEW — not product functionality.
 *
 * An internal reference for checking the token system, the three surface tiers
 * and status treatments in both themes at every breakpoint. It is intentionally
 * not linked from the main navigation, contains no business data, and is not
 * part of any specified screen.
 *
 * Every value shown here is read from the design tokens; nothing on this page
 * hard-codes a colour.
 */

const TONES: { tone: StatusTone; label: string; usedFor: string }[] = [
  {
    tone: "success",
    label: "Renewed",
    usedFor: "Completed renewal, delivered message",
  },
  {
    tone: "warning",
    label: "Due soon",
    usedFor: "Approaching due date, pending template",
  },
  {
    tone: "danger",
    label: "Overdue",
    usedFor: "Overdue follow-up or renewal, failed send",
  },
  {
    tone: "info",
    label: "Upcoming",
    usedFor: "Scheduled work, informational state",
  },
  {
    tone: "neutral",
    label: "Not scheduled",
    usedFor: "Inactive, archived, unavailable",
  },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function DesignPreviewPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Design preview
        </h2>
        <StatusBadge tone="info" label="Design preview · not product data" />
      </div>

      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Internal reference for verifying the design tokens in light and dark.
        Nothing here is a CRM screen and no value shown is real business data.
      </p>

      <Separator />

      <Section
        title="Backdrop transmission"
        description="The same glass tier at opposite ends of the canvas, placed high where the indigo and cyan sources of the ambient field are strongest. The fill, border and blur are identical, so any difference between the two panels is the background transmitting through them."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="surface-glass rounded-xl p-6 sm:min-h-36">
            <p className="text-sm font-semibold text-foreground">
              Glass over the indigo region
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Identical fill, border and blur to the panel on the right.
            </p>
          </div>
          <div className="surface-glass rounded-xl p-6 sm:min-h-36">
            <p className="text-sm font-semibold text-foreground">
              Glass over the cyan region
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Identical fill, border and blur to the panel on the left.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Surface tiers"
        description="Glass is reserved for navigation, top-level summary surfaces and selected emphasis. Data-heavy areas use the opaque tiers."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="surface-glass rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground">Glass</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sidebar, top bar, summary cards. The ambient field reads through
              it.
            </p>
            <div className="surface-glass-strong mt-3 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-foreground">
                Selected emphasis — one step brighter
              </p>
            </div>
          </div>
          <div className="surface-elevated rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground">Elevated</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Section panels and widget containers.
            </p>
          </div>
          <div className="surface-solid rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground">Solid</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tables, forms, dialogs, menus. No blur, fully opaque.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Status treatments"
        description="Every status pairs an icon and a text label with its colour, so it never depends on colour alone."
      >
        <div className="surface-solid divide-y divide-border rounded-xl">
          {TONES.map((t) => (
            <div
              key={t.tone}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
            >
              <StatusBadge tone={t.tone} label={t.label} />
              <span className="text-sm text-muted-foreground">{t.usedFor}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Actions"
        description="Focus rings are visible on every control. Tab through to verify."
      >
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </Section>

      <Section
        title="Typography"
        description="One scale, identical in both themes."
      >
        <div className="surface-solid space-y-2 rounded-xl p-5">
          <p className="text-2xl font-semibold tracking-tight">
            Heading — 24px semibold
          </p>
          <p className="text-base font-semibold">Subheading — 16px semibold</p>
          <p className="text-sm">Body — 14px regular</p>
          <p className="text-sm text-muted-foreground">
            Muted body — 14px, meets 4.5:1 on every surface tier
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            Mono caption — 12px
          </p>
        </div>
      </Section>
    </div>
  );
}
