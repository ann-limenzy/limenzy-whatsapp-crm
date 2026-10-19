# Blocked specification behaviour

Behaviour the specification requires that the product cannot perform yet,
because the thing it acts on does not exist. One entry per blocked behaviour,
with the table that unblocks it.

This file exists because there are only two honest ways to handle a rule you
cannot satisfy: build it, or write down that you have not. The third option —
a disabled control, a tooltip, a line of helper text explaining which
milestone will bring it — looks like candour and is not. It puts this
project's build order in front of someone who came to do their work, and it
ages into a promise nobody tracks.

**The rule.** The product UI never names a milestone, never explains what has
not been built, and never draws a control that cannot run. A capability that
is not there is simply absent from the screen. It is recorded here, and
guarded in code.

**How these expire.** Each entry names a table. `LIFECYCLE_DEPENDENCIES` in
`src/server/auth/lead-lifecycle-dependencies.ts` declares the same pairs, and
`src/test/lead-lifecycle-dependencies.test.ts` fails the build on the day that
table appears in the schema. A `TODO` would have kept passing; this does not.
The §160 responsibility registry
(`src/server/auth/deactivation-responsibilities.ts`) works the same way and
has done since Milestone 2B.

---

## §45, §46 — converting a won Lead into a Customer

**What the specification asks for.** Marking a Lead Won offers to convert it
into a Customer, and the Convert action remains available on the Lead
afterwards.

**Blocked by.** `customers`. Milestone 6.

**What the product does today.** Marking a Lead Won records the outcome, moves
it to the workspace's Won stage and writes the §39 history entry. No Convert
control is drawn and no choice is offered. The Lead screen says nothing about
conversion at all.

**Why not a disabled button.** A disabled Convert implies the Lead is not
ready for conversion — a statement about this Lead, which would be false. The
limitation is in the product, not in the record.

---

## §48 — cancelling a lost Lead's follow-ups

**What the specification asks for.** Marking a Lead Lost cancels its
incomplete Follow-ups with the reason "Lead Marked Lost", and the cancelled
follow-ups stay in history.

**Blocked by.** `follow_ups`. Milestone 7.

**What the product does today.** Marking a Lead Lost records the outcome and
the reason §33 requires, and writes the §39 history entry. Nothing is
cancelled, because there is nothing to cancel.

**What changes when follow-ups arrive.** Cancellation must happen inside the
same transaction as the outcome, like every other Lead mutation and its
history entry, so a Lead cannot be Lost with its follow-ups still open.

---

## §27, §39 — timeline entries this application cannot emit

**What the specification asks for.** The Lead timeline shows calls, WhatsApp
messages, emails and follow-up activity alongside notes and changes.

**Blocked by.** The features that emit them — `follow_ups` (Milestone 7),
WhatsApp (Milestone 10), Email (Milestone 11), and call logging (§27.1,
Milestone 3+).

**What the product does today.** The timeline shows what this application can
record: creation, detail edits, stage changes, Won, Lost, reopening and notes.
It does not list the kinds it cannot produce. `lead_activity_kind` is an enum,
so adding a kind is a migration and an explicit decision rather than a string
appearing from somewhere.
