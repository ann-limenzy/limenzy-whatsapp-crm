import type { LeadActivityEntry, LeadDetail } from "@/server/auth/workspace-leads";

/**
 * SYNTHETIC DATA for the Lead detail visual preview. Not product data.
 *
 * Every record here is invented. The shapes are the real domain types, so the
 * preview cannot drift into showing a field the application does not have or
 * a timeline kind it cannot emit — if `LeadActivityEntry` changes, this stops
 * compiling.
 *
 * Two examples, because the layout has to answer two different questions:
 * an ACTIVE Lead, where the screen is about what happens next; and a LOST
 * one, where it is about what happened and whether to reopen. A design
 * reviewed only against the happy case tends to leave the second looking
 * like the first with a different badge.
 */

export type SampleStage = { readonly id: string; readonly name: string };

export type SampleMember = {
  readonly userProfileId: string;
  readonly fullName: string;
};

export type SampleLead = {
  readonly lead: LeadDetail;
  readonly activity: readonly LeadActivityEntry[];
  readonly ownerName: string;
  readonly lostReason: string | null;
  readonly lostReasonNote: string | null;
  /** Open, ordinary stages — the only ones a Lead moves to by hand. */
  readonly stages: readonly SampleStage[];
  readonly currentStageId: string;
  readonly assignableMembers: readonly SampleMember[];
};

export const SAMPLE_PEOPLE: Readonly<Record<string, string>> = {
  "p-asha": "Asha Nair",
  "p-rohit": "Rohit Verma",
  "p-divya": "Divya Krishnan",
  "p-sam": "Sameer Qureshi",
};

export const SAMPLE_MEMBERS: readonly SampleMember[] = [
  { userProfileId: "p-asha", fullName: "Asha Nair" },
  { userProfileId: "p-rohit", fullName: "Rohit Verma" },
  { userProfileId: "p-divya", fullName: "Divya Krishnan" },
  { userProfileId: "p-sam", fullName: "Sameer Qureshi" },
];

const STAGES: readonly SampleStage[] = [
  { id: "s-new", name: "New" },
  { id: "s-contacted", name: "Contacted" },
  { id: "s-qualified", name: "Qualified" },
  { id: "s-proposal", name: "Proposal sent" },
  { id: "s-negotiation", name: "Negotiation" },
];

/*
 * Fixed instants, not `Date.now()` offsets.
 *
 * A preview whose timestamps move every time it renders produces a different
 * screenshot on every run, so two reviews can never be compared — and the
 * "3 days ago" wording would drift out of step with the dates beside it.
 */
const at = (iso: string): Date => new Date(iso);

const ACTIVE_LEAD: SampleLead = {
  ownerName: "Asha Nair",
  lostReason: null,
  lostReasonNote: null,
  stages: STAGES,
  currentStageId: "s-proposal",
  assignableMembers: SAMPLE_MEMBERS,
  lead: {
    id: "lead-active",
    name: "Priya Raghavan",
    phone: "+91 98400 11234",
    phoneNormalised: "+919840011234",
    phoneNeedsReview: false,
    email: "priya.raghavan@northwind.example",
    stageId: "s-proposal",
    stageName: "Proposal sent",
    stageIsActive: true,
    stageKind: "active",
    sourceName: "Referral",
    recordOwnerUserProfileId: "p-asha",
    isOwnedByActor: true,
    createdByUserProfileId: "p-rohit",
    notes:
      "Runs a 40-seat practice in Adyar. Wants the renewals module first, " +
      "messaging later. Decision sits with her and her brother, who handles " +
      "the accounts.",
    createdAt: at("2026-09-28T09:12:00+05:30"),
    updatedAt: at("2026-10-16T17:40:00+05:30"),
  },
  activity: [
    {
      id: "a-1",
      kind: "note_added",
      actorUserProfileId: "p-asha",
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: "Sent the revised proposal with the two-year figure. She is taking it to her brother this weekend.",
      lostReason: null,
      occurredAt: at("2026-10-16T17:40:00+05:30"),
    },
    /*
     * A BUSY DAY, on purpose.
     *
     * Sticky day headings only ever pin while a group is taller than the
     * viewport. With two entries per day the behaviour can never be seen,
     * so it cannot be reviewed — and an earlier pass of this preview
     * reported "sticky headings verified" having never made one stick.
     * Six entries on 16 October is longer than a phone screen.
     */
    {
      id: "a-1b",
      kind: "details_edited",
      actorUserProfileId: "p-asha",
      fromStageName: null,
      toStageName: null,
      changedFields: ["phone"],
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: null,
      lostReason: null,
      occurredAt: at("2026-10-16T17:05:00+05:30"),
    },
    {
      id: "a-1c",
      kind: "note_added",
      actorUserProfileId: "p-rohit",
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: "She rang back about the migration timeline. Two weekends, not one — I said we would confirm in writing.",
      lostReason: null,
      occurredAt: at("2026-10-16T16:20:00+05:30"),
    },
    {
      id: "a-1d",
      kind: "note_added",
      actorUserProfileId: "p-asha",
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: "Left a voicemail before the stage move.",
      lostReason: null,
      occurredAt: at("2026-10-16T15:40:00+05:30"),
    },
    {
      id: "a-1e",
      kind: "details_edited",
      actorUserProfileId: "p-asha",
      fromStageName: null,
      toStageName: null,
      changedFields: ["notes"],
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: null,
      lostReason: null,
      occurredAt: at("2026-10-16T15:20:00+05:30"),
    },
    {
      id: "a-2",
      kind: "stage_changed",
      actorUserProfileId: "p-asha",
      fromStageName: "Qualified",
      toStageName: "Proposal sent",
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: null,
      lostReason: null,
      occurredAt: at("2026-10-16T15:05:00+05:30"),
    },
    {
      id: "a-3",
      kind: "owner_changed",
      actorUserProfileId: "p-divya",
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      fromOwnerUserProfileId: "p-rohit",
      toOwnerUserProfileId: "p-asha",
      note: null,
      lostReason: null,
      occurredAt: at("2026-10-12T11:20:00+05:30"),
    },
    {
      id: "a-4",
      kind: "details_edited",
      actorUserProfileId: "p-rohit",
      fromStageName: null,
      toStageName: null,
      changedFields: ["email", "notes"],
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: null,
      lostReason: null,
      occurredAt: at("2026-10-12T10:02:00+05:30"),
    },
    {
      id: "a-5",
      kind: "note_added",
      actorUserProfileId: "p-rohit",
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: "Call went well. Forty seats, wants renewals first. Asked for pricing in writing.",
      lostReason: null,
      occurredAt: at("2026-10-05T16:30:00+05:30"),
    },
    {
      id: "a-6",
      kind: "stage_changed",
      actorUserProfileId: "p-rohit",
      fromStageName: "Contacted",
      toStageName: "Qualified",
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: null,
      lostReason: null,
      occurredAt: at("2026-10-05T16:28:00+05:30"),
    },
    {
      id: "a-7",
      kind: "record_created",
      actorUserProfileId: "p-rohit",
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: null,
      lostReason: null,
      occurredAt: at("2026-09-28T09:12:00+05:30"),
    },
  ],
};

const LOST_LEAD: SampleLead = {
  ownerName: "Sameer Qureshi",
  lostReason: "chose_competitor",
  lostReasonNote:
    "Went with the incumbent after they matched the price and threw in migration.",
  stages: STAGES,
  currentStageId: "s-contacted",
  assignableMembers: SAMPLE_MEMBERS,
  lead: {
    id: "lead-lost",
    name: "Arjun Mehta",
    phone: "9820012345",
    /* No country code, so §130.1 cannot compare it — the warning is real. */
    phoneNormalised: null,
    phoneNeedsReview: true,
    email: null,
    stageId: "s-lost",
    stageName: "Lost",
    stageIsActive: true,
    stageKind: "lost",
    sourceName: "Website enquiry",
    recordOwnerUserProfileId: "p-sam",
    isOwnedByActor: false,
    createdByUserProfileId: "p-sam",
    notes: null,
    createdAt: at("2026-08-14T12:40:00+05:30"),
    updatedAt: at("2026-10-09T18:15:00+05:30"),
  },
  activity: [
    {
      id: "b-1",
      kind: "marked_lost",
      actorUserProfileId: "p-sam",
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: "Went with the incumbent after they matched the price and threw in migration.",
      lostReason: "chose_competitor",
      occurredAt: at("2026-10-09T18:15:00+05:30"),
    },
    {
      id: "b-2",
      kind: "note_added",
      actorUserProfileId: "p-sam",
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: "Third attempt. He said a decision was close but would not say which way.",
      lostReason: null,
      occurredAt: at("2026-10-02T09:45:00+05:30"),
    },
    {
      id: "b-3",
      kind: "stage_changed",
      actorUserProfileId: "p-sam",
      fromStageName: "New",
      toStageName: "Contacted",
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: null,
      lostReason: null,
      occurredAt: at("2026-08-16T14:05:00+05:30"),
    },
    {
      id: "b-4",
      kind: "record_created",
      actorUserProfileId: "p-sam",
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      fromOwnerUserProfileId: null,
      toOwnerUserProfileId: null,
      note: null,
      lostReason: null,
      occurredAt: at("2026-08-14T12:40:00+05:30"),
    },
  ],
};

export const SAMPLE_LEADS = {
  active: ACTIVE_LEAD,
  lost: LOST_LEAD,
} as const;

export type SampleKey = keyof typeof SAMPLE_LEADS;
