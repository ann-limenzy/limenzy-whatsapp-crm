import type {
  LeadActivityEntry,
  LeadListItem,
} from "@/server/auth/workspace-leads";

import { SAMPLE_LEADS, SAMPLE_PEOPLE } from "./sample-leads";

/**
 * SYNTHETIC rows for the Lead List preview. Not product data.
 *
 * The shape is the real `LeadListItem`, so this cannot show a column the
 * application does not have. What the list can actually offer is fixed by
 * what 3B/3C/3D built, and it is narrow on purpose:
 *
 *   * search across name, phone and email — §31, server-side;
 *   * two scopes, All and My leads — §31's other filters (follow-up due, by
 *     stage, owner, product, date, Sales Team) need features that do not
 *     exist yet;
 *   * open a Lead, and add one.
 *
 * There is no bulk selection, no export, no saved view, no lead score and no
 * "last contacted" — none of them has anything behind it. A preview that
 * shows them is asking for approval of a product nobody has built.
 *
 * EDGE CASES ARE DELIBERATE. Two rows carry a name and an email long enough
 * to break a naive layout, one has no contact details at all, one is Lost and
 * one is Won — because a list reviewed only against tidy data is a list that
 * has not been reviewed.
 */

const at = (iso: string): Date => new Date(iso);

/**
 * The workspace's pipeline, as §34/§165 define one.
 *
 * `kind` is the immutable identity — `active`, `won` or `lost`. The NAME is
 * the workspace's own and can be anything: §34 lets it be renamed, so no
 * code here matches on a label, and the Board groups, orders and colours
 * entirely from `kind` and `sortOrder`. "Won" and "Lost" below are just what
 * this synthetic workspace happens to call its two closed stages.
 *
 * `sortOrder` is the workspace's chosen order, not the array's. The Board
 * sorts by it so a reordered pipeline reorders the columns.
 */
export type SampleStageKind = "active" | "won" | "lost";

export type SampleBoardStage = {
  readonly id: string;
  readonly name: string;
  readonly kind: SampleStageKind;
  readonly sortOrder: number;
};

export const SAMPLE_STAGES: readonly SampleBoardStage[] = [
  { id: "s-new", name: "New", kind: "active", sortOrder: 10 },
  { id: "s-contacted", name: "Contacted", kind: "active", sortOrder: 20 },
  { id: "s-qualified", name: "Qualified", kind: "active", sortOrder: 30 },
  { id: "s-proposal", name: "Proposal sent", kind: "active", sortOrder: 40 },
  { id: "s-negotiation", name: "Negotiation", kind: "active", sortOrder: 50 },
  /* A stage with nobody in it, because an empty column has to look right. */
  { id: "s-onhold", name: "On hold", kind: "active", sortOrder: 60 },
  { id: "s-won", name: "Won", kind: "won", sortOrder: 90 },
  { id: "s-lost", name: "Lost", kind: "lost", sortOrder: 91 },
];

export const stageById = (id: string): SampleBoardStage | undefined =>
  SAMPLE_STAGES.find((stage) => stage.id === id);

type Row = LeadListItem & {
  /**
   * Which stage the Lead is in. The real `LeadListItem` carries `stageName`
   * and `stageIsActive` but not the id, so a real Board would need
   * `listLeads()` to return `stage_id` as well — noted rather than faked.
   */
  readonly stageId: string;
  /** The newest few entries, for the quick-preview drawer. */
  readonly recent: readonly LeadActivityEntry[];
  readonly notes: string | null;
};

const entry = (
  id: string,
  kind: LeadActivityEntry["kind"],
  actor: string,
  occurredAt: string,
  extra: Partial<LeadActivityEntry> = {},
): LeadActivityEntry => ({
  id,
  kind,
  actorUserProfileId: actor,
  fromStageName: null,
  toStageName: null,
  changedFields: null,
  fromOwnerUserProfileId: null,
  toOwnerUserProfileId: null,
  note: null,
  lostReason: null,
  occurredAt: at(occurredAt),
  ...extra,
});

export const SAMPLE_ROWS: readonly Row[] = [
  {
    id: "lead-active",
    name: "Priya Raghavan",
    phone: "+91 98400 11234",
    email: "priya.raghavan@northwind.example",
    stageId: "s-proposal",
    stageName: "Proposal sent",
    stageIsActive: true,
    stageKind: "active",
    sourceName: "Referral",
    recordOwnerUserProfileId: "p-asha",
    isOwnedByActor: true,
    createdAt: at("2026-09-28T09:12:00+05:30"),
    updatedAt: at("2026-10-16T17:40:00+05:30"),
    notes: SAMPLE_LEADS.active.lead.notes,
    recent: SAMPLE_LEADS.active.activity.slice(0, 3),
  },
  {
    /* A name and an address long enough to break a naive row. */
    id: "lead-long",
    name: "Venkataraman Balasubramanian Iyer",
    phone: "+91 99620 88110",
    email: "venkataraman.balasubramanian@coastal-logistics-chennai.example",
    stageId: "s-negotiation",
    stageName: "Negotiation",
    stageIsActive: true,
    stageKind: "active",
    sourceName: "Trade show",
    recordOwnerUserProfileId: "p-rohit",
    isOwnedByActor: false,
    createdAt: at("2026-09-02T11:05:00+05:30"),
    updatedAt: at("2026-10-15T12:20:00+05:30"),
    notes:
      "Fleet of 22 vehicles. Wants a per-vehicle price and a written SLA before he will move.",
    recent: [
      entry("l2-1", "note_added", "p-rohit", "2026-10-15T12:20:00+05:30", {
        note: "Asked for the SLA in writing. Sending Monday.",
      }),
      entry("l2-2", "stage_changed", "p-rohit", "2026-10-11T10:00:00+05:30", {
        fromStageName: "Proposal sent",
        toStageName: "Negotiation",
      }),
    ],
  },
  {
    id: "lead-nocontact",
    name: "Meera Iyer",
    phone: null,
    email: null,
    stageId: "s-new",
    stageName: "New",
    stageIsActive: true,
    stageKind: "active",
    sourceName: null,
    recordOwnerUserProfileId: "p-asha",
    isOwnedByActor: true,
    createdAt: at("2026-10-17T08:30:00+05:30"),
    updatedAt: at("2026-10-17T08:30:00+05:30"),
    notes: null,
    recent: [
      entry("l3-1", "record_created", "p-asha", "2026-10-17T08:30:00+05:30"),
    ],
  },
  {
    id: "lead-won",
    name: "Kavitha Subramanian",
    phone: "+91 90030 44521",
    email: "kavitha@greenfield-clinic.example",
    stageId: "s-won",
    stageName: "Won",
    stageIsActive: true,
    stageKind: "won",
    sourceName: "Website enquiry",
    recordOwnerUserProfileId: "p-divya",
    isOwnedByActor: false,
    createdAt: at("2026-07-19T15:00:00+05:30"),
    updatedAt: at("2026-10-14T11:10:00+05:30"),
    notes: "Signed for twelve months. Renewal conversation due in July.",
    recent: [
      entry("l4-1", "marked_won", "p-divya", "2026-10-14T11:10:00+05:30"),
      entry("l4-2", "note_added", "p-divya", "2026-10-13T16:40:00+05:30", {
        note: "Verbal yes. Paperwork going across tomorrow.",
      }),
    ],
  },
  {
    id: "lead-lost",
    name: "Arjun Mehta",
    phone: "9820012345",
    email: null,
    stageId: "s-lost",
    stageName: "Lost",
    stageIsActive: true,
    stageKind: "lost",
    sourceName: "Website enquiry",
    recordOwnerUserProfileId: "p-sam",
    isOwnedByActor: false,
    createdAt: at("2026-08-14T12:40:00+05:30"),
    updatedAt: at("2026-10-09T18:15:00+05:30"),
    notes: null,
    recent: SAMPLE_LEADS.lost.activity.slice(0, 3),
  },
  {
    id: "lead-5",
    name: "Daniel Fernandes",
    phone: "+91 97410 22008",
    email: "daniel.f@harbourview.example",
    stageId: "s-contacted",
    stageName: "Contacted",
    stageIsActive: true,
    stageKind: "active",
    sourceName: "Referral",
    recordOwnerUserProfileId: "p-asha",
    isOwnedByActor: true,
    createdAt: at("2026-10-06T10:15:00+05:30"),
    updatedAt: at("2026-10-13T09:05:00+05:30"),
    notes: null,
    recent: [
      entry("l6-1", "stage_changed", "p-asha", "2026-10-13T09:05:00+05:30", {
        fromStageName: "New",
        toStageName: "Contacted",
      }),
    ],
  },
  {
    id: "lead-6",
    name: "Shreya Pillai",
    phone: "+91 98860 71140",
    email: "shreya.pillai@tanglewood-interiors.example",
    stageId: "s-qualified",
    stageName: "Qualified",
    stageIsActive: true,
    stageKind: "active",
    sourceName: "Instagram",
    recordOwnerUserProfileId: "p-rohit",
    isOwnedByActor: false,
    createdAt: at("2026-09-21T13:45:00+05:30"),
    updatedAt: at("2026-10-12T14:30:00+05:30"),
    notes: "Two sites. Wants the second quoted separately.",
    recent: [
      entry("l7-1", "note_added", "p-rohit", "2026-10-12T14:30:00+05:30", {
        note: "Second site is on hold until January. Quote the first only.",
      }),
    ],
  },
  {
    id: "lead-7",
    name: "Imran Shaikh",
    phone: "+91 93220 55017",
    email: null,
    stageId: "s-new",
    stageName: "New",
    stageIsActive: true,
    stageKind: "active",
    sourceName: "Walk-in",
    recordOwnerUserProfileId: "p-sam",
    isOwnedByActor: false,
    createdAt: at("2026-10-18T17:20:00+05:30"),
    updatedAt: at("2026-10-18T17:20:00+05:30"),
    notes: null,
    recent: [
      entry("l8-1", "record_created", "p-sam", "2026-10-18T17:20:00+05:30"),
    ],
  },
  {
    id: "lead-8",
    name: "Lakshmi Narayanan",
    phone: "+91 99400 63382",
    email: "lakshmi.n@sunrise-textiles.example",
    stageId: "s-proposal",
    stageName: "Proposal sent",
    stageIsActive: true,
    stageKind: "active",
    sourceName: "Referral",
    recordOwnerUserProfileId: "p-divya",
    isOwnedByActor: false,
    createdAt: at("2026-09-11T09:00:00+05:30"),
    updatedAt: at("2026-10-10T16:00:00+05:30"),
    notes: null,
    recent: [
      entry("l9-1", "note_added", "p-divya", "2026-10-10T16:00:00+05:30", {
        note: "Proposal acknowledged. Reviewing with her partner this week.",
      }),
    ],
  },
];

export type SampleRow = (typeof SAMPLE_ROWS)[number];

/** What to CALL the owner — "You" when it is the reader. */
export const ownerNameOf = (row: LeadListItem): string =>
  row.isOwnedByActor
    ? "You"
    : (SAMPLE_PEOPLE[row.recordOwnerUserProfileId] ?? "Another team member");

/**
 * Who the owner IS, for the initials mark.
 *
 * Kept apart from the label on purpose: an avatar reading "Y" because the
 * label says "You" is an avatar of a word rather than of a person.
 */
export const ownerFullName = (row: LeadListItem): string =>
  SAMPLE_PEOPLE[row.recordOwnerUserProfileId] ?? "Another team member";
