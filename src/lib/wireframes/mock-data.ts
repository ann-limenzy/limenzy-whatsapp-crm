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

export const CURRENT_USER = {
  name: "Arun Menon",
  firstName: "Arun",
  role: "Admin",
  initials: "AM",
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
    assignedTo: "Arun Menon",
    status: "Open",
    unread: 2,
    delivery: "read",
  },
  {
    id: "w2",
    person: "Priya Iyer",
    phone: "70000 41288",
    recordType: "Customer",
    recordLabel: "Customer · #642",
    product: "Health Insurance",
    lastMessage: "Thank you, received the policy copy",
    time: "9:45 AM",
    assignedTo: "Sneha Thomas",
    status: "Open",
    unread: 0,
    delivery: "read",
  },
  {
    id: "w3",
    person: "70000 33115",
    phone: "70000 33115",
    recordType: "Unknown",
    recordLabel: "No matching record",
    product: "—",
    lastMessage: "I need more details about motor insurance",
    time: "9:12 AM",
    assignedTo: null,
    status: "Open",
    unread: 1,
    delivery: "delivered",
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
  },
  {
    id: "w5",
    person: "Anitha Desai",
    phone: "70000 77034",
    recordType: "Lead",
    recordLabel: "Lead · #2041",
    product: "Motor Insurance",
    lastMessage: "Can you share the quote again?",
    time: "Yesterday",
    assignedTo: "Arun Menon",
    status: "Open",
    unread: 0,
    delivery: "read",
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
    body: "Please share a copy of your Aadhaar so we can complete the KYC for this renewal.",
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

export const RENEWALS_SOON: readonly WorkItem[] = [
  {
    id: "r1",
    person: "Vikram Reddy",
    product: "Motor Insurance",
    due: "20 Sep · 9 days",
    status: "Due",
    type: "Renewal",
  },
  {
    id: "r2",
    person: "Anitha Desai",
    product: "Health Insurance",
    due: "25 Sep · 14 days",
    status: "Scheduled",
    type: "Renewal",
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
  owner: "Arun Menon",
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
    title: "Call — Connected — logged by Arun",
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
    title: "Follow-up scheduled by Arun",
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
export const CALL_OUTCOMES: readonly string[] = [
  "Connected",
  "No answer",
  "Busy",
  "Callback requested",
  "Incorrect number",
  "Not interested",
  "Converted",
];

export const FOLLOW_UP_TYPES: readonly string[] = [
  "Call",
  "WhatsApp",
  "Email",
  "Visit",
  "Other",
];

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
