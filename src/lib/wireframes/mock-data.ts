/**
 * Wireframe mock data.
 *
 * Every value shown in the /wireframes routes comes from this file. Nothing
 * here reaches production code, and no wireframe screen queries Supabase,
 * PostgreSQL or any network service — the screens are presentation artefacts
 * that demonstrate approved workflows to A&S Fincare.
 *
 * Names, products and numbers are illustrative but realistic for a Kerala
 * insurance and financial-services desk. Phone numbers use the reserved
 * Indian test range so none of them can dial a real person.
 */

export const WORKSPACE = {
  name: "A&S Fincare",
  today: "Friday, 11 September 2026",
  todayShort: "Fri, 11 Sep 2026",
} as const;

/**
 * Who the DESKTOP wireframes are presented as.
 *
 * The admin dashboard and the settings screens are an administrator's view,
 * so this persona keeps the administrator role.
 */
export const CURRENT_USER = {
  name: "Arun Menon",
  firstName: "Arun",
  role: "Admin",
  initials: "AM",
} as const;

/**
 * Who the MOBILE wireframes are presented as.
 *
 * The phone screens demonstrate a salesperson's day, and the actions they are
 * allowed to take differ from an administrator's — assignment in particular
 * (spec §162). Keeping this separate from `CURRENT_USER` means the mobile
 * screens can show the sales role without the admin wireframes inheriting it.
 */
export const SALES_PERSONA = {
  name: "Sneha Thomas",
  firstName: "Sneha",
  role: "Sales Executive",
  initials: "ST",
} as const;

/* ------------------------------------------------------------------ people */

export type Owner = {
  id: string;
  name: string;
  initials: string;
  role: "Owner" | "Admin" | "Manager" | "Staff";
};

export const TEAM: readonly Owner[] = [
  { id: "u1", name: "Arun Menon", initials: "AM", role: "Admin" },
  { id: "u2", name: "Sneha Thomas", initials: "ST", role: "Staff" },
  { id: "u3", name: "Vikram Shah", initials: "VS", role: "Manager" },
  { id: "u4", name: "Neha Thomas", initials: "NT", role: "Staff" },
  { id: "u5", name: "Fathima Rasheed", initials: "FR", role: "Staff" },
];

/* --------------------------------------------------------- Flow A: import */

export const IMPORT_FILE = {
  name: "leads-september.xlsx",
  size: "184 KB",
  rows: 428,
  columns: 11,
  uploadedAt: "11 Sep 2026, 10:04 AM",
} as const;

export type MappingStatus =
  | "suggested"
  | "confirmed"
  | "required-missing"
  | "needs-review"
  | "custom"
  | "ignored";

export type ColumnMapping = {
  id: string;
  uploadedColumn: string;
  sampleValue: string;
  crmField: string;
  status: MappingStatus;
  /** Shown beneath the row when the mapping needs a decision. */
  note?: string;
  required?: boolean;
};

export const COLUMN_MAPPINGS: readonly ColumnMapping[] = [
  {
    id: "c1",
    uploadedColumn: "Name",
    sampleValue: "Ramesh Kumar",
    crmField: "Lead Name",
    status: "suggested",
    required: true,
  },
  {
    id: "c2",
    uploadedColumn: "Mobile",
    sampleValue: "70000 12345",
    crmField: "Phone Number",
    status: "suggested",
    required: true,
  },
  {
    id: "c3",
    uploadedColumn: "Email ID",
    sampleValue: "ramesh.k@example.in",
    crmField: "Email",
    status: "suggested",
  },
  {
    id: "c4",
    uploadedColumn: "Executive",
    sampleValue: "Joseph K",
    crmField: "Record Owner",
    status: "needs-review",
    note: 'Record Owner "Joseph K" could not be matched to an active CRM user. Map it to an existing user, or leave those rows unassigned.',
  },
  {
    id: "c5",
    uploadedColumn: "Status",
    sampleValue: "Follow Up",
    crmField: "Lead Stage",
    status: "needs-review",
    note: '"Follow Up" does not match an active pipeline stage. Map it to an existing stage — import never creates stages.',
  },
  {
    id: "c6",
    uploadedColumn: "Policy",
    sampleValue: "Health Insurance",
    crmField: "Product / Service Interested In",
    status: "suggested",
  },
  {
    id: "c7",
    uploadedColumn: "Vehicle Number",
    sampleValue: "KL-07-CM-4412",
    crmField: "Vehicle Number — Custom Field",
    status: "custom",
  },
  {
    id: "c8",
    uploadedColumn: "Source",
    sampleValue: "Walk-in",
    crmField: "Lead Source",
    status: "suggested",
  },
  {
    id: "c9",
    uploadedColumn: "Renewal",
    sampleValue: "26-09-2026",
    crmField: "Select CRM field",
    status: "required-missing",
    note: "Not mapped yet. Leave it unmapped to exclude the column, or choose a CRM field.",
  },
  {
    id: "c10",
    uploadedColumn: "Remarks",
    sampleValue: "Called twice, asked to call back",
    crmField: "Notes",
    status: "suggested",
  },
  {
    id: "c11",
    uploadedColumn: "Entry No.",
    sampleValue: "SEP-0417",
    crmField: "Do not import",
    status: "ignored",
  },
];

/** CRM fields offered in the mapping dropdown. Nothing here is created by import. */
export const CRM_FIELDS: readonly string[] = [
  "Lead Name",
  "Phone Number",
  "Email",
  "Record Owner",
  "Lead Stage",
  "Lead Source",
  "Product / Service Interested In",
  "Notes",
  "Vehicle Number — Custom Field",
  "Policy Number — Custom Field",
  "Do not import",
];

export const VALIDATION_TOTALS = {
  found: 428,
  ready: 390,
  duplicates: 18,
  attention: 12,
  cannotImport: 8,
} as const;

export type IssueCategory = "attention" | "duplicate" | "cannot-import";

export type ValidationIssue = {
  row: number;
  name: string;
  detail: string;
  problem: string;
  category: IssueCategory;
  /** Actions offered for this row. The first is the suggested one. */
  actions: readonly string[];
};

export const VALIDATION_ISSUES: readonly ValidationIssue[] = [
  {
    row: 14,
    name: "Ramesh Kumar",
    detail: "No phone, no email",
    problem: "Phone and email are both missing",
    category: "cannot-import",
    actions: ["Edit row", "Keep outside import"],
  },
  {
    row: 31,
    name: "Priya Nair",
    detail: "priya.nair@@example",
    problem: "Invalid email format",
    category: "attention",
    actions: ["Edit row", "Import without email", "Keep outside import"],
  },
  {
    row: 47,
    name: "Anitha Desai",
    detail: "Renewal: 31-14-2026",
    problem: "Invalid date format",
    category: "attention",
    actions: ["Edit row", "Import without date", "Keep outside import"],
  },
  {
    row: 89,
    name: "John Thomas",
    detail: "Executive: Joseph K",
    problem: "Unknown Record Owner",
    category: "attention",
    actions: ["Map to an existing user", "Leave unassigned", "Edit row"],
  },
  {
    row: 112,
    name: "Suresh Pillai",
    detail: "Status: Follow Up",
    problem: "Unknown Lead Stage",
    category: "attention",
    actions: ["Map to an existing stage", "Use first active stage", "Edit row"],
  },
  {
    row: 146,
    name: "Meera Krishnan",
    detail: "70000 33115 — matches Lead #2041",
    problem: "Possible duplicate phone number",
    category: "duplicate",
    actions: ["Skip duplicate", "Import as new", "Open existing record"],
  },
  {
    row: 203,
    name: "Farhan Ali",
    detail: "farhan.ali@example.in — matches Customer #881",
    problem: "Possible duplicate email",
    category: "duplicate",
    actions: ["Skip duplicate", "Import as new", "Open existing record"],
  },
  {
    row: 258,
    name: "(blank)",
    detail: "Row has a phone number only",
    problem: "Lead Name is missing",
    category: "cannot-import",
    actions: ["Edit row", "Keep outside import"],
  },
];

export const IMPORT_RESULT = {
  imported: 390,
  skippedDuplicates: 18,
  excluded: 20,
  startedAt: "11 Sep 2026, 10:12 AM",
  finishedAt: "11 Sep 2026, 10:13 AM",
} as const;

export type ImportHistoryRow = {
  id: string;
  filename: string;
  recordType: "Leads" | "Customers";
  user: string;
  date: string;
  status: "Completed" | "Completed with errors" | "Cancelled";
  result: string;
};

export const IMPORT_HISTORY: readonly ImportHistoryRow[] = [
  {
    id: "h1",
    filename: "leads-september.xlsx",
    recordType: "Leads",
    user: "Arun Menon",
    date: "11 Sep 2026",
    status: "Completed with errors",
    result: "390 imported · 18 skipped · 20 excluded",
  },
  {
    id: "h2",
    filename: "motor-renewals-aug.csv",
    recordType: "Customers",
    user: "Vikram Shah",
    date: "28 Aug 2026",
    status: "Completed",
    result: "212 imported",
  },
  {
    id: "h3",
    filename: "walk-in-leads-aug.xlsx",
    recordType: "Leads",
    user: "Arun Menon",
    date: "14 Aug 2026",
    status: "Completed with errors",
    result: "96 imported · 4 excluded",
  },
  {
    id: "h4",
    filename: "customer-master.csv",
    recordType: "Customers",
    user: "Arun Menon",
    date: "02 Aug 2026",
    status: "Cancelled",
    result: "Cancelled at column mapping",
  },
];

/* ------------------------------------------------------- Flow B: WhatsApp */

export type DeliveryState =
  "sending" | "sent" | "delivered" | "read" | "failed";

export type Conversation = {
  id: string;
  person: string;
  phone: string;
  recordType: "Lead" | "Customer" | "Unknown";
  recordLabel: string;
  product: string;
  lastMessage: string;
  time: string;
  assignedTo: string | null;
  status: "Open" | "Closed";
  unread: number;
  delivery: DeliveryState;
  /**
   * Who spoke last. Together with `unread` it is what separates a
   * conversation still waiting on the customer from one waiting on us —
   * derived in the UI rather than stored as a status the spec does not define.
   */
  lastDirection: "in" | "out";
  /** Set when a follow-up on the related record falls due. */
  followUpDue?: string;
};

export const CONVERSATIONS: readonly Conversation[] = [
  {
    id: "w1",
    person: "Ramesh Kumar",
    phone: "70000 12345",
    recordType: "Customer",
    recordLabel: "Customer · #881",
    product: "Health Insurance",
    lastMessage: "Yes, please renew it",
    time: "10:32 AM",
    assignedTo: "Sneha Thomas",
    status: "Open",
    unread: 2,
    delivery: "read",
    lastDirection: "in",
  },
  {
    id: "w7",
    person: "Meera Krishnan",
    phone: "70000 33115",
    recordType: "Lead",
    recordLabel: "Lead · #2041",
    product: "Health Insurance",
    lastMessage: "Can you send the premium for the family plan?",
    time: "9:58 AM",
    assignedTo: "Sneha Thomas",
    status: "Open",
    unread: 1,
    delivery: "read",
    lastDirection: "in",
  },
  {
    id: "w8",
    person: "Rajesh Menon",
    phone: "70000 61204",
    recordType: "Lead",
    recordLabel: "Lead · #2107",
    product: "Health Insurance",
    lastMessage: "Sending the revised quote now",
    time: "9:20 AM",
    assignedTo: "Sneha Thomas",
    status: "Open",
    unread: 0,
    delivery: "failed",
    lastDirection: "out",
  },
  {
    id: "w9",
    person: "Vikram Reddy",
    phone: "70000 77410",
    recordType: "Customer",
    recordLabel: "Customer · #904",
    product: "Motor Insurance",
    lastMessage: "Renewal reminder sent for 20 September",
    time: "Yesterday",
    assignedTo: "Sneha Thomas",
    status: "Open",
    unread: 0,
    delivery: "delivered",
    lastDirection: "out",
    followUpDue: "Follow-up due today, 4:00 PM",
  },
  {
    id: "w2",
    person: "Priya Iyer",
    phone: "70000 41288",
    // Priya is a LEAD in this snapshot, matching LEAD_RECORD and the
    // salesperson lead flow. She was previously labelled "Customer · #642"
    // here, which contradicted her own lead-detail screen — the same person
    // shown as two different record types at the same moment.
    recordType: "Lead",
    recordLabel: "Lead · #2088",
    product: "Health Insurance",
    lastMessage: "Thank you, received the quote comparison",
    time: "9:45 AM",
    assignedTo: "Sneha Thomas",
    status: "Open",
    unread: 0,
    delivery: "read",
    lastDirection: "in",
  },
  {
    id: "w10",
    person: "Sneha Nair",
    phone: "70000 88132",
    recordType: "Customer",
    recordLabel: "Customer · #712",
    product: "PUC Certificate",
    lastMessage: "Shared the checklist of documents to bring",
    time: "Yesterday",
    assignedTo: "Sneha Thomas",
    status: "Open",
    unread: 0,
    delivery: "read",
    lastDirection: "out",
  },
  {
    id: "w11",
    person: "Fathima Rasheed",
    phone: "70000 24507",
    recordType: "Customer",
    recordLabel: "Customer · #688",
    product: "Motor Insurance",
    lastMessage: "Renewal completed, thank you for the help",
    time: "09 Sep",
    assignedTo: "Sneha Thomas",
    status: "Closed",
    unread: 0,
    delivery: "read",
    lastDirection: "in",
  },
  {
    id: "w3",
    person: "70000 33220",
    phone: "70000 33220",
    recordType: "Unknown",
    recordLabel: "No matching record",
    product: "—",
    lastMessage: "I need more details about motor insurance",
    time: "9:12 AM",
    assignedTo: null,
    status: "Open",
    unread: 1,
    delivery: "delivered",
    lastDirection: "in",
  },
  {
    id: "w4",
    person: "Suresh Pillai",
    phone: "70000 55210",
    recordType: "Customer",
    recordLabel: "Customer · #517",
    product: "PUC Certificate",
    lastMessage: "Document request sent",
    time: "Yesterday",
    assignedTo: "Neha Thomas",
    status: "Open",
    unread: 0,
    delivery: "failed",
    lastDirection: "out",
  },
  {
    id: "w5",
    person: "Anitha Desai",
    phone: "70000 77034",
    recordType: "Lead",
    recordLabel: "Lead · #2044",
    product: "Motor Insurance",
    lastMessage: "Can you share the quote again?",
    time: "Yesterday",
    assignedTo: "Arun Menon",
    status: "Open",
    unread: 0,
    delivery: "read",
    lastDirection: "in",
  },
  {
    id: "w6",
    person: "Farhan Ali",
    phone: "70000 90876",
    recordType: "Customer",
    recordLabel: "Customer · #733",
    product: "Motor Insurance",
    lastMessage: "Renewal completed. Thanks for your help.",
    time: "09 Sep",
    assignedTo: "Vikram Shah",
    status: "Closed",
    unread: 0,
    delivery: "read",
    lastDirection: "in",
  },
];

export type Message = {
  id: string;
  direction: "in" | "out";
  body: string;
  time: string;
  delivery?: DeliveryState;
  /** Set when the message was sent from an approved template. */
  template?: string;
  failureReason?: string;
};

export const THREAD: readonly Message[] = [
  {
    id: "m1",
    direction: "out",
    body: "Hello Ramesh, this is A&S Fincare. Your Health Insurance policy with Star Health expires on 26 September 2026. Would you like us to assist with the renewal?",
    time: "10:15 AM",
    delivery: "read",
    template: "Policy renewal reminder",
  },
  {
    id: "m2",
    direction: "in",
    body: "Yes, please renew it",
    time: "10:32 AM",
  },
  {
    id: "m3",
    direction: "in",
    body: "Same cover as last year is fine. Can you send the payment link?",
    time: "10:32 AM",
  },
  {
    id: "m4",
    direction: "out",
    body: "Certainly. I will confirm the premium with Star Health and send the payment link before 4 PM today.",
    time: "10:38 AM",
    delivery: "delivered",
  },
  {
    id: "m5",
    direction: "out",
    body: "Could you confirm a convenient time for us to discuss your renewal options?",
    time: "10:41 AM",
    delivery: "failed",
    failureReason:
      "Message not delivered — the customer's number was unreachable.",
  },
];

export type Template = {
  id: string;
  name: string;
  category: "Utility" | "Marketing";
  body: string;
  approved: boolean;
};

export const TEMPLATES: readonly Template[] = [
  {
    id: "t1",
    name: "Follow-up reminder",
    category: "Utility",
    body: "Hello {{customer_name}}, following up on our conversation about {{product}}. Let me know a convenient time to call you.",
    approved: true,
  },
  {
    id: "t2",
    name: "Policy renewal reminder",
    category: "Utility",
    body: "Hello {{customer_name}}, your {{product}} policy expires on {{due_date}}. Would you like A&S Fincare to assist with the renewal?",
    approved: true,
  },
  {
    id: "t3",
    name: "Document request",
    category: "Utility",
    body: "Hello {{customer_name}}, to process your {{product}} we need a copy of {{document}}. You can reply to this message with a photo.",
    approved: true,
  },
  {
    id: "t4",
    name: "Appointment confirmation",
    category: "Utility",
    body: "Hello {{customer_name}}, confirming your appointment at the A&S Fincare office on {{date}} at {{time}}.",
    approved: true,
  },
];

/* ------------------------------------------------ Flow C: salesperson day */

export type WorkItem = {
  id: string;
  person: string;
  product: string;
  due: string;
  status: "Due" | "Overdue" | "Scheduled" | "New" | "Unread";
  type: "Call" | "WhatsApp" | "Renewal" | "Lead";
  note?: string;
};

export const DUE_TODAY: readonly WorkItem[] = [
  {
    id: "d1",
    person: "Priya Iyer",
    product: "Health Insurance",
    due: "10:00 AM",
    status: "Due",
    type: "Call",
    note: "Renewal decision expected",
  },
  {
    id: "d2",
    person: "Ramesh Kumar",
    product: "Motor Insurance",
    due: "11:30 AM",
    status: "Due",
    type: "Call",
    note: "Send quote after the call",
  },
  {
    id: "d3",
    person: "Sneha Nair",
    product: "PUC Certificate",
    due: "1:00 PM",
    status: "Scheduled",
    type: "WhatsApp",
    note: "Share document checklist",
  },
];

export const OVERDUE: readonly WorkItem[] = [
  {
    id: "o1",
    person: "Rajesh Menon",
    product: "Health Insurance",
    due: "Yesterday, 3:30 PM",
    status: "Overdue",
    type: "Call",
    note: "Second attempt",
  },
  {
    id: "o2",
    person: "Amit Shah",
    product: "Motor Insurance",
    due: "09 Sep, 4:00 PM",
    status: "Overdue",
    type: "Call",
  },
];

export const NEW_LEADS: readonly WorkItem[] = [
  {
    id: "n1",
    person: "Meera Krishnan",
    product: "Health Insurance",
    due: "Assigned 8:50 AM",
    status: "New",
    type: "Lead",
    note: "Walk-in enquiry",
  },
  {
    id: "n2",
    person: "Fathima Rasheed",
    product: "Motor Insurance",
    due: "Assigned yesterday",
    status: "New",
    type: "Lead",
  },
];

export const LEAD_RECORD = {
  name: "Priya Iyer",
  phone: "70000 41288",
  phoneDial: "+917000041288",
  email: "priya.iyer@example.in",
  product: "Health Insurance",
  stage: "Interested",
  recordType: "Lead" as const,
  reference: "Lead · #2088",
  owner: "Sneha Thomas",
  nextFollowUp: "Today, 10:00 AM · Call",
  since: "29 Aug 2026",
};

export type Activity = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "call" | "whatsapp" | "note" | "stage" | "created" | "followup";
};

export const RECORD_ACTIVITY: readonly Activity[] = [
  {
    id: "a1",
    title: "Call — Connected — logged by Sneha",
    detail: "Asked for the premium breakdown before deciding.",
    time: "Yesterday, 4:15 PM",
    kind: "call",
  },
  {
    id: "a2",
    title: "WhatsApp message sent",
    detail: "Policy renewal reminder template",
    time: "Yesterday, 11:02 AM",
    kind: "whatsapp",
  },
  {
    id: "a3",
    title: "Stage changed",
    detail: "Contacted → Interested",
    time: "08 Sep, 3:40 PM",
    kind: "stage",
  },
  {
    id: "a4",
    title: "Follow-up scheduled by Sneha",
    detail: "Call · 11 Sep, 10:00 AM",
    time: "08 Sep, 3:38 PM",
    kind: "followup",
  },
  {
    id: "a5",
    title: "Lead created by Sneha",
    detail: "Source: Walk-in",
    time: "29 Aug, 9:15 AM",
    kind: "created",
  },
];

/** Spec §27.3 — the V1 outcome list, in order. */
/**
 * Call outcomes, exactly as spec §27.3 defines them for V1.
 *
 * Stable values, separate display labels: every screen that cares about an
 * outcome ("did they ask to be called back?") compares an identifier rather
 * than a piece of prose, so rewording a label can never quietly break the
 * behaviour attached to it.
 *
 * Two outcomes this list used to carry — "Not interested" and "Converted" —
 * are gone on purpose. They are lead-stage changes, not call results, and
 * §27.3 is explicit that saving an outcome "must not automatically change the
 * Lead stage or the Customer status". They remain valid elsewhere as pipeline
 * stages and conversion events.
 */
export type CallOutcomeValue =
  | "connected"
  | "no_answer"
  | "busy_or_unreachable"
  | "callback_requested"
  | "left_voicemail"
  | "wrong_number"
  | "other";

export const CALL_OUTCOMES: readonly {
  value: CallOutcomeValue;
  label: string;
}[] = [
  { value: "connected", label: "Connected" },
  { value: "no_answer", label: "No Answer" },
  { value: "busy_or_unreachable", label: "Busy or Unreachable" },
  { value: "callback_requested", label: "Call Back Requested" },
  { value: "left_voicemail", label: "Left Voicemail" },
  { value: "wrong_number", label: "Wrong Number" },
  { value: "other", label: "Other" },
];

export function callOutcomeLabel(value: CallOutcomeValue): string {
  return CALL_OUTCOMES.find((o) => o.value === value)?.label ?? value;
}

export const FOLLOW_UP_TYPES: readonly string[] = [
  "Call",
  "WhatsApp",
  "Email",
  "Visit",
  "Other",
];

/* ------------------------------------------- Flow: customer record (mobile) */

/**
 * Ramesh Kumar's customer record — the single source for his identity.
 *
 * The WhatsApp conversation, the desktop conversation context panel and the
 * mobile customer record all read from here, so the reference, contact
 * details, owner and renewal date cannot drift apart between screens.
 *
 * Two roles are deliberately different and must stay that way (spec §87):
 * the CONVERSATION is assigned to Sneha Thomas, while the customer RECORD is
 * still owned by Arun Menon. Reassigning a conversation does not change the
 * record owner.
 */
export const CUSTOMER_RECORD = {
  name: "Ramesh Kumar",
  reference: "Customer · #881",
  status: "Active" as const,
  since: "14 Mar 2024",
  sinceLabel: "Customer since 2024",
  // Reserved Indian test range, and a reserved `.example` domain: neither can
  // reach a real person.
  phone: "70000 12345",
  email: "ramesh.kumar@mail.example",
  preferredChannel: "WhatsApp",
  /** Record owner — NOT the conversation assignee, NOT the permitted user. */
  owner: "Arun Menon",
  /**
   * Salespeople the record has been explicitly shared with.
   *
   * This is what grants access to the customer record, and it is deliberately
   * its own field. Access is NOT derived from `conversationAssignee`: holding
   * a WhatsApp conversation is a messaging assignment, not a grant of the
   * whole customer file. Presentation-only — the real mechanism (a sharing
   * table, a team, a manager-configured rule) is still to be decided.
   */
  permittedUsers: ["Sneha Thomas"] as readonly string[],
  /** Who holds the WhatsApp conversation. Grants no record access by itself. */
  conversationAssignee: "Sneha Thomas",
  tags: ["Health Insurance", "Motor Insurance", "Renewal due"],
} as const;

export type UpcomingAction = {
  id: string;
  date: string;
  kind: "Follow-up" | "Renewal";
  detail: string;
  assignedTo: string;
  /** Spec §75: overdue actions appear before future ones. */
  overdue?: boolean;
};

export const CUSTOMER_UPCOMING: readonly UpcomingAction[] = [
  {
    id: "ua1",
    date: "14 Sep 2026, 10:00 AM",
    kind: "Follow-up",
    detail: "Call to confirm the renewal premium",
    assignedTo: "Sneha Thomas",
  },
  {
    id: "ua2",
    date: "26 Sep 2026",
    kind: "Renewal",
    detail: "Health Insurance renewal falls due",
    assignedTo: "Arun Menon",
  },
];

export type CustomerPolicy = {
  id: string;
  product: string;
  provider: string;
  /** Obviously fictional — never a real policy or government identifier. */
  reference: string;
  start: string;
  renewal: string;
  status: "Due soon" | "Active";
  amount: string;
  daysLeft?: number;
};

export const CUSTOMER_POLICIES: readonly CustomerPolicy[] = [
  {
    id: "p1",
    product: "Health Insurance",
    provider: "Star Health",
    reference: "POL-TEST-881-A",
    start: "26 Sep 2024",
    renewal: "26 Sep 2026",
    status: "Due soon",
    amount: "₹18,400 / year",
    daysLeft: 15,
  },
  {
    id: "p2",
    product: "Motor Insurance",
    provider: "Shield General (sample provider)",
    reference: "POL-TEST-881-B",
    start: "11 Jan 2025",
    renewal: "11 Jan 2027",
    status: "Active",
    amount: "₹7,250 / year",
  },
];

export type CustomerActivity = {
  id: string;
  kind: "whatsapp" | "call" | "followup" | "note" | "renewal" | "created";
  title: string;
  detail: string;
  by: string;
  time: string;
};

/**
 * One chronological history for the customer (spec §76), newest first.
 *
 * WhatsApp messages, calls and follow-ups all land here rather than in
 * separate per-channel timelines. The oldest entry keeps the lead history
 * alive after conversion, which §76 illustrates directly.
 */
export const CUSTOMER_ACTIVITY: readonly CustomerActivity[] = [
  {
    id: "ca1",
    kind: "whatsapp",
    title: "WhatsApp message failed",
    detail: "Renewal options message could not be delivered",
    by: "Sneha Thomas",
    time: "Today, 10:41 AM",
  },
  {
    id: "ca2",
    kind: "whatsapp",
    title: "WhatsApp reply received",
    detail: "“Yes, please renew it”",
    by: "From Ramesh Kumar",
    time: "Today, 10:32 AM",
  },
  {
    id: "ca3",
    kind: "whatsapp",
    title: "WhatsApp reminder sent",
    detail: "Health Insurance renewal, policy renewal reminder template",
    by: "Sneha Thomas",
    time: "Today, 10:15 AM",
  },
  {
    id: "ca4",
    kind: "call",
    title: "Call — Connected",
    detail: "Confirmed he wants to renew on the same cover",
    by: "Sneha Thomas",
    time: "09 Sep, 4:15 PM",
  },
  {
    id: "ca5",
    kind: "followup",
    title: "Follow-up scheduled",
    detail: "Call · 14 Sep 2026, 10:00 AM",
    by: "Sneha Thomas",
    time: "08 Sep, 3:38 PM",
  },
  {
    id: "ca6",
    kind: "note",
    title: "Note added",
    detail: "Prefers WhatsApp over calls during working hours",
    by: "Arun Menon",
    time: "02 Sep, 11:10 AM",
  },
  {
    id: "ca7",
    kind: "renewal",
    title: "Renewal reminder generated",
    detail: "Health Insurance · due 26 Sep 2026",
    by: "Reminder rule",
    time: "01 Sep, 9:00 AM",
  },
  {
    id: "ca8",
    kind: "created",
    title: "Customer created from lead",
    detail: "Converted after the first Health Insurance enquiry",
    by: "Arun Menon",
    time: "14 Mar 2024",
  },
];

/* --------------------------------------- Flow: customer directory (mobile) */

/**
 * The date the whole presentation is anchored to.
 *
 * Every relative phrase on the directory ("in 15 days", "Due today") is
 * derived from a day offset against this, so the cards can never disagree
 * with the customer record's own "Renews in 15 days".
 */
export const PRESENTATION_TODAY = "11 Sep 2026";

/**
 * The same day in the format a native date input needs.
 *
 * Kept beside PRESENTATION_TODAY rather than parsed at runtime so the two can
 * never disagree, and so no screen has to invent a second "today".
 */
export const PRESENTATION_TODAY_ISO = "2026-09-11";

export type DirectoryCustomer = {
  id: string;
  name: string;
  /** "Customer · #881" — the same shape the WhatsApp rows use. */
  reference: string;
  phone: string;
  email: string;
  /** Nearest upcoming product/service (spec §53). */
  product: string;
  /** Spec §53 allows a count where a customer holds several. */
  serviceCount?: number;
  /** Obviously fictional — never a real policy or government identifier. */
  policyRef: string;
  /** Record owner, which is not necessarily the signed-in user. */
  owner: string;
  /** Next due/renewal date and its offset in days from PRESENTATION_TODAY. */
  renewal: string;
  renewalInDays: number;
  /** Spec §66 statuses. */
  renewalStatus: "Upcoming" | "Due Today" | "Overdue" | "Renewed";
  /** Next follow-up, where one is scheduled. Negative days = overdue. */
  followUp?: { label: string; inDays: number };
  /** Spec §53 "Last Activity". */
  lastActivity: string;
  lastActivityDaysAgo: number;
  /**
   * Salespeople the record is explicitly shared with, beyond its owner.
   *
   * Together with `owner` this is the ONLY thing that decides whether a
   * customer appears in someone's directory. `conversationAssignee` does not
   * enter into it.
   */
  permittedUsers: readonly string[];
  /**
   * Who holds the WhatsApp conversation, where there is one. Shown so the
   * three roles stay visibly distinct; it grants no access on its own.
   */
  conversationAssignee?: string;
  /** Set ONLY where a record wireframe exists for this person. */
  hasRecord?: boolean;
  /** Set ONLY where a conversation wireframe exists for this person. */
  hasConversation?: boolean;
};

/**
 * Customers Sneha Thomas is permitted to work with.
 *
 * Ramesh is spread from CUSTOMER_RECORD and CUSTOMER_POLICIES rather than
 * retyped, so his phone, email, owner, policy reference and renewal date
 * cannot drift away from the record screen and the WhatsApp flow.
 *
 * Everyone else here is fictional. Where a person also appears in
 * CONVERSATIONS, the reference, phone, product and last message agree with
 * that entry — a directory that contradicted the inbox would be worse than no
 * directory at all. Leads (Meera Krishnan, Rajesh Menon, Anitha Desai) are
 * deliberately absent: this is the customer directory.
 */
export const DIRECTORY_CUSTOMERS: readonly DirectoryCustomer[] = [
  {
    id: "d881",
    name: CUSTOMER_RECORD.name,
    reference: CUSTOMER_RECORD.reference,
    phone: CUSTOMER_RECORD.phone,
    email: CUSTOMER_RECORD.email,
    product: CUSTOMER_POLICIES[0]!.product,
    serviceCount: CUSTOMER_POLICIES.length,
    policyRef: CUSTOMER_POLICIES[0]!.reference,
    owner: CUSTOMER_RECORD.owner,
    renewal: CUSTOMER_POLICIES[0]!.renewal,
    renewalInDays: CUSTOMER_POLICIES[0]!.daysLeft ?? 0,
    renewalStatus: "Upcoming",
    followUp: { label: "14 Sep 2026, 10:00 AM", inDays: 3 },
    lastActivity: "WhatsApp · Today, 10:41 AM",
    lastActivityDaysAgo: 0,
    // Three separate facts: Arun owns it, Sneha is permitted on it, Sneha
    // holds the conversation. All three come from the shared record.
    permittedUsers: CUSTOMER_RECORD.permittedUsers,
    conversationAssignee: CUSTOMER_RECORD.conversationAssignee,
    hasRecord: true,
    hasConversation: true,
  },
  {
    id: "d904",
    name: "Vikram Reddy",
    reference: "Customer · #904",
    phone: "70000 77410",
    email: "vikram.reddy@mail.example",
    product: "Motor Insurance",
    policyRef: "POL-TEST-904-A",
    owner: "Sneha Thomas",
    renewal: "20 Sep 2026",
    renewalInDays: 9,
    renewalStatus: "Upcoming",
    followUp: { label: "09 Sep 2026, 2:30 PM", inDays: -2 },
    lastActivity: "WhatsApp · Yesterday",
    lastActivityDaysAgo: 1,
    permittedUsers: [],
  },
  {
    id: "d712",
    name: "Sneha Nair",
    reference: "Customer · #712",
    phone: "70000 88132",
    email: "sneha.nair@mail.example",
    product: "PUC Certificate",
    policyRef: "PUC-TEST-712",
    owner: "Sneha Thomas",
    renewal: PRESENTATION_TODAY,
    renewalInDays: 0,
    renewalStatus: "Due Today",
    followUp: { label: "Today, 3:00 PM", inDays: 0 },
    lastActivity: "WhatsApp · Yesterday",
    lastActivityDaysAgo: 1,
    permittedUsers: [],
  },
  {
    id: "d859",
    name: "Joseph Thomas",
    reference: "Customer · #859",
    phone: "70000 51904",
    email: "joseph.thomas@mail.example",
    product: "Motor Insurance",
    policyRef: "POL-TEST-859-A",
    owner: "Sneha Thomas",
    renewal: "03 Sep 2026",
    renewalInDays: -8,
    renewalStatus: "Overdue",
    followUp: { label: "08 Sep 2026, 11:00 AM", inDays: -3 },
    lastActivity: "Call · 08 Sep",
    lastActivityDaysAgo: 3,
    permittedUsers: [],
  },
  {
    id: "d893",
    name: "Anil Varghese",
    reference: "Customer · #893",
    phone: "70000 63118",
    email: "anil.varghese@mail.example",
    product: "Travel Insurance",
    policyRef: "POL-TEST-893-A",
    owner: "Sneha Thomas",
    renewal: "24 Sep 2026",
    renewalInDays: 13,
    renewalStatus: "Upcoming",
    lastActivity: "Call · 05 Sep",
    lastActivityDaysAgo: 6,
    permittedUsers: [],
  },
  {
    id: "d921",
    name: "Lakshmi Nair",
    reference: "Customer · #921",
    phone: "70000 30276",
    email: "lakshmi.nair@mail.example",
    product: "Health Insurance",
    policyRef: "POL-TEST-921-A",
    owner: "Sneha Thomas",
    renewal: "05 Nov 2026",
    renewalInDays: 55,
    renewalStatus: "Upcoming",
    followUp: { label: "12 Sep 2026, 11:30 AM", inDays: 1 },
    lastActivity: "Note · 02 Sep",
    lastActivityDaysAgo: 9,
    permittedUsers: [],
  },
  {
    id: "d688",
    name: "Fathima Rasheed",
    reference: "Customer · #688",
    phone: "70000 24507",
    email: "fathima.rasheed@mail.example",
    product: "Motor Insurance",
    serviceCount: 3,
    policyRef: "POL-TEST-688-A",
    owner: "Sneha Thomas",
    // Renewed on 09 Sep, so the next cycle is a year out (spec §71).
    renewal: "20 Aug 2027",
    renewalInDays: 343,
    renewalStatus: "Renewed",
    lastActivity: "WhatsApp · 09 Sep",
    lastActivityDaysAgo: 2,
    permittedUsers: [],
  },
  {
    id: "d877",
    name: "Deepa Menon",
    reference: "Customer · #877",
    phone: "70000 45890",
    email: "deepa.menon@mail.example",
    product: "Health Insurance",
    serviceCount: 3,
    policyRef: "POL-TEST-877-A",
    owner: "Sneha Thomas",
    renewal: "22 Jan 2027",
    renewalInDays: 133,
    renewalStatus: "Upcoming",
    lastActivity: "Email · 21 Aug",
    lastActivityDaysAgo: 21,
    permittedUsers: [],
  },
];

/** Spec §64 uses "Next 30 Days" as the near-term renewal window. */
export const RENEWAL_WINDOW_DAYS = 30;

/* ------------------------------------------ Flow: follow-ups (mobile) */

/** Spec §40 lists exactly these Follow-up Types for V1. */
export type FollowUpType = "Call" | "WhatsApp" | "Email" | "Visit" | "Other";

export type MobileFollowUp = {
  id: string;
  person: string;
  /** Spec §43 "Record Type" — which module the follow-up belongs to. */
  recordType: "Lead" | "Customer";
  reference: string;
  /** Spec §43 "Related To". */
  product: string;
  type: FollowUpType;
  date: string;
  time: string;
  /**
   * Offset in days from PRESENTATION_TODAY. Negative is in the past.
   *
   * Every bucket, count and "3 days overdue" phrase is computed from this, so
   * there is no hard-coded total anywhere that can go stale.
   */
  dueInDays: number;
  assignedTo: string;
  note: string;
  phone: string;
  /** Set only where a record wireframe actually exists for this person. */
  record?: "lead" | "customer";
  /** Set only where a mobile conversation wireframe exists. */
  hasConversation?: boolean;
  /**
   * Present on already-completed items (spec §41 outcome/note). Holds the
   * stable §27.3 value, never the display label.
   */
  outcome?: CallOutcomeValue;
  completedOn?: string;
};

/**
 * Sneha Thomas's follow-up workload.
 *
 * VISIBILITY: spec §43 says "Staff users should primarily see follow-ups
 * assigned to them unless broader permissions are granted", and §162 gives
 * Staff/Sales no right to view all Leads/Customers. So every item here is
 * assigned to Sneha — the list is not filtered down from a wider set, because
 * a wider set is not hers to hold.
 *
 * Note that assignment of a follow-up is its own fact. Anitha Desai's WhatsApp
 * conversation belongs to Arun Menon and she is absent here; Ramesh's record is
 * owned by Arun yet his follow-up is Sneha's. Neither implies the other.
 *
 * Identities agree with the rest of the presentation: references, phones and
 * products match CONVERSATIONS, LEAD_RECORD and DIRECTORY_CUSTOMERS, and the
 * dates match the follow-ups those screens already show.
 */
export const MOBILE_FOLLOW_UPS: readonly MobileFollowUp[] = [
  {
    id: "mf1",
    person: "Joseph Thomas",
    recordType: "Customer",
    reference: "Customer · #859",
    product: "Motor Insurance",
    type: "Call",
    date: "08 Sep 2026",
    time: "11:00 AM",
    dueInDays: -3,
    assignedTo: SALES_PERSONA.name,
    note: "Renewal lapsed — confirm whether he wants to continue the cover.",
    phone: "70000 51904",
  },
  {
    id: "mf2",
    person: "Vikram Reddy",
    recordType: "Customer",
    reference: "Customer · #904",
    product: "Motor Insurance",
    type: "WhatsApp",
    date: "09 Sep 2026",
    time: "2:30 PM",
    dueInDays: -2,
    assignedTo: SALES_PERSONA.name,
    note: "Send the renewal quote he asked for on the call.",
    phone: "70000 77410",
  },
  {
    id: "mf3",
    person: "Priya Iyer",
    recordType: "Lead",
    reference: "Lead · #2088",
    product: "Health Insurance",
    type: "Call",
    date: PRESENTATION_TODAY,
    time: "10:00 AM",
    dueInDays: 0,
    assignedTo: SALES_PERSONA.name,
    note: "Renewal decision expected — she was comparing two quotes.",
    phone: "70000 41288",
    record: "lead",
  },
  {
    id: "mf4",
    person: "Sneha Nair",
    recordType: "Customer",
    reference: "Customer · #712",
    product: "PUC Certificate",
    type: "WhatsApp",
    date: PRESENTATION_TODAY,
    time: "3:00 PM",
    dueInDays: 0,
    assignedTo: SALES_PERSONA.name,
    note: "Check she has the documents from the checklist.",
    phone: "70000 88132",
  },
  {
    id: "mf5",
    person: "Meera Krishnan",
    recordType: "Lead",
    reference: "Lead · #2041",
    product: "Health Insurance",
    type: "Call",
    date: PRESENTATION_TODAY,
    time: "4:30 PM",
    dueInDays: 0,
    assignedTo: SALES_PERSONA.name,
    note: "First call after she asked for a family floater quote.",
    phone: "70000 33115",
  },
  {
    id: "mf6",
    person: "Lakshmi Nair",
    recordType: "Customer",
    reference: "Customer · #921",
    product: "Health Insurance",
    type: "Email",
    date: "12 Sep 2026",
    time: "11:30 AM",
    dueInDays: 1,
    assignedTo: SALES_PERSONA.name,
    note: "Email the revised cover summary she asked for in writing.",
    phone: "70000 30276",
  },
  {
    id: "mf7",
    person: CUSTOMER_RECORD.name,
    recordType: "Customer",
    reference: CUSTOMER_RECORD.reference,
    product: CUSTOMER_POLICIES[0]!.product,
    type: "Call",
    date: "14 Sep 2026",
    time: "10:00 AM",
    dueInDays: 3,
    assignedTo: SALES_PERSONA.name,
    note: "Confirm the renewal premium before the 26 Sep due date.",
    phone: CUSTOMER_RECORD.phone,
    record: "customer",
    hasConversation: true,
  },
  {
    id: "mf8",
    person: "Arjun Pillai",
    recordType: "Lead",
    reference: "Lead · #2119",
    product: "Motor Insurance",
    type: "Visit",
    date: "17 Sep 2026",
    time: "11:00 AM",
    dueInDays: 6,
    assignedTo: SALES_PERSONA.name,
    note: "Visit the showroom to collect the vehicle papers.",
    phone: "70000 58203",
  },
  {
    id: "mf9",
    person: "Rajesh Menon",
    recordType: "Lead",
    reference: "Lead · #2107",
    product: "Health Insurance",
    type: "Call",
    date: "10 Sep 2026",
    time: "3:30 PM",
    dueInDays: -1,
    assignedTo: SALES_PERSONA.name,
    note: "Second attempt after no answer.",
    phone: "70000 61204",
    outcome: "connected",
    completedOn: "10 Sep 2026, 3:42 PM",
  },
  {
    id: "mf10",
    person: "Fathima Rasheed",
    recordType: "Customer",
    reference: "Customer · #688",
    product: "Motor Insurance",
    type: "WhatsApp",
    date: "09 Sep 2026",
    time: "12:00 PM",
    dueInDays: -2,
    assignedTo: SALES_PERSONA.name,
    note: "Confirm the renewal went through.",
    phone: "70000 24507",
    outcome: "connected",
    completedOn: "09 Sep 2026, 12:18 PM",
  },
];

/* ------------------------------------- Records a salesperson may work with */

export type PermittedRecord = {
  id: string;
  name: string;
  recordType: "Lead" | "Customer";
  reference: string;
  product: string;
  /** Who owns the record. Shown where it is not the signed-in user. */
  owner: string;
  /** How this user reaches it: they own it, or it is explicitly shared. */
  access: "owner" | "shared";
};

/**
 * Leads owned by the signed-in salesperson.
 *
 * Priya is spread from LEAD_RECORD so her reference and product cannot drift
 * from her own detail screen. The others are hers by ownership, stated here
 * rather than inferred from anything else.
 *
 * Anitha Desai (Lead · #2044) is deliberately absent. Her WhatsApp
 * conversation is assigned to Arun Menon, and a conversation assignment is
 * not record access — the same rule the customer directory follows.
 */
export const SALES_LEADS: readonly PermittedRecord[] = [
  {
    id: "l2088",
    name: LEAD_RECORD.name,
    recordType: "Lead",
    reference: LEAD_RECORD.reference,
    product: LEAD_RECORD.product,
    owner: LEAD_RECORD.owner,
    access: "owner",
  },
  {
    id: "l2041",
    name: "Meera Krishnan",
    recordType: "Lead",
    reference: "Lead · #2041",
    product: "Health Insurance",
    owner: SALES_PERSONA.name,
    access: "owner",
  },
  {
    id: "l2107",
    name: "Rajesh Menon",
    recordType: "Lead",
    reference: "Lead · #2107",
    product: "Health Insurance",
    owner: SALES_PERSONA.name,
    access: "owner",
  },
  {
    id: "l2119",
    name: "Arjun Pillai",
    recordType: "Lead",
    reference: "Lead · #2119",
    product: "Motor Insurance",
    owner: SALES_PERSONA.name,
    access: "owner",
  },
];

/**
 * Every Lead and Customer the signed-in salesperson may work with.
 *
 * Customers come from DIRECTORY_CUSTOMERS through the SAME rule the directory
 * itself applies — owned, or explicitly shared via `permittedUsers`. Nothing
 * is added because a WhatsApp conversation happens to be assigned to her, so
 * this list and the directory can never disagree about who she may reach.
 */
export function permittedRecordsFor(user: string): readonly PermittedRecord[] {
  const customers = DIRECTORY_CUSTOMERS.filter(
    (c) => c.owner === user || c.permittedUsers.includes(user),
  ).map<PermittedRecord>((c) => ({
    id: c.id,
    name: c.name,
    recordType: "Customer",
    reference: c.reference,
    product: c.product,
    owner: c.owner,
    access: c.owner === user ? "owner" : "shared",
  }));

  return [...SALES_LEADS.filter((l) => l.owner === user), ...customers];
}

/**
 * Stable key for a record, used when one screen asks another to preselect it.
 *
 * A key, never a name and never a URL: the receiving screen looks it up among
 * the records the user may actually reach, so an unknown or tampered value
 * simply matches nothing and preselects nothing.
 */
export function recordKeyOf(r: PermittedRecord): string {
  const digits = r.reference.replace(/\D/g, "");
  return `${r.recordType.toLowerCase()}-${digits}`;
}

/* ------------------------------------ Flow: renewals & reminders (mobile) */

/** Spec §68's reminder statuses, verbatim. */
export type ReminderStatus =
  "Not Scheduled" | "Scheduled" | "Sent" | "Failed" | "Cancelled";

/** Spec §67 configures reminders at 30, 7 and 1 days before the due date. */
export type ReminderStage = {
  /** "30 days before", "7 days before", "1 day before" (§67). */
  offsetDays: 30 | 7 | 1;
  /** §67 channels: In-app, WhatsApp, Email. */
  channel: "In-app" | "WhatsApp" | "Email";
  status: ReminderStatus;
  /** When it went, or is due to go. */
  date: string;
  /** §67: a channel that cannot be used must not fail silently. */
  failureReason?: string;
};

/** Spec §66 statuses. "Not Renewing" (§73) leaves the active work views. */
export type RenewalStatus =
  "Upcoming" | "Due Today" | "Overdue" | "Renewed / Completed";

export type MobileRenewal = {
  id: string;
  customer: string;
  /** "Customer · #881" — the same shape every other screen uses. */
  reference: string;
  product: string;
  provider: string;
  /** Obviously fictional test reference. */
  policyRef: string;
  /** Due/Renewal date and its offset from PRESENTATION_TODAY. */
  due: string;
  dueInDays: number;
  status: RenewalStatus;
  /**
   * Record owner of the CUSTOMER — not the renewal's assignee (§65).
   */
  recordOwner: string;
  /**
   * Who the RENEWAL ACTION is assigned to. §65: "A Renewal action uses
   * Assigned To, not Record Owner", defaulting to the Record Owner and
   * reassignable by authorised users. Changing it does not change ownership.
   */
  assignedTo: string;
  reminders: readonly ReminderStage[];
  /** Last recorded contact about this renewal, where there has been one. */
  lastContact?: string;
  /** Set only where that customer's record wireframe exists. */
  hasRecord?: boolean;
  /** Set only where that customer's conversation wireframe exists. */
  hasConversation?: boolean;
  /** Allow-listed key for preselecting this customer elsewhere. */
  recordKey: string;
  /** Present once renewed (§71): the cycle that closed, kept in history. */
  renewedOn?: string;
  previousDue?: string;
};

/**
 * Renewals Sneha Thomas is permitted to work on.
 *
 * Visibility is the customer rule already in force — owned by her, or
 * explicitly shared with her — combined with §65's separate question of who
 * the renewal ACTION is assigned to. A WhatsApp conversation assignment gives
 * neither.
 *
 * Ramesh's health renewal is spread from CUSTOMER_RECORD and
 * CUSTOMER_POLICIES, and its reminder schedule is §68's own worked example
 * (30 days before Sent 27 Aug · 7 days before Scheduled 19 Sep · 1 day before
 * Scheduled 25 Sep) — which is that renewal, because §68 was written around
 * a 26 Sep due date.
 *
 * Every other row reuses a customer and policy reference that already exists
 * in DIRECTORY_CUSTOMERS. Deepa Menon and Fathima Rasheed each hold three
 * services there, so their extra policies are already implied rather than
 * invented.
 */
export const MOBILE_RENEWALS: readonly MobileRenewal[] = [
  {
    id: "r859a",
    customer: "Joseph Thomas",
    reference: "Customer · #859",
    product: "Motor Insurance",
    provider: "Shield General (sample provider)",
    policyRef: "POL-TEST-859-A",
    due: "03 Sep 2026",
    dueInDays: -8,
    status: "Overdue",
    recordOwner: SALES_PERSONA.name,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      {
        offsetDays: 30,
        channel: "WhatsApp",
        status: "Sent",
        date: "04 Aug 2026",
      },
      {
        offsetDays: 7,
        channel: "WhatsApp",
        status: "Sent",
        date: "27 Aug 2026",
      },
      {
        offsetDays: 1,
        channel: "WhatsApp",
        status: "Failed",
        date: "02 Sep 2026",
        failureReason: "Outside the 24-hour window and no approved template",
      },
    ],
    lastContact: "Call · 08 Sep",
    recordKey: "customer-859",
  },
  {
    id: "r877b",
    customer: "Deepa Menon",
    reference: "Customer · #877",
    product: "Motor Insurance",
    provider: "Shield General (sample provider)",
    policyRef: "POL-TEST-877-B",
    due: "05 Sep 2026",
    dueInDays: -6,
    status: "Overdue",
    recordOwner: SALES_PERSONA.name,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      { offsetDays: 30, channel: "Email", status: "Sent", date: "06 Aug 2026" },
      { offsetDays: 7, channel: "Email", status: "Sent", date: "29 Aug 2026" },
      { offsetDays: 1, channel: "In-app", status: "Sent", date: "04 Sep 2026" },
    ],
    lastContact: "Email · 21 Aug",
    recordKey: "customer-877",
  },
  {
    id: "r712",
    customer: "Sneha Nair",
    reference: "Customer · #712",
    product: "PUC Certificate",
    provider: "Regional testing centre",
    policyRef: "PUC-TEST-712",
    due: PRESENTATION_TODAY,
    dueInDays: 0,
    status: "Due Today",
    recordOwner: SALES_PERSONA.name,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      {
        offsetDays: 30,
        channel: "WhatsApp",
        status: "Sent",
        date: "12 Aug 2026",
      },
      {
        offsetDays: 7,
        channel: "WhatsApp",
        status: "Sent",
        date: "04 Sep 2026",
      },
      { offsetDays: 1, channel: "In-app", status: "Sent", date: "10 Sep 2026" },
    ],
    lastContact: "WhatsApp · Yesterday",
    recordKey: "customer-712",
  },
  {
    id: "r904",
    customer: "Vikram Reddy",
    reference: "Customer · #904",
    product: "Motor Insurance",
    provider: "Shield General (sample provider)",
    policyRef: "POL-TEST-904-A",
    due: "20 Sep 2026",
    dueInDays: 9,
    status: "Upcoming",
    recordOwner: SALES_PERSONA.name,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      {
        offsetDays: 30,
        channel: "WhatsApp",
        status: "Sent",
        date: "21 Aug 2026",
      },
      {
        offsetDays: 7,
        channel: "WhatsApp",
        status: "Scheduled",
        date: "13 Sep 2026",
      },
      {
        offsetDays: 1,
        channel: "In-app",
        status: "Scheduled",
        date: "19 Sep 2026",
      },
    ],
    lastContact: "WhatsApp · Yesterday",
    recordKey: "customer-904",
  },
  {
    id: "r893",
    customer: "Anil Varghese",
    reference: "Customer · #893",
    product: "Travel Insurance",
    provider: "Shield General (sample provider)",
    policyRef: "POL-TEST-893-A",
    due: "24 Sep 2026",
    dueInDays: 13,
    status: "Upcoming",
    recordOwner: SALES_PERSONA.name,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      { offsetDays: 30, channel: "Email", status: "Sent", date: "25 Aug 2026" },
      {
        offsetDays: 7,
        channel: "Email",
        status: "Scheduled",
        date: "17 Sep 2026",
      },
      {
        offsetDays: 1,
        channel: "In-app",
        status: "Scheduled",
        date: "23 Sep 2026",
      },
    ],
    lastContact: "Call · 05 Sep",
    recordKey: "customer-893",
  },
  {
    // Spread from the shared record: reference, product, provider, policy
    // reference and due date all come from Ramesh's own policy.
    id: "r881a",
    customer: CUSTOMER_RECORD.name,
    reference: CUSTOMER_RECORD.reference,
    product: CUSTOMER_POLICIES[0]!.product,
    provider: CUSTOMER_POLICIES[0]!.provider,
    policyRef: CUSTOMER_POLICIES[0]!.reference,
    due: CUSTOMER_POLICIES[0]!.renewal,
    dueInDays: CUSTOMER_POLICIES[0]!.daysLeft ?? 0,
    status: "Upcoming",
    // §65's own example: Record Owner Arun, renewal Assigned To Sneha.
    recordOwner: CUSTOMER_RECORD.owner,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      {
        offsetDays: 30,
        channel: "WhatsApp",
        status: "Sent",
        date: "27 Aug 2026",
      },
      {
        offsetDays: 7,
        channel: "WhatsApp",
        status: "Scheduled",
        date: "19 Sep 2026",
      },
      {
        offsetDays: 1,
        channel: "In-app",
        status: "Scheduled",
        date: "25 Sep 2026",
      },
    ],
    lastContact: "WhatsApp · Today, 10:41 AM",
    hasRecord: true,
    hasConversation: true,
    recordKey: "customer-881",
  },
  {
    id: "r921",
    customer: "Lakshmi Nair",
    reference: "Customer · #921",
    product: "Health Insurance",
    provider: "Star Health",
    policyRef: "POL-TEST-921-A",
    due: "05 Nov 2026",
    dueInDays: 55,
    status: "Upcoming",
    recordOwner: SALES_PERSONA.name,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      {
        offsetDays: 30,
        channel: "Email",
        status: "Scheduled",
        date: "06 Oct 2026",
      },
      {
        offsetDays: 7,
        channel: "Email",
        status: "Scheduled",
        date: "29 Oct 2026",
      },
      {
        offsetDays: 1,
        channel: "In-app",
        status: "Scheduled",
        date: "04 Nov 2026",
      },
    ],
    lastContact: "Note · 02 Sep",
    recordKey: "customer-921",
  },
  {
    id: "r881b",
    customer: CUSTOMER_RECORD.name,
    reference: CUSTOMER_RECORD.reference,
    product: CUSTOMER_POLICIES[1]!.product,
    provider: CUSTOMER_POLICIES[1]!.provider,
    policyRef: CUSTOMER_POLICIES[1]!.reference,
    due: CUSTOMER_POLICIES[1]!.renewal,
    dueInDays: 122,
    status: "Upcoming",
    recordOwner: CUSTOMER_RECORD.owner,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      {
        offsetDays: 30,
        channel: "WhatsApp",
        status: "Not Scheduled",
        date: "12 Dec 2026",
      },
      {
        offsetDays: 7,
        channel: "WhatsApp",
        status: "Not Scheduled",
        date: "04 Jan 2027",
      },
      {
        offsetDays: 1,
        channel: "In-app",
        status: "Not Scheduled",
        date: "10 Jan 2027",
      },
    ],
    hasRecord: true,
    hasConversation: true,
    recordKey: "customer-881",
  },
  {
    id: "r877a",
    customer: "Deepa Menon",
    reference: "Customer · #877",
    product: "Health Insurance",
    provider: "Star Health",
    policyRef: "POL-TEST-877-A",
    due: "22 Jan 2027",
    dueInDays: 133,
    status: "Upcoming",
    recordOwner: SALES_PERSONA.name,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      {
        offsetDays: 30,
        channel: "Email",
        status: "Not Scheduled",
        date: "23 Dec 2026",
      },
      {
        offsetDays: 7,
        channel: "Email",
        status: "Not Scheduled",
        date: "15 Jan 2027",
      },
      {
        offsetDays: 1,
        channel: "In-app",
        status: "Not Scheduled",
        date: "21 Jan 2027",
      },
    ],
    lastContact: "Email · 21 Aug",
    recordKey: "customer-877",
  },
  {
    id: "r688",
    customer: "Fathima Rasheed",
    reference: "Customer · #688",
    product: "Motor Insurance",
    provider: "Shield General (sample provider)",
    policyRef: "POL-TEST-688-A",
    // §71: the new cycle's date. The closed cycle stays in history below.
    due: "20 Aug 2027",
    dueInDays: 343,
    status: "Renewed / Completed",
    recordOwner: SALES_PERSONA.name,
    assignedTo: SALES_PERSONA.name,
    reminders: [
      {
        offsetDays: 30,
        channel: "WhatsApp",
        status: "Sent",
        date: "21 Jul 2026",
      },
      {
        offsetDays: 7,
        channel: "WhatsApp",
        status: "Sent",
        date: "13 Aug 2026",
      },
      {
        offsetDays: 1,
        channel: "In-app",
        status: "Cancelled",
        date: "19 Aug 2026",
      },
    ],
    lastContact: "WhatsApp · 09 Sep",
    renewedOn: "09 Sep 2026",
    previousDue: "20 Aug 2026",
    recordKey: "customer-688",
  },
];

/**
 * That customer's phone number, from the directory that already holds it.
 *
 * Returns null rather than a placeholder when the customer is not in the
 * directory: a screen that cannot find a number must say so, because a
 * plausible-looking invented number is the one failure mode worth designing
 * against here.
 */
export function customerPhoneByReference(reference: string): string | null {
  return (
    DIRECTORY_CUSTOMERS.find((c) => c.reference === reference)?.phone ?? null
  );
}

/**
 * Renewals due within the near-term window (§64's "Next 30 Days"), excluding
 * anything already overdue or completed. Shared so the Today screen, the More
 * badge and the Renewals workspace cannot disagree about what "due soon" is.
 */
export function renewalsDueSoon(): readonly MobileRenewal[] {
  return MOBILE_RENEWALS.filter(
    (r) =>
      r.status !== "Overdue" &&
      r.status !== "Renewed / Completed" &&
      r.dueInDays <= RENEWAL_DUE_SOON_DAYS,
  );
}

/** Renewals whose due date has passed without completion (§74). */
export function renewalsOverdue(): readonly MobileRenewal[] {
  return MOBILE_RENEWALS.filter((r) => r.status === "Overdue");
}

/** §64 uses "Next 30 Days" as the near-term renewal window. */
export const RENEWAL_DUE_SOON_DAYS = 30;

/* ------------------------------------------------- Flow D: admin dashboard */

export const DASHBOARD_METRICS = [
  { id: "new-leads", label: "New Leads", value: 18, caption: "this week" },
  {
    id: "followups",
    label: "Follow-ups Today",
    value: 12,
    caption: "across 5 users",
  },
  {
    id: "renewals",
    label: "Renewals Due Soon",
    value: 24,
    caption: "next 30 days",
  },
  {
    id: "overdue",
    label: "Overdue Actions",
    value: 5,
    caption: "needs attention",
  },
] as const;

export type FollowUpRow = {
  id: string;
  time: string;
  person: string;
  product: string;
  type: string;
  assignedTo: string;
  status: "Due" | "Scheduled" | "Overdue";
};

export const TODAY_FOLLOW_UPS: readonly FollowUpRow[] = [
  {
    id: "f1",
    time: "10:00 AM",
    person: "Priya Iyer",
    product: "Health Insurance",
    type: "Call",
    assignedTo: "Arun Menon",
    status: "Due",
  },
  {
    id: "f2",
    time: "11:30 AM",
    person: "Ramesh Kumar",
    product: "Motor Insurance",
    type: "Call",
    assignedTo: "Neha Thomas",
    status: "Due",
  },
  {
    id: "f3",
    time: "1:00 PM",
    person: "Sneha Nair",
    product: "PUC Certificate",
    type: "WhatsApp",
    assignedTo: "Arun Menon",
    status: "Due",
  },
  {
    id: "f4",
    time: "3:30 PM",
    person: "Rajesh Menon",
    product: "Health Insurance",
    type: "Call",
    assignedTo: "Vikram Shah",
    status: "Scheduled",
  },
  {
    id: "f5",
    time: "4:00 PM",
    person: "Amit Shah",
    product: "Motor Insurance",
    type: "Call",
    assignedTo: "Neha Thomas",
    status: "Scheduled",
  },
  {
    id: "f6",
    time: "5:30 PM",
    person: "Neha Pillai",
    product: "Health Insurance",
    type: "Email",
    assignedTo: "Arun Menon",
    status: "Overdue",
  },
];

export type RenewalRow = {
  id: string;
  customer: string;
  service: string;
  dueDate: string;
  daysLeft: number;
  status: "Due Soon" | "Upcoming";
};

export const UPCOMING_RENEWALS: readonly RenewalRow[] = [
  {
    id: "rn1",
    customer: "Vikram Reddy",
    service: "Motor Insurance",
    dueDate: "20 Sep 2026",
    daysLeft: 9,
    status: "Due Soon",
  },
  {
    id: "rn2",
    customer: "Anitha Desai",
    service: "Health Insurance",
    dueDate: "25 Sep 2026",
    daysLeft: 14,
    status: "Due Soon",
  },
  {
    id: "rn3",
    customer: "Suresh Pillai",
    service: "PUC Certificate",
    dueDate: "02 Oct 2026",
    daysLeft: 21,
    status: "Upcoming",
  },
  {
    id: "rn4",
    customer: "Farhan Ali",
    service: "Motor Insurance",
    dueDate: "05 Oct 2026",
    daysLeft: 24,
    status: "Upcoming",
  },
  {
    id: "rn5",
    customer: "Meera Krishnan",
    service: "Health Insurance",
    dueDate: "12 Oct 2026",
    daysLeft: 31,
    status: "Upcoming",
  },
];

export const PIPELINE = [
  { stage: "New", count: 18, share: 44 },
  { stage: "Contacted", count: 12, share: 29 },
  { stage: "Interested", count: 7, share: 17 },
  { stage: "Won", count: 4, share: 10 },
] as const;

export const RECENT_ACTIVITY: readonly Activity[] = [
  {
    id: "ra1",
    title: "Follow-up completed",
    detail: "Priya Iyer · Health Insurance",
    time: "10:24 AM",
    kind: "followup",
  },
  {
    id: "ra2",
    title: "WhatsApp message sent",
    detail: "Ramesh Kumar · Motor Insurance",
    time: "9:41 AM",
    kind: "whatsapp",
  },
  {
    id: "ra3",
    title: "New lead added",
    detail: "Amit Shah · Motor Insurance",
    time: "9:15 AM",
    kind: "created",
  },
  {
    id: "ra4",
    title: "Call — Connected",
    detail: "Rajesh Menon · Health Insurance",
    time: "Yesterday",
    kind: "call",
  },
  {
    id: "ra5",
    title: "Policy renewed",
    detail: "Sneha Nair · PUC Certificate",
    time: "Yesterday",
    kind: "stage",
  },
];

export type WorkloadRow = {
  id: string;
  user: string;
  initials: string;
  openLeads: number;
  followUpsToday: number;
  overdue: number;
  renewals: number;
};

export const TEAM_WORKLOAD: readonly WorkloadRow[] = [
  {
    id: "wl1",
    user: "Arun Menon",
    initials: "AM",
    openLeads: 14,
    followUpsToday: 4,
    overdue: 1,
    renewals: 7,
  },
  {
    id: "wl2",
    user: "Sneha Thomas",
    initials: "ST",
    openLeads: 11,
    followUpsToday: 3,
    overdue: 0,
    renewals: 5,
  },
  {
    id: "wl3",
    user: "Vikram Shah",
    initials: "VS",
    openLeads: 9,
    followUpsToday: 2,
    overdue: 2,
    renewals: 6,
  },
  {
    id: "wl4",
    user: "Neha Thomas",
    initials: "NT",
    openLeads: 7,
    followUpsToday: 3,
    overdue: 2,
    renewals: 4,
  },
  {
    id: "wl5",
    user: "Fathima Rasheed",
    initials: "FR",
    openLeads: 5,
    followUpsToday: 0,
    overdue: 0,
    renewals: 2,
  },
];

/* -------------------------------------------------- Flow E: admin settings */

export type SettingsUser = {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Manager" | "Staff";
  status: "Active" | "Invited" | "Deactivated";
  assignedRecords: number;
  lastActive: string;
};

export const SETTINGS_USERS: readonly SettingsUser[] = [
  {
    id: "s1",
    name: "Arun Menon",
    email: "arun@asfincare.example",
    role: "Owner",
    status: "Active",
    assignedRecords: 142,
    lastActive: "Today, 10:04 AM",
  },
  {
    id: "s2",
    name: "Vikram Shah",
    email: "vikram@asfincare.example",
    role: "Manager",
    status: "Active",
    assignedRecords: 96,
    lastActive: "Today, 9:12 AM",
  },
  {
    id: "s3",
    name: "Sneha Thomas",
    email: "sneha@asfincare.example",
    role: "Staff",
    status: "Active",
    assignedRecords: 74,
    lastActive: "Today, 8:47 AM",
  },
  {
    id: "s4",
    name: "Neha Thomas",
    email: "neha@asfincare.example",
    role: "Staff",
    status: "Active",
    assignedRecords: 61,
    lastActive: "Yesterday",
  },
  {
    id: "s5",
    name: "Fathima Rasheed",
    email: "fathima@asfincare.example",
    role: "Staff",
    status: "Invited",
    assignedRecords: 0,
    lastActive: "Invitation sent 09 Sep",
  },
  {
    id: "s6",
    name: "Joseph Kurian",
    email: "joseph@asfincare.example",
    role: "Staff",
    status: "Deactivated",
    assignedRecords: 38,
    lastActive: "14 Aug 2026",
  },
];

export type PipelineStage = {
  id: string;
  name: string;
  active: boolean;
  leads: number;
  isDefault?: boolean;
};

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { id: "p1", name: "New", active: true, leads: 18, isDefault: true },
  { id: "p2", name: "Contacted", active: true, leads: 12 },
  { id: "p3", name: "Interested", active: true, leads: 7 },
  { id: "p4", name: "Quote Sent", active: true, leads: 5 },
  { id: "p5", name: "Won", active: true, leads: 4 },
  { id: "p6", name: "Lost", active: true, leads: 9 },
  { id: "p7", name: "Cold Call", active: false, leads: 23 },
];

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  renewable: boolean;
  activeCustomers: number;
};

export const PRODUCTS: readonly ProductRow[] = [
  {
    id: "pr1",
    name: "Health Insurance",
    category: "Insurance",
    renewable: true,
    activeCustomers: 218,
  },
  {
    id: "pr2",
    name: "Motor Insurance",
    category: "Insurance",
    renewable: true,
    activeCustomers: 164,
  },
  {
    id: "pr3",
    name: "PUC Certificate",
    category: "Compliance",
    renewable: true,
    activeCustomers: 87,
  },
  {
    id: "pr4",
    name: "Term Life Insurance",
    category: "Insurance",
    renewable: true,
    activeCustomers: 52,
  },
  {
    id: "pr5",
    name: "Mutual Fund SIP",
    category: "Investment",
    renewable: false,
    activeCustomers: 41,
  },
];

export const REMINDER_RULES = [
  {
    id: "rr1",
    product: "Health Insurance",
    offsets: "30, 15, 7 and 1 day before",
    channel: "WhatsApp + Email",
  },
  {
    id: "rr2",
    product: "Motor Insurance",
    offsets: "30, 7 and 1 day before",
    channel: "WhatsApp",
  },
  {
    id: "rr3",
    product: "PUC Certificate",
    offsets: "15 and 3 days before",
    channel: "WhatsApp",
  },
  {
    id: "rr4",
    product: "Term Life Insurance",
    offsets: "30 and 7 days before",
    channel: "Email",
  },
] as const;

export const FOLLOW_UP_DEFAULTS = [
  { id: "fd1", label: "Default follow-up type", value: "Call" },
  { id: "fd2", label: "Default follow-up time", value: "10:00 AM" },
  { id: "fd3", label: "Overdue after", value: "Scheduled time passes" },
  { id: "fd4", label: "Assign new leads by", value: "Round robin" },
] as const;

export const EMAIL_TEMPLATES = [
  {
    id: "et1",
    name: "Renewal reminder",
    subject: "Your {{product}} renewal is due on {{due_date}}",
    status: "Active",
  },
  {
    id: "et2",
    name: "Policy document",
    subject: "Your {{product}} policy documents",
    status: "Active",
  },
  {
    id: "et3",
    name: "Welcome",
    subject: "Welcome to A&S Fincare",
    status: "Draft",
  },
] as const;
