/**
 * Wireframe flow registry.
 *
 * One source of truth for every wireframe screen: the index cards, the
 * Previous/Next controls and the step counters all read this. Adding a screen
 * here puts it into the presentation sequence automatically.
 *
 * Deliberately data-only (no JSX, no icon components) so it can be imported by
 * server components and by the client-side presentation chrome alike.
 */

export type Device = "desktop" | "mobile";

export type Step = {
  /** Route path. */
  readonly href: string;
  /** Short label used in the step rail. */
  readonly label: string;
  /** Screen heading shown in the presentation chrome. */
  readonly title: string;
  /** One line explaining what the client should look at. */
  readonly summary: string;
  readonly device: Device;
};

export type Flow = {
  readonly id: string;
  readonly name: string;
  /** Lucide icon name, resolved by the component that renders the card. */
  readonly icon:
    "Upload" | "MessageCircle" | "Smartphone" | "LayoutDashboard" | "Settings";
  readonly description: string;
  readonly device: Device | "both";
  readonly steps: readonly Step[];
};

export const FLOWS: readonly Flow[] = [
  {
    id: "import",
    name: "Bulk Import",
    icon: "Upload",
    description:
      "Bring an existing spreadsheet of leads into the CRM — upload, map columns, review what is wrong, then import only the rows that are safe.",
    device: "desktop",
    steps: [
      {
        href: "/wireframes/import/upload",
        label: "Upload",
        title: "Upload file",
        summary:
          "The file is read for structure only. No records exist in the CRM yet.",
        device: "desktop",
      },
      {
        href: "/wireframes/import/map",
        label: "Map columns",
        title: "Map columns to CRM fields",
        summary:
          "The CRM suggests obvious matches. Anything it cannot match is a decision for the admin, never an automatic one.",
        device: "desktop",
      },
      {
        href: "/wireframes/import/validate",
        label: "Validate",
        title: "Validation summary",
        summary:
          "Every row is classified before anything is written. Valid rows are never held back by invalid ones.",
        device: "desktop",
      },
      {
        href: "/wireframes/import/resolve",
        label: "Resolve",
        title: "Resolve issues",
        summary:
          "Each problem row carries its own fix. Nothing is merged or overwritten.",
        device: "desktop",
      },
      {
        href: "/wireframes/import/confirm",
        label: "Confirm",
        title: "Confirm and process",
        summary:
          "One explicit confirmation, then processing continues in the background.",
        device: "desktop",
      },
      {
        href: "/wireframes/import/result",
        label: "Result",
        title: "Import result and history",
        summary:
          "What was created, what was skipped, and a record of every previous import.",
        device: "desktop",
      },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "MessageCircle",
    description:
      "A shared inbox for the team on desktop, and a one-handed conversation screen for salespeople on the phone.",
    device: "both",
    steps: [
      {
        href: "/wireframes/whatsapp/inbox",
        label: "Shared inbox",
        title: "Shared WhatsApp inbox",
        summary:
          "Every customer conversation in one place, with an owner and a status.",
        device: "desktop",
      },
      {
        href: "/wireframes/whatsapp/conversation",
        label: "Conversation",
        title: "WhatsApp conversation",
        summary:
          "A CRM conversation screen that uses WhatsApp as the channel — with the customer context needed to act.",
        device: "desktop",
      },
      {
        href: "/wireframes/whatsapp/mobile-inbox",
        label: "Phone inbox",
        title: "WhatsApp inbox on a phone",
        summary:
          "The salesperson's own conversations, ordered by what needs dealing with first.",
        device: "mobile",
      },
      {
        href: "/wireframes/whatsapp/mobile",
        label: "On the phone",
        title: "Conversation on a phone",
        summary: "The same conversation, reachable with one thumb.",
        device: "mobile",
      },
      {
        href: "/wireframes/whatsapp/templates",
        label: "Templates",
        title: "Choose a message template",
        summary:
          "Approved templates only, previewed before sending. Administrators decide what appears here.",
        device: "mobile",
      },
      {
        href: "/wireframes/whatsapp/states",
        label: "Control states",
        title: "When sending is blocked",
        summary:
          "What the salesperson sees when WhatsApp is not connected, the customer opted out, or a message fails.",
        device: "desktop",
      },
    ],
  },
  {
    id: "sales",
    name: "Salesperson Daily Workflow",
    icon: "Smartphone",
    description:
      "The three screens an A&S Fincare salesperson uses all day on a phone: what needs attention, the record, and the result of the call.",
    device: "mobile",
    steps: [
      {
        href: "/wireframes/sales/today",
        label: "Today",
        title: "Today's work",
        summary:
          "Answers one question on opening the app: what needs my attention today?",
        device: "mobile",
      },
      {
        href: "/wireframes/sales/record",
        label: "Record",
        title: "Lead detail",
        summary:
          "Everything needed to make the call, with Call opening the phone's own dialler.",
        device: "mobile",
      },
      {
        href: "/wireframes/sales/outcome",
        label: "Outcome",
        title: "Record the result",
        summary:
          "Back from the call: log what happened and schedule the next step in one pass.",
        device: "mobile",
      },
    ],
  },
  {
    id: "admin-dashboard",
    name: "Admin Dashboard",
    icon: "LayoutDashboard",
    description:
      "The management view: how the team's work is progressing today, across follow-ups, renewals, pipeline and workload.",
    device: "desktop",
    steps: [
      {
        href: "/wireframes/admin/dashboard",
        label: "Dashboard",
        title: "Admin dashboard",
        summary:
          "Operational metrics only — no revenue or conversion analytics the specification does not define.",
        device: "desktop",
      },
    ],
  },
  {
    id: "admin-settings",
    name: "Admin Settings",
    icon: "Settings",
    description:
      "How A&S Fincare adapts the CRM to its own business — users, pipeline, products, reminders and templates — without a developer.",
    device: "desktop",
    steps: [
      {
        href: "/wireframes/admin/settings",
        label: "Settings hub",
        title: "Settings",
        summary: "Everything an administrator can configure, grouped by job.",
        device: "desktop",
      },
      {
        href: "/wireframes/admin/users",
        label: "Users",
        title: "Users and roles",
        summary:
          "Who can see what. Deactivating a user keeps their history intact.",
        device: "desktop",
      },
      {
        href: "/wireframes/admin/pipeline",
        label: "Pipeline",
        title: "Lead pipeline",
        summary:
          "Stages the business controls. Existing leads keep the stage they already have.",
        device: "desktop",
      },
      {
        href: "/wireframes/admin/configuration",
        label: "Configuration",
        title: "Products, reminders and templates",
        summary:
          "The settings A&S Fincare will change most often, in one place.",
        device: "desktop",
      },
    ],
  },
];

/** Every step, flattened into presentation order. */
export const SEQUENCE: readonly (Step & {
  flowId: string;
  flowName: string;
})[] = FLOWS.flatMap((flow) =>
  flow.steps.map((step) => ({
    ...step,
    flowId: flow.id,
    flowName: flow.name,
  })),
);

export const INDEX_HREF = "/wireframes";

export type Position = {
  readonly step: (typeof SEQUENCE)[number];
  readonly previous: (typeof SEQUENCE)[number] | null;
  readonly next: (typeof SEQUENCE)[number] | null;
  /** 1-based index within the whole presentation. */
  readonly indexInSequence: number;
  /** 1-based index within the step's own flow. */
  readonly indexInFlow: number;
  readonly flow: Flow;
};

/** Resolve a pathname to its place in the presentation sequence. */
export function locate(pathname: string): Position | null {
  const i = SEQUENCE.findIndex((s) => s.href === pathname);
  if (i === -1) return null;
  const step = SEQUENCE[i]!;
  const flow = FLOWS.find((f) => f.id === step.flowId)!;
  return {
    step,
    previous: i > 0 ? SEQUENCE[i - 1]! : null,
    next: i < SEQUENCE.length - 1 ? SEQUENCE[i + 1]! : null,
    indexInSequence: i + 1,
    indexInFlow: flow.steps.findIndex((s) => s.href === step.href) + 1,
    flow,
  };
}
