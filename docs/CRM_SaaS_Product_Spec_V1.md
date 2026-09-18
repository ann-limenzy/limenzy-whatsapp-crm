**CRM SaaS Product**

**Product & Wireframe Specification — V1**

**1. Product Definition**

**Product purpose**

A lightweight SaaS CRM designed for small businesses to:

> • manage leads and customers
>
> • assign work to team members
>
> • schedule and track follow-ups
>
> • maintain customer history
>
> • track products/services purchased by customers
>
> • track renewal, expiry or other important due dates
>
> • initiate customer calls from the CRM with one tap, then record the
> outcome and next follow-up
>
> • send WhatsApp messages and reminders
>
> • receive and manage customer WhatsApp replies through a lightweight
> shared inbox
>
> • send business emails and email reminders to leads and customers
>
> • view simple operational and business reports

**Product principle**

The product should remain simple enough for a small business to start
using without CRM expertise.

Configuration should allow the same application to support businesses
such as:

> • insurance and financial services
>
> • PUC/certificate centres
>
> • vehicle service businesses
>
> • agencies
>
> • maintenance/service providers
>
> • membership-based businesses
>
> • other small sales/service businesses

The system should **not require every business to use Leads**.

A business may operate using:

Lead → Follow-up → Customer → Service → Renewal

or:

Customer → Service → Renewal / Reminder

**2. User Roles**

**2.1 Owner / Admin**

Can:

> • access all CRM records
>
> • manage users
>
> • configure the CRM
>
> • configure pipelines
>
> • configure custom fields
>
> • configure products/services
>
> • configure reminder settings
>
> • connect WhatsApp
>
> • manage WhatsApp templates
>
> • configure the workspace Email sender
>
> • manage Email templates
>
> • send individual and controlled bulk Emails
>
> • import/export data
>
> • access all reports
>
> • assign/reassign records
>
> • manage business settings

**2.2 Manager**

Can:

> • view permitted Leads and Customers
>
> • manage Leads and Customers
>
> • assign/reassign records where Section 162 permits it
>
> • view permitted Follow-ups
>
> • send individual Emails
>
> • send manual and controlled bulk Email reminders where Section 162
> permits it
>
> • handle WhatsApp conversations
>
> • view Reports
>
> • perform permitted operational bulk actions

Should not automatically have access to sensitive system configuration
unless permitted.

**2.3 Staff / Sales User**

Can:

> • view owned/permitted Leads and Customers
>
> • update records
>
> • complete and schedule follow-ups
>
> • call permitted Leads and Customers and record call outcomes
>
> • send WhatsApp messages
>
> • manage assigned WhatsApp conversations
>
> • process renewals/reminders
>
> • add notes and activities

Should not have access to organization-wide configuration by default.

**Team Lead responsibility**

**Team Lead** is not a separate role. It is a responsibility held by one
active member of a Sales Team (Section 163.3). A Staff/Sales, Manager or
Owner/Admin user may be designated Team Lead, and they keep their
workspace role while holding it.

The responsibility grants only team-scoped capabilities for the team
they lead: the confirmed My Team capabilities in Section 163.6 and
inclusion in that team's Lead rotation while eligible (Section 163.3). A
Team Lead cannot exercise those capabilities over any other team.

A **Manager** receives no Sales Team authority from the Manager role
itself. A Manager who is the active Team Lead of a team exercises the
confirmed Team Lead capabilities for that team, and does so because of
the responsibility, not the role. What authority the Manager role itself
confers — including cross-team and administrative powers — is unresolved
client decision 5 (Section 163.18). **Owner/Admin** retains workspace-wide
administrative authority in every team (Sections 162 and 163.12).

**3. Overall Application Navigation**

**Desktop sidebar**

> **Logo / Business Name**
>
> **Dashboard**
>
> **Leads**
>
> **Customers**
>
> **Follow-ups**
>
> **Renewals & Reminders**
>
> **WhatsApp**
>
> **Reports**
>
> **─────────────**
>
> **Settings**

**Navigation principles**

**Leads**

May be disabled by businesses that do not use a lead process.

**Customers**

Always available.

**Follow-ups**

Central work/task area for both leads and customers.

**Renewals & Reminders**

Central area for expiry dates, renewals and recurring customer actions.

**WhatsApp**

Communication module containing the inbox, message history and templates
a user may access (Sections 162 and 162.1).

**Email**

Email does not require a separate primary navigation item in V1. Email actions are available from permitted Lead, Customer and Renewal records. Email configuration and templates are available under Settings.

**Reports**

Simple reporting only.

**Settings**

Visible primarily to Owner/Admin; certain subsections may be available
to Managers.

**4. Global Top Bar**

Every authenticated desktop screen should use a consistent top bar.

**Page Title Global Search Notifications User/Profile**

Optional primary action depending on screen:

**+ Add Lead**

or:

**+ Add Customer**

Do **not** permanently display **+ Add Lead** if Leads have been
disabled for the workspace.

**5. Global Search**

This needs to be useful to a small business without becoming
complicated.

Search should support:

> • customer name
>
> • lead name
>
> • phone number
>
> • email
>
> • business-specific reference number
>
> • configured reference/identifier fields such as Policy Number,
> Vehicle Number, Certificate Number or Membership Number.

Examples:

**"Ramesh"**

**"98470"**

**"KL-07-AB-1234"**

**"STAR/FH/44120"**

Search result grouping:

**LEADS**

**Rajesh Menon**

**98765...**

**CUSTOMERS**

**Ramesh Kumar**

**98470...**

**CUSTOMER SERVICES**

**Vehicle PUC**

**KL-07-AB-1234**

Selecting a result opens the corresponding record.

**6. Notification Centre**

Examples:

> • follow-up due
>
> • follow-up overdue
>
> • lead assigned
>
> • customer assigned
>
> • renewal approaching
>
> • overdue renewal
>
> • WhatsApp conversation assigned
>
> • new WhatsApp reply
>
> • import completed
>
> • import failed
>
> • WhatsApp message failed
>
> • Email message or scheduled Email reminder failed
>
> • Email bounced
>
> • workspace Email sender requires administrator attention

Each notification should:

> • show what happened
>
> • identify the related record
>
> • show when
>
> • open the relevant screen/record

**7. First-Time SaaS Onboarding**

The onboarding should be short.

**Screen 1 — Welcome / Create Business Workspace**

**Purpose**

Create the tenant/workspace for the business.

**Fields**

> • Business Name — required
>
> • Business Type — optional dropdown
>
> • Country — required/default detected if appropriate
>
> • Timezone — default based on country, editable
>
> • Currency — default based on country, editable

**Business Type examples**

> • Financial / Insurance
>
> • Automotive
>
> • Service Business
>
> • Agency
>
> • Education
>
> • Healthcare/Wellness
>
> • Retail
>
> • Other

This value should initially help with setup/templates only; it should
**not lock the CRM into an industry**.

**Actions**

Primary:

**Continue**

Secondary:

**Sign out**

**8. Onboarding — Select How You Will Use the CRM**

**Purpose**

Allow the product to simplify itself according to the business.

**Question**

> What would you like to manage?

Options:

☑ **Leads and sales enquiries**

☑ **Customer follow-ups**

☑ **Products / services used by customers**

☑ **Renewals / expiry dates / recurring reminders**

☑ **WhatsApp customer communication**

☑ **Email customer communication**

At minimum, Customer Management remains enabled.

Module dependencies defined under Settings → Modules & Features also
apply during onboarding. Renewals & Reminders cannot be enabled unless
Products & Services is enabled.

**Example behaviour**

If:

**Leads and sales enquiries = OFF**

then:

> • Leads disappears from navigation
>
> • Pipeline widgets disappear from Dashboard
>
> • Lead-related settings are hidden

If:

**Renewals/reminders = OFF**

The module is hidden from normal navigation and related Dashboard
widgets/actions are not shown.

Modules can later be enabled/disabled from Settings.

**Actions**

**Continue**

**Skip and use recommended setup -** If selected, the default setup
enables Leads, Customer Follow-ups, Products/Services, Renewals &
Reminders, WhatsApp and Email. These modules can later be changed from
Settings.

**9. Onboarding — Define Products / Services**

**Purpose**

Allow the business to define what it provides without requiring
developer setup.

Display only if Products & Services is enabled.

Example:

> **What does your business provide?**
>
> **\[Pollution Certificate \]**
>
> **\[+ Add another \]**

or

> **\[Health Insurance \]**
>
> **\[Vehicle Insurance \]**
>
> **\[Home Loan \]**

Fields per item:

> • Name — required
>
> • Optional description

Do not request complex pricing, categories, tax configuration, etc.
during onboarding.

**Actions**

**Add another**

**Continue**

**Skip for now**

**10. Onboarding — Renewal / Important Date Setup**

Only display if the business selected renewal/reminder tracking.

**Purpose**

Ask a simple question:

> Do your products or services have renewal or expiry dates?

Options:

**Yes**

**Not now**

If Yes:

Default reminder schedule

☑ **30 days before**

☑ **7 days before**

☑ **1 day before**

Channel:

☑ **In-app reminder**

☐ **WhatsApp**

☐ **Email**

If WhatsApp is not connected, choosing WhatsApp should explain:

> **You can configure WhatsApp after setup.**

If the workspace Email sender is not configured and verified, choosing
Email should explain:

> **You can configure Email after setup.**

Selecting a channel during onboarding records a preference only. It does
not enable sending until the relevant channel is configured.

No technical API setup should happen inside this onboarding step.

**11. Onboarding — Invite Team**

**Fields**

Each invited user:

> • Name
>
> • Email
>
> • Role

Role options:

> • Manager
>
> • Staff

The owner is already the current user.

**Actions**

**+ Invite another**

**Send invitations & continue**

**Skip**

**12. Onboarding — Import Existing Data**

Options:

**\[ Import Customers \]**

**\[ Import Leads \]**

**\[ Start Fresh \]**

Show **Import Leads** only if Leads is enabled.

Choosing Import should take users to the full import workflow later
defined in the specification.

The setup wizard should not attempt to embed the complete mapping
interface into this step.

**13. Onboarding — Connect WhatsApp**

Because WhatsApp is a core product feature, onboarding should mention it
clearly.

Display only if WhatsApp is enabled.

**Content**

**Connect WhatsApp**

**Send reminders and communicate with customers directly from the CRM.**

**\[ Connect WhatsApp \]**

**Set up later**

The detailed integration workflow will be defined under the WhatsApp
module.

**Important state**

If the connection cannot be completed:

> • onboarding must continue
>
> • WhatsApp features display **Not connected**
>
> • no core CRM functionality should be blocked

## 13.1 Onboarding — Configure Email

Display only if Email is enabled.

Email requires a verified sender before the workspace can send anything,
so onboarding should introduce it clearly rather than leaving it to be
discovered later.

**Content**

**Set up Email**

**Send renewal reminders and business emails to your customers from the
CRM.**

**\[ Configure Email Sender \]**

**Set up later**

The detailed configuration and verification workflow is defined under
Email Settings and the Email Communications module.

**Important state**

If the sender cannot be configured or verified during onboarding:

> • onboarding must continue
>
> • Email features display **Not configured**
>
> • no core CRM functionality should be blocked
>
> • automated Email reminders remain inactive until a sender is verified

No email provider credentials or secrets are entered into the browser
during this step.

**14. Setup Complete**

The completion summary should display only the setup steps actually
completed. Skipped steps should not be shown as completed.

Screen:

**You're ready to go.**

✓ Workspace created

✓ Products/services added

✓ Team invited

✓ Reminder preferences saved

✓ Email sender configured

**\[ Go to Dashboard \]**

Avoid lengthy tutorials.

**15. Dashboard — Purpose**

The dashboard should answer:

> **What needs my attention today?**

and for managers:

> **How is the business/team performing?**

It should **not** attempt to display every possible CRM metric.

**16. Dashboard — Admin / Manager Version**

**Dashboard**

**\[ Date range / Today \]**

**───────────────────────────────────────────────────────**

**New Leads Follow-ups Today Renewals Due Soon Overdue Actions**

**18 12 24 2 Follow-ups · 3 Renewals**

**───────────────────────────────────────────────────────**

**Today's Follow-ups**

**───────────────────────────────────────────────────────**

**Upcoming Renewals & Reminders**

**───────────────────────────────────────────────────────**

**Lead Pipeline**

**───────────────────────────────────────────────────────**

**Recent Activity**

**Sales Team views**

Where Sales Teams are used and the user is permitted, the dashboard may
be filtered by **Sales Team** and may show, for the selected team:

> • Team Lead
>
> • active members
>
> • members Eligible for Lead assignment
>
> • members Paused from Lead assignment
>
> • Leads in Assignment Required
>
> • an assignment-failure alert
>
> • team workload
>
> • workload per member within the team
>
> • the last and next round-robin assignee, where appropriate

Users see only the Sales Teams they are permitted to see (Section 162).
These views show operational counts only, not revenue or performance
scoring.

**17. Dashboard Summary Cards**

**Card 1 — New Leads**

Visible only if Leads are enabled.

Shows:

> • number of new leads
>
> • selected time period

Click → Leads filtered to relevant records.

**Card 2 — Follow-ups Today**

Shows today's incomplete follow-ups.

Click → Follow-ups → Today.

**Card 3 — Renewals Due Soon**

Shows services/records with upcoming renewal or due dates.

Due Soon represents renewals or due dates within the next 30 days.

Click → Renewals & Reminders → Due Soon.

**Card 4 — Overdue Actions**

**Overdue Actions** shows the total number of incomplete Follow-ups and
Renewal actions whose due date/time has passed.

clicking 2 Follow-ups → Follow-ups → Overdue

clicking 3 Renewals → Renewals → Overdue

**18. Today's Follow-ups Widget**

Display approximately 5–8 upcoming items.

Fields:

**Field**

**Example**

Time

10:30 AM

Person

Priya Iyer

Related To

Health Insurance

Follow-up Type

Call

Assigned To

Arun

Status

Due

Actions:

**Call** — shown for Call-type follow-ups, subject to Sections 27.1–27.5

**Mark Complete**

**Reschedule**

Selecting **Call** opens the phone's native calling interface. It does
not mark the Follow-up complete; completion remains an explicit action.

Selecting **customer/lead** opens the record.

**View All** — opens the main Follow-ups screen, where the user can view
all follow-ups permitted for their role.

**19. Upcoming Renewals & Reminders Widget**

Display closest upcoming records.

Example:

**Customer**

**Product/Service**

**Due**

**Reminder**

Ramesh Kumar

Health Insurance

4 days

Sent

John Mathew

PUC Certificate

7 days

Scheduled

ABC Stores

AMC

11 days

Not Scheduled

Actions:

**Open Customer/Service**

**View All**

**20. Lead Pipeline Widget**

Only if Leads are enabled.

Simplified visual:

**New Contacted Interested Won**

**18 12 7 4**

**Lost** leads are excluded from the primary dashboard pipeline widget
and remain accessible through the Leads module and reports.

Clicking a stage opens Leads filtered by that stage.

Pipeline stages are configurable by the workspace administrator.
Advanced forecasting and weighted pipeline values are outside V1.

**21. Recent Activity Widget**

Purpose:

Show important recent CRM actions.

Examples:

**10:32 AM**

**Arun completed a follow-up with Ramesh Kumar.**

**10:10 AM**

**WhatsApp renewal reminder sent to Priya Nair.**

**09:54 AM**

**Sneha converted Rajesh Menon to Customer.**

**Yesterday**

**Admin imported 124 customers.**

Do not show every field edit.

Only meaningful activity.

**22. Staff Dashboard**

A normal Staff/Sales user should see a more personal dashboard.

**Dashboard**

**Good morning, Arun**

**MY WORK**

**Follow-ups Today Overdue Renewals Due**

**6 2 8**

**────────────────────────────────**

**Today's Follow-ups**

**────────────────────────────────**

**My Upcoming Renewals**

**────────────────────────────────**

**My Leads**

**────────────────────────────────**

**Recent Customer Activity**

No organization-wide revenue/team-performance data unless permissions
allow it.

A Team Lead's dashboard may additionally show their own team's
Lead-assignment eligibility and any Assignment Required alert for that
team (Section 163.6). What other team-level information a Team Lead may
see is unresolved client decision 3 (Section 163.18) and is denied until
approved (Section 162). Being Team Lead does not reveal other teams,
another member's records or organization-wide data (Section 162.1).

**23. Dashboard Empty States**

**Brand-new workspace**

Instead of blank charts:

**Welcome to your CRM**

**Start by adding your first customer or importing**

**your existing customer list.**

**\[ Add Customer \]**

**\[ Import Customers \]**

If Leads are enabled:

**Add Lead** may also appear.

**No follow-ups today**

**You're all caught up.**

**No follow-ups scheduled for today.**

**\[ Schedule Follow-up \]**

**No upcoming renewals**

**No renewals or reminders coming up.**

Renewal dates will appear here once they are added to customer services.

**WhatsApp not connected**

When WhatsApp is not connected, WhatsApp-related areas should show:

**WhatsApp isn't connected yet.**

**Connect your business WhatsApp account to**

**send customer reminders.**

**\[ Connect WhatsApp \]**

Visible to Owner/Admin only (Section 162).

**24. Dashboard Loading / Error States**

**Loading**

Use skeleton cards/rows rather than a full-page spinner.

**Partial failure**

Example:

If reports fail but follow-ups load:

**Unable to load pipeline data.**

**\[ Try Again \]**

Do not block the entire dashboard.

**Permission restricted**

Do not display widgets a user does not have permission to view rather
than showing numerous "access denied" panels.

**25. Dashboard Responsive Behaviour**

**Desktop**

Full sidebar.

2–4 column metric cards.

Multiple dashboard sections.

**Tablet**

Collapsible sidebar.

Cards wrap into 2 columns.

Tables can become condensed lists.

**Mobile**

The mobile dashboard should prioritise immediate work rather than
analytics.

Display compact, tappable summary cards for:

> • Follow-ups Today
>
> • Overdue Actions
>
> • Renewals Due Soon
>
> • Unread WhatsApp

Below the summary, show **Today's Follow-ups** and **Upcoming Renewals**
as touch-friendly cards/lists with the most relevant information and
quick actions.

Use bottom navigation for frequently used modules:

**Home \| Leads \| Customers \| WhatsApp \| More**

If Leads are disabled, replace Leads with Follow-ups.

**More** provides access to Renewals & Reminders and other permitted
modules.

Desktop tables should not simply be compressed on mobile. Where
necessary, convert them into readable cards or list rows containing the
most important fields and actions.

Large pipeline charts and detailed reports should not occupy the primary
mobile dashboard.

The same mobile layouts and bottom navigation apply when the CRM is
running as an installed application in standalone display mode. Because
standalone display removes the browser's own interface, the layout must
respect device safe areas so that navigation and content are not
obscured by a notch, rounded corner or home indicator.

**26. Global Record Ownership**

**Record Owner** = the staff member primarily responsible for the
overall Lead or Customer relationship.  
**Assigned To** = the staff member responsible for completing a specific
Follow-up, Renewal action or WhatsApp conversation.

Lead and Customer records use **Record Owner**.  
Follow-ups, Renewal actions and WhatsApp conversations use **Assigned
To**.

By default, operational actions may inherit the related Lead/Customer's
Record Owner. They may be reassigned only by a user holding the relevant
permission in Section 162, and only to a user who can access the related
Lead or Customer (Section 162.1).

Sales Teams and Lead round robin affect only the Record Owner of new
Leads (Section 163). They never assign or reassign Customers,
Follow-ups, Renewal actions or WhatsApp conversations, and changing a
user's Sales Team does not change any existing Record Owner or Assigned
To value.

**27. Global Activity Timeline**

Lead and Customer screens should use a common activity pattern.

Activity types:

> • record created
>
> • note
>
> • call — a user-confirmed call outcome, defined in Section 27.4
>
> • visit
>
> • WhatsApp message
>
> • Email sent / failed
>
> • follow-up scheduled
>
> • follow-up completed
>
> • stage changed
>
> • assignment changed
>
> • customer converted
>
> • service added
>
> • renewal completed
>
> • document uploaded

Example:

**Today · 11:22 AM**

**WhatsApp message sent**

**"Your certificate expires on 08 September..."**

**Yesterday · 4:15 PM**

**Follow-up completed by Arun**

**Customer confirmed renewal.**

**28 Aug · 10:14 AM**

**Renewal reminder scheduled.**

## 27.1 One-Tap Click-to-Call

A user who may access a Lead or Customer (Section 162.1) may initiate a
telephone call from the relevant CRM screen.

The V1 implementation is click-to-call. Selecting **Call** on a
supported phone invokes the device's native calling interface using the
valid normalized telephone number through a `tel:` link. The cellular
conversation itself takes place in the phone's native call interface,
which temporarily takes over from the CRM. A true in-app VoIP system is
outside V1 and is excluded in Section 27.5.

**Where Call must be available**

- Lead Detail
- Customer Detail
- Call-type Follow-up cards and Follow-up details
- Today's Follow-ups
- overdue and upcoming Call follow-ups
- other mobile quick-action areas already defined by this specification

**Initiation rules**

- The user must always initiate the call explicitly. The CRM must never
  start a call automatically.
- If only one valid callable number exists, use it.
- If the existing data model permits multiple callable numbers, allow
  the user to select the required number before opening the native
  calling interface.
- If the phone number is missing or invalid, **Call** is disabled and
  the interface explains why.
- On desktop or an unsupported device, the system may invoke an
  available calling handler or provide a **Copy Number** action. It must
  not pretend that a call was made.

**Tapping Call alone must not**

- mark a Follow-up complete
- create a successful-call activity
- change a Lead stage
- change a Customer status
- claim that the call connected

Phone numbers used for calling should be normalized for the `tel:` link
while retaining user-friendly formatting when displayed in the CRM.

## 27.2 Mobile Call and Return Flow

The flow is:

> Open Lead, Customer or Call Follow-up
>
> → Select Call
>
> → Native phone calling interface opens with the number
>
> → User makes or cancels the call
>
> → User returns to the CRM
>
> → CRM restores the originating record or Follow-up context
>
> → User records the outcome or dismisses the prompt

**Context and return**

- The originating Lead, Customer or Follow-up context is preserved
  before the native calling interface is invoked.
- When the user returns, **Record Call Outcome** is readily available
  for the originating record.
- Where technically reliable, the interface may display the outcome
  prompt when the PWA becomes active again.
- The prompt must also remain accessible from the originating record or
  Follow-up if the operating system closes or suspends the PWA.
- The user may dismiss the prompt when the call was cancelled or did not
  take place. Dismissing the prompt must not create a completed-call
  activity.

**What the system must not claim**

- The PWA must not claim that it can automatically determine whether a
  normal cellular call connected, was answered, failed or ended.
- The PWA must not claim to know the call duration unless a future
  approved telephony integration provides reliable information.

## 27.3 Record Call Outcome

**Record Call Outcome** is a small form used to log what actually
happened on a call.

**Field**

**Requirement**

Related Lead or Customer

Automatically selected and read-only

Related Follow-up

Automatically selected when initiated from a Follow-up

Outcome

Required

Note

Optional

Call date and time

Defaults to the call initiation time; correction permitted only where
appropriate

Next action

Optional

**Outcome options in V1**

- Connected
- No Answer
- Busy or Unreachable
- Call Back Requested
- Left Voicemail
- Wrong Number
- Other

**Actions**

- **Save Outcome**
- **Complete Follow-up** — when initiated from an incomplete Follow-up
- **Complete and Schedule Next** — when initiated from an incomplete
  Follow-up
- **Cancel**

**Saving an outcome must**

- create a Call activity in the related Lead or Customer timeline
- record the user who submitted it
- record the call date and time
- record the selected outcome
- preserve the optional note
- reference the originating Follow-up when applicable
- preserve tenant isolation and record-access permissions

Saving a call outcome must not automatically change the Lead stage or
the Customer status.

When the user selects **Complete Follow-up** or **Complete and Schedule
Next**, the existing Follow-up completion and scheduling rules defined
in Section 41 are reused. A separate completion workflow must not be
introduced.

If the selected outcome is **Call Back Requested**, the interface should
make **Schedule Next Follow-up** prominent but must not silently
schedule one.

## 27.4 Call Activity Rules

A Call activity represents a user-confirmed call outcome, not merely a
tap on the **Call** button.

The activity timeline should show:

- call outcome
- related Lead or Customer
- salesperson
- date and time
- note, when provided
- originating Follow-up, when applicable

Historical Call activities must remain available even if the related
user, phone number or configuration is later changed.

**Permissions**

- Call activities are subject to the same workspace isolation, ownership
  visibility and role permissions as the related Lead or Customer.
- A Staff user may call and log outcomes only for records they are
  permitted to access.
- Admin and Manager visibility must follow the existing record-access
  rules.
- Hiding a **Call** button is not sufficient authorization. Access must
  also be enforced server-side where call outcomes are saved.

## 27.5 V1 Call Limitations

V1 does not include:

- in-app VoIP calling
- WebRTC calling
- telephone-number provisioning
- call recording
- call transcription
- automatic call-duration detection
- automatic detection of answered, missed or failed calls
- access to the phone's operating-system call history
- automatic synchronization with cellular call logs
- call-centre integration
- PBX integration
- telephony-provider integration
- automatic outbound calling
- predictive or power dialling

These capabilities may only be evaluated as a separately approved future
integration.

**28. Global Confirmation Rules**

Not every action needs a confirmation modal.

**Require confirmation for:**

> • delete/archive record
>
> • bulk delete
>
> • convert lead
>
> • deactivate user
>
> • bulk send WhatsApp
>
> • controlled bulk Email reminders
>
> • cancel scheduled bulk messages
>
> • disable Email
>
> • change or remove the verified Email sender
>
> • major data import
>
> • destructive configuration changes

**Do not require confirmation for:**

> • add note
>
> • change filter
>
> • change Record Owner / Assigned To
>
> • mark normal follow-up complete
>
> • send an individual Email from a permitted record
>
> • save standard field edits

Where possible, provide **Undo** after lightweight actions instead of
confirmation dialogs.

**29. Global Record Deletion**

V1 uses Archive rather than permanent Delete for core CRM records.

Users can:

> **Archive Lead**
>
> **Archive Customer**

Archived records:

> • disappear from normal lists
>
> • remain searchable under the archived filter, by users permitted to
> view archived records (Sections 162 and 162.1)
>
> • retain history
>
> • can be restored by users holding the archive/restore permission for
> that record type (Section 162)

This reduces accidental data loss.

Archiving stops future operational work; it never deletes a record, an
activity, a message or an audit entry. What each archive cancels is
defined in Section 50 for Leads and Section 78 for Customers. Restoring
is defined in Section 29.1.

## 29.1 Restore Behaviour

This subsection is authoritative for restoring an archived Lead or
Customer. Sections 50 and 78 refer to it.

Restoring must:

- make the record active again under the **same record reference**
- preserve the Record Owner, where that owner is still an active user
  who may hold the record
- validate ownership and access before the restoration completes
  (Section 162.1)
- retain every archive and restore audit entry
- retain the cancellation reasons and historical states created while
  the record was archived

If the former Record Owner is no longer an active, permitted user,
restoration requires the restoring user to choose an active Record
Owner. The system must not silently leave the record with an invalid
owner and must not assign one automatically.

An explicit record share that was never revoked may resume access when
the record is restored. A revoked share stays revoked (Section 162.1).

**Restoring must not automatically**

- reactivate cancelled Follow-ups
- reopen closed WhatsApp conversations
- recreate cancelled reminders
- return Renewal actions to operational queues
- resend any message
- restore separately archived documents
- retry failed provider work
- re-enter a Lead into round robin (Section 163)
- reopen a Converted Lead (Section 46.1)

Operational work is recreated only when a permitted user explicitly
creates or schedules it after restoration. Restoring a Customer does not
restore documents that were archived separately; each document follows
its own lifecycle (Section 176).

**30. Lead Management**

Lead Management is used by businesses that handle enquiries or prospects
before they become customers.

The entire Leads module is hidden when Lead Management is disabled for
the workspace.

The basic flow is:

Lead → Assign → Follow-up → Update Stage → Won → Convert to Customer

or

Lead → Assign → Follow-up → Update Stage → Lost → Closed.

**31. Leads — List View**

**Purpose**

Provide a searchable and filterable view of the Leads the user may
access under Section 162.1.

**Header**

**Leads**

Primary action:

**+ Add Lead**

Secondary actions:

**Import Leads**

**Lead Table**

**Field**

**Example**

Lead Name

Rajesh Menon

Phone

98765 43210

Interested In

Health Insurance

Stage

Interested

Record Owner

Arun

Next Follow-up

05 Sep, 10:30 AM

Last Activity

02 Sep

Actions

⋯

Phone and email information should be shown only according to the user's
permissions.

Selecting a Lead Name opens the Lead Detail screen.

**Filters**

Keep filtering simple.

Available filters:

> • Stage
>
> • Record Owner
>
> • Product / Service
>
> • Follow-up Status
>
> • Created Date
>
> • Sales Team — where Section 162 permits it

Quick filters:

**All \| My Leads \| Follow-up Due \| No Follow-up**

For Staff users, **My Leads** should be the default view unless their
permissions allow broader access.

Users holding the Assignment Required permissions in Section 162 may
also filter by **Unassigned** and **Assignment Required**, and may
resolve, retry or bulk reprocess the waiting Leads from that filtered
view (Section 163.9).

**Search**

Search by:

> • Lead name
>
> • Phone number
>
> • Email

**Row Actions**

The ⋯ menu may contain:

> • View Lead
>
> • Assign / Reassign
>
> • Schedule Follow-up
>
> • Mark as Won
>
> • Mark as Lost
>
> • Archive

Actions must follow role permissions.

**32. Add Lead**

Selecting **+ Add Lead** opens an Add Lead form.

This may be displayed as a modal, drawer or dedicated screen depending
on the final UI design, but the fields and behaviour remain the same.

**Fields**

**Basic Information**

> • Lead Name — required
>
> • Phone Number
>
> • Email
>
> • Product / Service Interested In
>
> • Lead Source
>
> • Stage
>
> • Record Owner
>
> • Notes

At least one contact method — **Phone Number or Email** — must be
provided.

**Default Values**

> • Stage defaults to the first active pipeline stage. In the default
> configuration this is **New.**
>
> • Record Owner defaults according to the workspace's Lead assignment
> rules. Automatic assignment is team-scoped round robin and must
> resolve exactly one active matching rule (Sections 163.7 and 163.8).
> Which Lead field or fields select that rule is unresolved client
> decision 1 (Section 163.18).
>
> • If no rule can be resolved, the Lead is saved in **Assignment
> Required** with the canonical failure reason, and a user holding the
> manual assignment permission in Section 162 may assign it (Sections
> 163.9 and 163.10).
>
> • If a rule applies but no eligible member of its target Sales Team is
> available, the Lead is saved in **Assignment Required** with the reason
> **No Eligible Team Member** rather than rejected (Section 163.9).
>
> • The server validates the Sales Team and assignee. Neither is
> accepted from the browser without authorization checks.
>
> • Every assignment is recorded in the Lead's assignment history
> (Section 163.13).

Custom Lead fields configured by the workspace should appear below the
standard fields.

**Actions**

**Save Lead**

**Save & Add Follow-up**

**Cancel**

**Save Lead**

Creates the Lead and opens the Lead Detail screen.

**Save & Add Follow-up**

Creates the Lead and immediately opens the Schedule Follow-up form.

**Duplicate Warning**

Before saving, the system checks for an existing Lead or Customer whose
normalized phone number or email matches, using the rules in Section
130.1.

If a possible duplicate exists:

> A Lead or Customer with this contact information already exists.

Show the matching record(s) and allow the user to:

**View Existing Record**

or, for a Manager or Owner/Admin (Section 162):

**Create Anyway**

The system warns about duplicates rather than silently creating them,
and never merges records. Where the match is a Customer and this is a
further enquiry, the user creates a new Lead linked to that Customer
instead (Section 47).

**33. Lead Pipeline View**

Users should be able to switch between:

**List \| Pipeline**

The Pipeline view presents leads grouped by stage.

Example:

**New Contacted Interested Won**

**────────────────────────────────────────────────────────**

**Rajesh Meera Priya John**

**Anil Joseph Ramesh**

**Deepa**

Each Lead card should show only useful summary information:

> • Lead name
>
> • Product/service interest
>
> • Record Owner
>
> • next follow-up, if scheduled
>
> • overdue indicator, if applicable

**Stage Movement**

Authorized users may move a Lead from one stage to another using
drag-and-drop or an equivalent stage-change action.

When a stage changes:

> • save the new stage
>
> • record the change in Activity History
>
> • retain the previous stage in history

Moving a Lead to **Won** should prompt the user to convert the Lead into
a Customer.

**Won** may be selected as a pipeline outcome. **Lost** is selected
through the Lead actions/menu rather than displayed as an active
pipeline column.

Example:

**Reason for Lost Lead**

> • Not Interested
>
> • Price / Cost
>
> • Chose Competitor
>
> • Unable to Contact
>
> • Other

If **Other** is selected, allow a short note.

**34. Pipeline Configuration**

Pipeline stages are configurable by Owner/Admin users.

Default stages:

New → Contacted → Interested → Won

**Lost** is treated as a closed outcome rather than an active pipeline
column.

An administrator may:

> • rename active stages
>
> • add an active stage
>
> • reorder active stages
>
> • deactivate an unused stage
>
> • A stage containing active Leads cannot be deactivated until those
> Leads are moved to another active stage.

The system must always retain:

> • a **Won** outcome
>
> • a **Lost** outcome

Changing pipeline configuration must not remove historical stage
information from existing Leads.

Complex stage automation is not part of V1.

**35. Lead Detail Screen**

The Lead Detail screen is the central working screen for an individual
Lead.

Recommended structure:

**Rajesh Menon Interested**

**98765 43210**

**rajesh@email.com**

**Record Owner: Arun**

**\[ WhatsApp \] \[ Email \] \[ Add Follow-up \] \[ Edit \] \[ More \]**

**────────────────────────────────────────**

**Lead Information**

**────────────────────────────────────────**

**Upcoming Follow-up**

**────────────────────────────────────────**

**Activity & Notes**

**36. Lead Header**

Display:

> • Lead Name
>
> • Stage
>
> • Phone
>
> • Email
>
> • Record Owner

Primary actions:

**Call**

**WhatsApp**

**Email**

**Add Follow-up**

**Edit**

**More**

**Call** is enabled only when:

> • the user can access the Lead
>
> • a valid phone number exists
>
> • the device or environment can handle the telephone link

Selecting **Call** follows the click-to-call behaviour defined in
Sections 27.1–27.5. Initiating a call does not by itself create a Call
activity or change the Lead stage.

WhatsAp**p** is enabled only when:

> • a valid phone number exists
>
> • WhatsApp is connected for the workspace
>
> • the user has messaging permission

If WhatsApp is unavailable, the action should show the relevant
disabled/not-connected state rather than failing after selection.

**Email** is enabled only when:

> • a valid email address exists
>
> • the Email module is enabled for the workspace
>
> • the workspace has a verified sender
>
> • the user has permission to send email
>
> • the Lead is not marked **Email Opted Out**

If Email is unavailable, the action should show the relevant
disabled/not-configured state rather than failing after selection.

**37. Lead Information**

Display the Lead's primary information.

Example:

**Field**

**Value**

Interested In

Health Insurance

Lead Source

Referral

Stage

Interested

Record Owner

Arun

Created

29 Aug 2026

Configured custom Lead fields should also appear here.

Authorized users can edit the information using **Edit Lead**.

**38. Upcoming Follow-up**

If an incomplete overdue Follow-up exists, show the earliest overdue
item first. Otherwise show the nearest upcoming Follow-up.

Example:

**Next Follow-up**

**05 Sep 2026 · 10:30 AM**

**Call**

**Discuss premium options.**

**\[ Mark Complete \] \[ Reschedule \]**

If no follow-up exists:

**No follow-up scheduled.**

**\[ Schedule Follow-up \]**

Only the nearest upcoming incomplete follow-up needs to be highlighted
here. Full follow-up history remains available in the activity timeline
and Follow-ups module.

**39. Lead Activity & Notes**

Use the common activity timeline defined earlier.

Example:

**Today · 11:20 AM**

**Arun changed stage**

Contacted → Interested

**Today · 10:45 AM**

**Call — Connected — logged by Arun**

**Customer requested policy details.**

**Yesterday · 4:30 PM**

**WhatsApp message sent.**

**29 Aug · 9:15 AM**

**Lead created by Sneha.**

Users may add a manual note using:

**+ Add Note**

Notes should record:

> • note content
>
> • author
>
> • date/time

Notes form part of the Lead's permanent activity history.

**40. Schedule Follow-up**

A Follow-up may be created from:

> • Lead Detail
>
> • Customer Detail
>
> • main Follow-ups screen - When **+ Add Follow-up** is opened from the
> main Follow-ups screen, the user must first select whether the
> Follow-up relates to a Lead or Customer and then select the
> corresponding record.
>
> • WhatsApp conversation, where applicable

For a Lead, the form contains:

**Field**

**Requirement**

Related To

Lead — automatically selected when opened from Lead Detail

Follow-up Type

Required

Date

Required

Time

Required

Assigned To

Required

Note

Optional

Follow-up Type options in V1:

> • Call
>
> • WhatsApp
>
> • Email
>
> • Visit
>
> • Other

A **Call Follow-up** is a task reminding the assigned user to telephone
the Lead/Customer. Selecting **Call** from a Call Follow-up invokes the
click-to-call flow defined in Sections 27.1–27.5. Scheduling the
Follow-up does not automatically place a call, and initiating a call
does not automatically complete the Follow-up.

A **WhatsApp Follow-up** is a task reminding the assigned user to
contact the Lead/Customer through WhatsApp. Scheduling the Follow-up
does not automatically send a message.

An **Email Follow-up** is a task reminding the assigned user to contact
the Lead/Customer by email. Scheduling the Follow-up does not
automatically send an email.

Follow-ups are never assigned by Lead round robin. A user's Sales Team
or Lead-assignment eligibility does not change who a Follow-up is
assigned to (Section 163.11).

**Actions**

**Schedule**

**Cancel**

After scheduling:

> • the Follow-up appears under the Lead
>
> • it appears in the main Follow-ups screen
>
> • it appears on the appropriate user's Dashboard when due
>
> • an activity entry is created

**Follow-up lifecycle**

A Follow-up holds exactly one of three persisted states:

> • **Scheduled** — created and not yet completed or cancelled
>
> • **Completed** — finished by a user (Section 41)
>
> • **Cancelled** — ended without being completed

**Upcoming**, **Due Today** and **Overdue** are derived time views of a
Scheduled Follow-up (Sections 43 and 44). They are not separate
persisted states, and the system never changes a stored state merely
because time passes.

A Cancelled Follow-up must retain its cancellation reason, the acting
user or system source, the timestamp, the previous due date and time,
and its related record. Cancellation reasons defined by this
specification include `Resolved During Lead Conversion` (Section 46.1),
`Related Lead Archived` (Section 50), `Related Customer Archived`
(Section 78) and `Module Disabled` (Section 172.1).

A Completed or Cancelled Follow-up must never return to Scheduled.
Where further work is needed, a permitted user creates a new Follow-up
(Section 162). Rescheduling a Scheduled Follow-up keeps the same record
(Section 42).

**41. Completing a Follow-up**

A Follow-up is completed by the user it is assigned to, or by a Manager
or Owner/Admin according to Section 162, and only on a record they may
access (Section 162.1).

Selecting **Mark Complete** opens a small completion form.

Display:

**Outcome / Note** — optional

Example:

> Customer is interested. Asked to call again next Monday.

Actions:

**Complete**

**Complete & Schedule Next**

**Complete**

Marks the current follow-up as completed and records it in Activity
History.

**Complete & Schedule Next**

Marks the current follow-up complete and immediately opens a new
Follow-up form.

This supports repeated sales follow-ups without introducing workflow
automation.

**Call follow-ups**

Completion of a Call Follow-up remains an explicit user action.
Initiating a call from the Follow-up does not complete it.

A completed Call Follow-up may store the call outcome selected in
**Record Call Outcome** (Section 27.3). Where the user completes the
Follow-up from that form, the actions above are the same completion and
scheduling rules — **Complete and Schedule Next** continues to use this
workflow. A second completion process must not be introduced.

**42. Reschedule Follow-up**

Selecting **Reschedule** allows the user to change:

> • Date
>
> • Time
>
> • Assigned To, where Section 162 permits reassignment and the new
> assignee can access the related record (Section 162.1)

Optional:

> • Reason / Note

After saving:

> • the same Follow-up remains active with the new schedule
>
> • the reschedule action is recorded in the activity history

If an overdue Follow-up is rescheduled to a future date/time, it returns
to Upcoming status.

The system should not create a duplicate Follow-up merely because an
existing one was rescheduled.

**43. Main Follow-ups Screen**

The Follow-ups module combines follow-ups related to both Leads and
Customers.

Recommended tabs:

**Today \| Upcoming \| Overdue \| Completed**

**Table**

**Field**

**Example**

Date / Time

05 Sep, 10:30 AM

Person

Priya Iyer

Record Type

Lead

Follow-up Type

Call

Related To

Health Insurance

Assigned To

Arun

Status

Due

Actions

⋯

**Record Type** identifies whether the follow-up belongs to a:

> • Lead
>
> • Customer

Selecting the Person opens the related record.

**Filters**

> • Assigned To
>
> • Follow-up Type
>
> • Lead / Customer
>
> • Date Range

Staff users see the Follow-ups assigned to them, together with those on
records they may access under Section 162.1.

**Actions**

From the Follow-ups screen:

> • Call — shown for Call-type follow-ups, subject to Sections 27.1–27.5
>
> • Mark Complete
>
> • Reschedule
>
> • Open Record

Call is available from the Today, Upcoming and Overdue tabs for
Call-type follow-ups. Initiating a call does not complete the Follow-up.

Primary action:

**+ Add Follow-up**

**44. Overdue Follow-ups**

A Follow-up becomes **Overdue** when its scheduled date/time passes
without being completed.

Overdue Follow-ups should:

> • appear under the Overdue tab
>
> • be visually distinguishable
>
> • contribute to Dashboard overdue counts
>
> • remain actionable using Mark Complete or Reschedule
>
> • for Call-type follow-ups, remain callable using Call, subject to
> Sections 27.1–27.5

The system should not automatically mark an overdue Follow-up as
completed or cancelled. Initiating a call from an overdue Call
Follow-up does not complete it.

**45. Mark Lead as Won**

When a Lead is marked **Won**, show:

**Lead marked as Won.**

**Convert this Lead into a Customer?**

**\[ Convert to Customer \]**

**\[ Not Now \]**

Choosing **Not Now** retains the Lead as Won and allows conversion
later.

A **Convert to Customer** action should remain available from the Lead
Detail screen until conversion is completed.

**46. Convert Lead to Customer**

Before conversion, display a confirmation screen/modal summarising the
information that will be carried forward.

Example:

**Convert Lead to Customer**

**Rajesh Menon**

**98765 43210**

**rajesh@email.com**

**The following will be retained:**

✓ Contact information

✓ Record Owner

✓ Notes

✓ Activity history

✓ Follow-up history

**\[ Convert \]**

**\[ Cancel \]**

Conversion is available to a Staff/Sales user for a Lead they own and
can access, and to Managers and Owner/Admin according to Section 162.
Record access follows Section 162.1.

**After Conversion**

The system must:

> • Create exactly one Customer using the Lead's information.
>
> • Retain the Lead's historical activity.
>
> • Link the original Lead and resulting Customer through an immutable
> conversion reference.
>
> • Set the Customer's Record Owner to the Lead's current Record Owner.
>
> • Resolve every incomplete Follow-up as defined in Section 46.1.
>
> • Not run round robin or select a different salesperson
> automatically. Conversion never invokes Lead assignment (Section
> 163.11).
>
> • Mark the Lead as **Converted**.
>
> • Remove Converted Leads from active Pipeline/List views while keeping
> them accessible through a Converted filter/history.
>
> • Prevent the same Lead from being converted a second time.
>
> • Open the newly created Customer Profile.

The original Lead must **not be deleted**.

The integrity, atomicity and Follow-up rules that govern this operation
are defined in Section 46.1 and apply equally to linking a Lead to an
existing Customer (Section 47).

## 46.1 Conversion Integrity Rules

Conversion is an **atomic, idempotent, server-side** operation. It
applies both when a new Customer is created (Section 46) and when a Lead
is linked to an existing Customer (Section 47).

**Required sequence**

1. Verify the Lead is not already **Converted**.
2. Verify the Lead is not **Archived** (Section 50).
3. Lock, or otherwise protect, the Lead against concurrent conversion.
4. Create exactly one Customer, or select the existing Customer being
   linked.
5. Preserve the complete Lead record and its activity history.
6. Set a newly created Customer's Record Owner to the Lead's current
   Record Owner. When linking, the existing Customer's Record Owner is
   unchanged (Section 47).
7. Create an immutable Lead-to-Customer conversion reference.
8. Transfer the eligible incomplete Follow-ups defined below.
9. Set the Lead to **Converted**.
10. Commit every change together, or none of them.

A retry after an uncertain response must return the **existing**
conversion result rather than creating a second Customer. If the Lead
was converted or linked concurrently elsewhere, the conflicting
operation is rejected and the existing result is shown.

**A Converted Lead**

- remains visible in history
- is read-only, except for historical annotations permitted by Section
  162, such as adding a note
- must never return to an active Lead stage
- must never be converted a second time
- must never become an active Lead again through archive and restore
  (Section 29.1)

**Follow-ups during conversion**

Operational Follow-ups must never be left attached to an immutable
Converted Lead.

*Incomplete Follow-ups due in the future* transfer to the resulting
Customer, preserving their type, due date and time, note, creation
history, original Lead reference and — subject to the access check
below — their assignee.

*Incomplete Follow-ups due today or overdue* must be resolved
explicitly during conversion. The conversion screen requires the user to
choose, for each one:

- transfer it to the resulting Customer
- mark it **Completed** with an outcome or note
- **Cancel** it with the reason `Resolved During Lead Conversion`

Conversion must not complete while a due-today or overdue incomplete
Follow-up remains unresolved.

**Assignee validation**

Before any Follow-up is transferred, the server must verify that its
assignee can access the resulting Customer (Section 162.1). If that
access exists, the assignee is preserved. If it does not, conversion
requires either:

- an authorized explicit Customer share (Section 162.1), or
- reassignment to an active user who does have access

The system must not silently remove the assignee and must not silently
grant access.

**Timeline integrity**

A transferred Follow-up appears once in the Customer timeline while
retaining its original Lead reference. Lead and Customer history may be
displayed together through references. The same activity must never be
copied into duplicate rows.

**47. Existing Customer During Conversion**

If a Customer with the same phone number or email already exists, do not
automatically create another Customer.

Show:

**A matching Customer already exists.**

**Ramesh Kumar**

**98765 43210**

**\[ View Customer \]**

**\[ Link Lead to Existing Customer \]**

**\[ Cancel \]**

A user may link the Lead only when they can access **both** records
(Section 162.1); otherwise Manager or Owner/Admin assistance is required
(Section 162).

Linking follows the atomic, idempotent sequence in Section 46.1,
including its Follow-up resolution and assignee-access rules.

When a Lead is linked to an existing Customer:

- the existing Customer remains the same record; no replacement Customer
  is created
- the existing Customer's **Record Owner is unchanged**. Linking never
  transfers Customer ownership
- the Lead's previous Record Owner remains visible in the Lead record
  and in the conversion history
- the Lead is marked **Converted** and its history remains available
- historical Lead activities remain associated with the original Lead
  and are reachable through the linked Customer history, without
  duplicating any activity row

Several Leads may link to the same Customer over time. Each Lead may
link to only **one** resulting Customer.

**Later enquiries from an existing Customer**

A Converted Lead must never be reopened because the same person enquires
again. The authorized user creates a **new Lead linked to the existing
Customer**, with its own reference, source, product or service interest,
Record Owner and assignment history, stage and Follow-ups. The earlier
Lead and its conversion reference remain immutable history.

Duplicate detection (Sections 32 and 55) may warn that the person
already exists, but it must offer this "new enquiry linked to an
existing Customer" path rather than reopening the earlier Lead.

**48. Mark Lead as Lost**

When marking a Lead as Lost:

> • request a Lost Reason
>
> • optionally accept a note
>
> • mark the Lead as Lost
>
> • remove it from the active pipeline
>
> • retain the complete history
>
> • When a Lead is marked Lost, any incomplete Follow-ups for that Lead
> are cancelled with the reason `Lead Marked Lost` and retained in
> history (Section 40). Reopening the Lead does not restore cancelled
> Follow-ups; a new Follow-up may be scheduled.

A Lost Lead may later be reopened by a user permitted to edit that Lead
(Sections 162 and 162.1). A **Converted** Lead is never reopened
(Section 46.1).

Reopening returns the Lead to an active pipeline stage selected by the
user.

**49. Lead Assignment**

A Lead should receive a Record Owner according to the workspace's Lead
assignment rules. If assignment cannot be completed, the Lead may remain
**Unassigned** until a user holding the manual assignment permission
assigns it (Sections 162 and 163.10).

V1 supports manual assignment and **team-scoped** round-robin
assignment of the Record Owner. Round robin rotates only among the
eligible members of one Sales Team. It never rotates across every
salesperson in the workspace and never falls back to another team
(Section 163).

When a Lead assignment rule applies but its target Sales Team has no
eligible member, the Lead remains Unassigned in the **Assignment
Required** state (Section 163.9).

Automatic assignment must resolve exactly one active matching Lead
assignment rule. Where it cannot, the Lead is kept in **Assignment
Required** with a canonical failure reason and is never discarded
(Sections 163.7 and 163.9).

Owner/Admin can configure Sales Teams and Lead assignment rules in
Settings.

Manual assignment follows Section 163.10 and the permission rows in
Section 162: an Owner/Admin may assign to any active workspace user; a
Manager may assign only where that permission is enabled and only within
their permitted records and teams; Staff/Sales users cannot reassign
Leads by default. Whether a Team Lead may reassign within their own team
is unresolved client decision 4 (Section 163.18) and is denied until
approved.

Every reassignment should appear in Activity History.

**50. Lead Archive**

A user holding the Lead archive permission in Section 162 may archive a
Lead they can access (Section 162.1).

Archived Leads:

> • disappear from normal Leads views
>
> • do not appear in the active Pipeline
>
> • retain activity and follow-up history
>
> • can be viewed using an Archived filter by users permitted to see
> archived records
>
> • can be restored (Section 29.1)

**Archiving a Lead must**

> • mark the Lead **Archived** rather than delete it
>
> • make it unavailable for new assignment, for conversion and for new
> operational work
>
> • cancel every incomplete Follow-up with the reason `Related Lead
> Archived` (Section 41)
>
> • close any active Assignment Required warning for that Lead with the
> reason `Related Lead Archived` (Section 163.9)
>
> • close any open WhatsApp conversation that relates only to that Lead,
> while retaining every message and every delivery attempt. Inbound
> messages that arrive afterwards follow Section 88
>
> • preserve Record Owner history, team-assignment and manual-assignment
> history (Section 163.13)
>
> • preserve conversion references, activities, notes and audit history

**Archiving a Lead must not**

> • delete the Lead, its activities or its messages
>
> • alter any other Lead or Customer
>
> • reassign ownership
>
> • advance a round-robin position (Section 163.8)

Where an outbound message has already been accepted by a provider, the
in-flight rules in Section 172.1 apply. The CRM must not present such a
message as cancelled.

Archive always requires confirmation. The confirmation must state which
incomplete Follow-ups will be cancelled, whether an Assignment Required
warning will be closed and whether a conversation will be closed.

The user must confirm before proceeding.

**51. Lead Management — Mobile Behaviour**

The mobile Lead experience should prioritise quick customer contact and
follow-up actions.

**Leads List**

Use card/list rows rather than the full desktop table.

Each item should show:

**Rajesh Menon**

**Health Insurance**

**Interested**

**Next follow-up: Today · 4:30 PM**

**\[ Call \] \[ WhatsApp \]**

**Call** follows the click-to-call behaviour defined in Sections
27.1–27.5. It opens the phone's native calling interface and does
not by itself complete a Follow-up or create a Call activity.

Selecting the card opens Lead Detail.

**Lead Detail**

Keep primary actions easily accessible:

**Call \| WhatsApp \| Email \| Follow-up \| More**

**Call** follows the click-to-call behaviour defined in Sections
27.1–27.5. It opens the phone's native calling interface and does
not by itself complete a Follow-up or create a Call activity.

Where the row or header cannot comfortably show every channel, Email may
be placed under **More**. It must not be removed from mobile entirely.

Information and Activity sections should stack vertically.

**Pipeline**

A complex multi-column desktop board should not be squeezed onto mobile.

On mobile, the Pipeline should use

> • horizontal stage tabs, followed by
>
> • a vertical list of Leads in the selected stage

Example:

**New \| Contacted \| Interested \| Won**

**Interested · 7**

**Rajesh Menon**

**Health Insurance**

**Follow-up tomorrow**

**Priya Iyer**

**Vehicle Insurance**

**No follow-up**

This is more usable on a small screen.

**52. Customer Management**

Customer Management is the central part of the CRM.

Customers may enter the system in two ways:

Lead Conversion → Customer

or

**Add Customer Directly**

A business does not need to use Leads in order to use Customers,
Products/Services, Follow-ups, Renewals, WhatsApp or Email.

Basic customer lifecycle:

Customer → Add Product/Service → Add Important/Due Date → Reminder →
Renewal/Completion → New Due Date

**53. Customers — List View**

**Purpose**

Provide a searchable and filterable view of the Customers the user may
access under Section 162.1.

**Header**

**Customers**

Primary action:

**+ Add Customer**

Secondary action:

**Import Customers**

**Customer Table**

**Field**

**Example**

Customer Name

Ramesh Kumar

Phone

98470 12345

Product / Service

Health Insurance

Record Owner

Arun

Next Due Date

26 Aug 2027

Last Activity

02 Sep

Actions

⋯

If a Customer has multiple Products/Services, the table may show the
nearest upcoming Product/Service or a count such as:

**3 Services**

Selecting the Customer Name opens the Customer Profile.

**Filters**

> • Record Owner
>
> • Product / Service
>
> • Renewal / Due Status
>
> • Created Date

Quick filters:

**All \| My Customers \| Due Soon \| Overdue \| No Upcoming Due Date**

For Staff users, **My Customers** should be the default where their
access is restricted to owned/permitted Customers.

**Search**

Search by:

> • Customer name
>
> • Phone number
>
> • Email
>
> • configured reference/identifier fields such as Policy Number,
> Vehicle Number or Certificate Number

**Row Actions**

The ⋯ menu may contain:

> • View Customer
>
> • Edit
>
> • Change Record Owner
>
> • Add Follow-up
>
> • Add Product / Service
>
> • WhatsApp
>
> • Email
>
> • Archive

Actions must follow role permissions.

**54. Add Customer**

Selecting **+ Add Customer** opens the Customer form.

**Basic Information**

> • Customer Name — required
>
> • Phone Number
>
> • Email
>
> • Record Owner
>
> • Address — optional
>
> • Notes — optional

At least one contact method — **Phone Number or Email** — must be
provided.

Configured Customer custom fields should appear below the standard
fields.

For Customers added directly, Record Owner defaults to the current user
where applicable. Authorized users may select another active user.

Imported Customers may remain **Unassigned** when no valid Record Owner
is mapped.

**Actions**

**Save Customer**

**Save & Add Product/Service**

**Cancel**

**Save Customer**

Creates the Customer and opens the Customer Profile.

**Save & Add Product/Service**

Creates the Customer and immediately opens the Add Product/Service form.

**55. Customer Duplicate Warning**

Before creating a Customer, check for an existing Lead or Customer whose
normalized phone number or email matches (Section 130.1).

If a possible duplicate exists:

> **A Lead or Customer with this contact information already exists.**

Show the matching record(s).

Actions:

**View Existing Record**

**Create Anyway** — Manager or Owner/Admin only (Section 162)

If the match is an existing Lead, the system should allow the user to
open that Lead and decide whether it should be converted instead of
creating a separate Customer.

The system warns about possible duplicates and must never merge records
automatically (Section 130.1).

**56. Customer Profile**

The Customer Profile is the central working screen for an existing
Customer.

Recommended structure:

**Ramesh Kumar**

**98470 12345 · ramesh@email.com**

**Record Owner: Arun**

**\[ WhatsApp \] \[ Email \] \[ Add Follow-up \] \[ Add Product/Service \]
\[ Edit \] \[ More \]**

**────────────────────────────────**

**Customer Information**

**────────────────────────────────**

**Products & Services**

**────────────────────────────────**

**Upcoming Actions**

**────────────────────────────────**

**Activity & Notes**

**────────────────────────────────**

**Documents**

**57. Customer Header**

Display:

> • Customer Name
>
> • Phone
>
> • Email
>
> • Record Owner

Primary actions:

**Call**

**WhatsApp**

**Email**

**Add Follow-up**

**Add Product/Service**

**Edit**

**More**

**Call** is enabled only when:

> • the user can access the Customer
>
> • a valid phone number exists
>
> • the device or environment can handle the telephone link

Selecting **Call** follows the click-to-call behaviour defined in
Sections 27.1–27.5. Initiating a call does not by itself create a Call
activity or change the Customer status.

The WhatsApp action follows the same availability rules defined for
Leads.

If the Customer has no valid phone number, WhatsApp should be
unavailable.

The Email action follows the same availability rules defined for Leads.

If the Customer has no valid email address, is marked **Email Opted
Out**, or the workspace has no verified sender, Email should be
unavailable.

**58. Customer Information**

Display standard Customer information and configured Customer custom
fields.

Example:

**Field**

**Value**

Phone

98470 12345

Email

ramesh@email.com

Record Owner

Arun

Address

Kochi

Customer Since

29 Aug 2026

Authorized users may edit this information using **Edit Customer**.

Changes to Record Owner should be recorded in Activity History.

**59. Products & Services on Customer Profile**

This section shows the Products/Services associated with the Customer.

Example:

**Product / Service**

**Reference**

**Status**

**Next Due Date**

Health Insurance

STAR/FH/44120

Active

26 Aug 2027

Vehicle Insurance

VH/83912

Active

11 Jan 2027

AMC

AMC-2218

Expired

01 Sep 2026

Actions:

**+ Add Product/Service**

Selecting a row opens the Customer Product/Service Detail.

Each Customer may have multiple Products/Services.

**60. Product / Service Definition**

Products/Services are configured by Owner/Admin users and represent what
the business provides.

Examples:

> • Health Insurance
>
> • Vehicle Insurance
>
> • Pollution Certificate
>
> • Vehicle Service
>
> • AMC
>
> • Membership
>
> • Training Course

These are reusable business-level definitions.

A Product/Service definition is different from a **Customer
Product/Service Record**.

Example:

**Business Product / Service**

**Health Insurance**

↓

**Customer Product / Service Record**

**Ramesh Kumar**

**Health Insurance**

**Policy No: STAR/FH/44120**

**Renewal Date: 26 Aug 2027**

**61. Add Product / Service to Customer**

Selecting **Add Product/Service** creates a Customer Product/Service
Record.

**Fields**

> • Product / Service — required
>
> • Reference Number — optional
>
> • Start Date — optional
>
> • Due / Renewal / Expiry Date — optional
>
> • Amount — optional
>
> • Status — required
>
> • Notes — optional

Default Status options:

> • Active
>
> • Completed
>
> • Expired
>
> • Cancelled.

**Actions**

**Save**

**Save & Add Reminder**

**Cancel**

**Save**

Creates the Customer Product/Service Record and returns to the Customer
Profile.

**Save & Add Reminder**

Creates the record and opens the Reminder configuration for its
Due/Renewal date.

If no Due/Renewal date has been entered, the user must enter one before
creating a date-based reminder.

**62. Customer Product / Service Detail**

The detail view should show:

> • Customer
>
> • Product / Service
>
> • Reference Number
>
> • Start Date
>
> • Due / Renewal / Expiry Date
>
> • Amount
>
> • Status
>
> • notes

Actions:

**Edit**

**Add / Edit Reminder**

**Mark Renewed / Completed**

**Add Follow-up**

**Archive**

The Customer name should link back to the Customer Profile.

Archiving a Customer Product/Service removes it from active
Product/Service and Renewal work views, cancels its future scheduled
reminders that have not yet been submitted to a provider, and retains
its details, renewal history and activity. Removal from a work view
never means the renewal was completed (Section 66).

A user holding the archive/restore permission in Section 162 may restore
it. Restoration does not recreate cancelled reminders or requeue Renewal
actions; new work is scheduled explicitly (Section 29.1).

**63. Important Dates**

Important dates are dates associated with a Customer Product/Service
that require future action.

Examples:

> • Policy renewal date
>
> • Certificate expiry date
>
> • AMC renewal date
>
> • Next vehicle service date
>
> • Membership expiry date

For V1, the primary important date used by the Renewals & Reminders
module is the Product/Service's **Due / Renewal / Expiry Date**.

Additional custom date fields may be stored but should not automatically
create reminders unless specifically configured as reminder dates.

**64. Renewals & Reminders — Main Screen**

**Purpose**

Provide a central work view of Customer Products/Services approaching or
past their Due/Renewal date.

Recommended tabs:

**Overdue \| Today \| Next 7 Days \| Next 30 Days \| Later**

**Table**

**Field**

**Example**

Customer

Ramesh Kumar

Product / Service

Health Insurance

Reference

STAR/FH/44120

Due Date

26 Sep 2026

Assigned To

Arun

Reminder Status

Scheduled

Status

Upcoming

Actions

⋯

Selecting the Customer opens the Customer Profile.

Selecting the Product/Service opens its detail view.

**65. Renewal / Reminder Assignment**

A Renewal action uses **Assigned To**, not Record Owner.

By default, the Renewal action should inherit the Customer's Record
Owner.

A user holding the reassignment permission in Section 162 may reassign
it, and only to a user who can access the related Customer (Section
162.1).

Example:

**Customer**

**Record Owner: Arun**

**Health Insurance Renewal**

**Assigned To: Sneha**

Changing the Renewal action's Assigned To does not change the Customer's
Record Owner.

Renewal actions are never assigned by Lead round robin, and a change to
a user's Sales Team does not reassign them (Section 163.11).

**66. Renewal Status**

Recommended V1 statuses:

> • Upcoming
>
> • Due Today
>
> • Overdue
>
> • Renewed / Completed
>
> • Not Renewing

Status is derived from the Due Date and user action.

**Upcoming**

Due Date is in the future.

**Due Today**

Due Date is today.

**Overdue**

Due Date has passed and the item has not been marked Renewed/Completed
or Not Renewing.

**Renewed / Completed**

The business has completed the renewal/service action.

**Not Renewing**

The Customer will not continue the Product/Service for the current
cycle.

**Archived Customers and Products/Services**

Removing a Renewal action from the operational queues because its
Customer or Product/Service was archived does **not** mean the renewal
was completed. Such an action must never be shown as Renewed /
Completed.

- The underlying renewal cycle and its history remain intact (Sections
  62 and 78).
- Restoring the Customer does not automatically return the action to a
  queue (Section 29.1).
- Where the work resumes, a permitted user explicitly creates or resumes
  the operational action (Section 162).

**67. Reminder Configuration**

A reminder may be configured for a Customer Product/Service with a Due
Date.

Example:

**Reminder Schedule**

☑ **30 days before**

☑ **7 days before**

☑ **1 day before**

**Channels**

☑ **In-app**

☑ **WhatsApp**

☑ **Email**

Workspace default reminder settings should be preselected.

Authorized users may adjust the reminder schedule for an individual
Customer Product/Service.

A WhatsApp reminder requires:

> • a valid Customer phone number
>
> • WhatsApp connected for the workspace
>
> • an eligible/approved message template where required

If WhatsApp cannot be used, the reminder should not silently fail.

An Email reminder requires:

> • a valid Customer email address
>
> • Email enabled for the workspace
>
> • a verified workspace sender
>
> • an active Email template
>
> • the Customer not being marked Email Opted Out

If Email cannot be used, the reminder must not silently fail.

## 67.1 Scheduling, Time Zones and Retries

This subsection is authoritative for when a reminder is sent, what
happens when execution is late or missed, and how delivery failures are
retried. Sections 68, 102, 116.12 and 168 refer to it.

**Scheduling**

- The default reminder time is **9:00 AM in the workspace time zone**.
- An Owner/Admin may configure one workspace-wide default reminder time
  (Sections 162 and 168).
- The configured time applies to reminder instances created after the
  change. Changing it must not alter the instant of an existing
  scheduled reminder.
- Each scheduled reminder instance stores its intended local date, its
  resolved UTC instant and the IANA scheduling time zone (Section 158).
- Scheduling must be **idempotent**: one reminder instance is submitted
  once, however many times a worker runs, a job is retried or a page is
  refreshed.
- When a Renewal starts a new cycle and generates reminders (Section
  71), those instances use the workspace time zone and the default
  reminder time in force **at the moment they are created**.

**Late execution on the intended day**

If a worker first processes a reminder later than planned, but it is
still the intended calendar day in the reminder's scheduling time zone,
the system must:

- send it immediately
- retain its original scheduled time
- record the actual submission time
- mark it as late in operational history

**Missed execution**

If no provider submission was attempted before the intended calendar day
ended in the scheduling time zone, the system must:

- not send it
- mark the instance **Failed** with the reason `Scheduled Time Missed`
- notify the assigned user and active Owner/Admin users in-app (Section
  175)
- not enter the transient retry ladder below

**Transient delivery retries**

Where a submission was attempted on the intended day and failed for a
transient reason, the system retries after:

1. **5 minutes**
2. **30 minutes**
3. **2 hours**

A retry that falls after local midnight is still a delivery retry of an
attempt that began on the intended day, and is permitted. It is not a
missed initial schedule.

After the final failed retry the instance is marked **Failed**, every
attempt and provider response is retained, and the assigned user and
active Owner/Admin users are notified in-app.

**Never retried**

A failure must not be retried when it is caused by:

- recipient opt-out (Sections 108 and 116.8)
- an invalid or missing recipient
- missing record access or permission (Sections 162 and 162.1)
- an inactive or unavailable template
- an archived related record (Sections 50 and 78)
- a disabled or disconnected module (Section 172.1)
- permanent provider rejection
- `Scheduled Time Missed`

**Attempt history**

Each attempt carries its own timestamp and result while belonging to one
logical reminder instance. Concurrent workers must never submit the same
attempt twice.

**68. Reminder Status**

A reminder instance holds exactly one of these statuses:

> • **Not Scheduled** — no reminder instance exists for that date
>
> • **Scheduled** — an instance exists with a resolved send instant
>
> • **Sent** — a provider accepted the message
>
> • **Failed** — it could not be sent, including after the final
> permitted retry (Section 67.1)
>
> • **Cancelled** — it was withdrawn before submission, for example
> because the related record was archived or its module was disabled

Every status transition records the acting user or system source, the
time of the transition and, where applicable, the reason. Scheduling,
retries and missed execution are defined in Section 67.1.

For multiple reminders, the Product/Service detail may show the
individual reminder history.

Example:

**30 days before Sent 27 Aug**

**7 days before Scheduled 19 Sep**

**1 day before Scheduled 25 Sep**

**69. Send Reminder Manually**

From Renewals & Reminders, a user holding the reminder permissions in
Section 162 may send a reminder manually for a Customer they can access
(Section 162.1). Delivery failures follow Section 67.1.

Actions:

**Send WhatsApp Reminder**

or

**Send Email Reminder**

or

**Create Follow-up**

Sending a manual WhatsApp or Email reminder should use the applicable communication flow defined in the WhatsApp and Email sections.

A manual reminder should be recorded in:

> • Message History
>
> • Customer Activity
>
> • relevant Product/Service history

**70. Bulk Renewal Reminder**

Authorized users may select multiple eligible records from the Renewals
& Reminders screen.

Available bulk action:

**Send WhatsApp Reminder**

or

**Send Email Reminder**

Before sending, show:

> • number of selected Customers
>
> • selected template
>
> • Customers excluded because the required phone number or email address is missing or invalid
>
> • Customers excluded because of channel restrictions, opt-out status, missing variables or unavailable configuration
>
> • confirmation before sending

Example:

**Send Reminder**

**Selected: 24**

**Eligible: 21**

**Cannot send: 3**

**Template:**

**Renewal Reminder ▼**

**\[ Send to 21 Customers \]**

**\[ Cancel \]**

Bulk messaging must not imply unrestricted WhatsApp broadcasting. Only
eligible messages should be sent.

Controlled bulk Email reminders follow the validation, review and result rules defined in the Email Communications section.

**71. Mark Renewed / Completed**

Renewal completion is performed by the user the Renewal action is
assigned to, or by a Manager or Owner/Admin, according to Section 162.

Selecting **Mark Renewed / Completed** opens a small form.

Fields:

> • Completion / Renewal Date — default today
>
> • New Due / Renewal Date — optional
>
> • Reference Number — prefilled/editable if applicable
>
> • Amount — optional
>
> • Note — optional

Actions:

**Save**

**Cancel**

**If a New Due Date is entered**

The current cycle is marked completed and the Product/Service remains
active with the new Due Date.

Future reminders are generated from the new Due Date according to the
reminder configuration, using the workspace time zone and default
reminder time in force when those instances are created (Section 67.1).

Example:

**Old Due Date**

**26 Aug 2026**

↓

**Renewed**

**02 Sep 2026**

↓

**New Due Date**

**26 Aug 2027**

The previous Due Date and renewal event remain in history.

**72. Complete Without Another Due Date**

Some services are completed once and do not require another renewal.

If **Mark Renewed / Completed** is selected without a New Due Date:

> • mark the current action completed
>
> • retain the completion in history
>
> • do not create another renewal cycle
>
> • no new reminders are scheduled

If completed without a New Due Date, set the Customer Product/Service
status to **Completed**.

**73. Mark as Not Renewing**

A user permitted to complete the Renewal action may also mark it Not
Renewing (Section 162).

If the Customer will not renew:

**Mark as Not Renewing**

Optional fields:

> • Reason
>
> • Note

Example reasons:

> • Customer declined
>
> • Switched provider
>
> • No longer required
>
> • Unable to contact
>
> • Other

After saving:

> • remove the item from active renewal work views
>
> • cancel future reminders for the current cycle
>
> • retain the full history

The Product/Service remains visible on the Customer Profile.

**74. Overdue Renewal Behaviour**

A Customer Product/Service becomes **Overdue** when its Due Date passes
without being completed or marked Not Renewing.

Overdue items:

> • appear under the Overdue tab
>
> • contribute to Dashboard Overdue Actions
>
> • remain actionable
>
> • continue to show their original Due Date
>
> • do not automatically renew or close

Available actions include:

> • Send Reminder
>
> • Add Follow-up
>
> • Mark Renewed / Completed
>
> • Mark Not Renewing

**75. Upcoming Actions on Customer Profile**

The Customer Profile should show the nearest outstanding actions.

Example:

**Upcoming Actions**

**05 Sep · Follow-up**

**Call regarding renewal.**

**Assigned To: Arun**

**26 Sep · Renewal**

**Health Insurance**

**Assigned To: Sneha**

If overdue actions exist, they should appear before future actions.

Actions may include:

**Complete**

**Reschedule**

**View**

**WhatsApp**

**Email**

depending on the item type.

**76. Customer Activity & Notes**

The Customer timeline combines important activity from across the
Customer relationship.

Examples:

**Today · 10:30 AM**

**WhatsApp reminder sent**

**Health Insurance renewal**

**Yesterday · 4:15 PM**

**Follow-up completed by Arun**

**02 Sep · 11:10 AM**

**Health Insurance renewed**

**New due date: 26 Aug 2027**

**29 Aug · 9:15 AM**

**Customer created from Lead Rajesh Menon**

The timeline should include relevant:

> • follow-ups
>
> • notes
>
> • WhatsApp messages
>
> • Emails
>
> • Product/Service additions
>
> • renewal/completion events
>
> • Record Owner changes
>
> • document uploads

Users may add a manual note using: **+ Add Note**

**77. Customer Documents**

Customer-related files may be uploaded to the Customer Profile.

Examples:

> • policy document
>
> • certificate
>
> • agreement
>
> • ID/supporting document
>
> • service document

Each document should show:

> • file name
>
> • uploaded by
>
> • uploaded date
>
> • related Product/Service where applicable

Actions:

**View / Download** — for Customers the user may access (Section 162.1)

**Archive** — Manager or Owner/Admin only (Section 162). V1 has no
immediate permanent deletion of Customer documents.

Permitted file types, validation, malware scanning, storage, expiring
download links and the document lifecycle are defined in Section 176.1.

**78. Customer Archive**

A user holding the Customer archive permission in Section 162 may
archive a Customer they can access (Section 162.1).

Archived Customers:

> • disappear from normal Customer views
>
> • remain accessible through an Archived filter, to users permitted to
> view archived records
>
> • retain Products/Services, activities and documents
>
> • can be restored (Section 29.1)

**Archiving a Customer must**

> • mark the Customer **Archived** rather than delete it
>
> • prevent new Follow-ups, Renewal actions, reminders, CRM-originated
> outbound messages and document uploads. Inbound provider messages are
> still received and retained (Section 88)
>
> • cancel incomplete Follow-ups with the reason `Related Customer
> Archived`
>
> • cancel future reminders that have not yet been submitted to a
> provider (Section 67.1)
>
> • remove active Renewal actions from operational queues without
> deleting their history (Section 66)
>
> • close open WhatsApp conversations while retaining every message and
> every delivery attempt (Section 88)
>
> • retain Products/Services, policies and renewal cycles, documents,
> notes and activities
>
> • retain Lead-conversion references (Section 46.1)
>
> • retain Record Owner history, explicit-share history and audit
> history (Sections 162.1 and 163.13)

**Archiving a Customer must not**

> • delete Products/Services, policies or documents
>
> • mark an unfinished Renewal as Renewed / Completed
>
> • create a replacement Customer
>
> • change the Record Owner
>
> • delete WhatsApp or Email opt-out preferences
>
> • cancel a message a provider has already accepted (Section 172.1)

The retained information of an archived Customer is visible only to
users permitted to view archived records (Sections 162 and 162.1).

Archive always requires confirmation. The confirmation must state which
incomplete Follow-ups and unsent reminders will be cancelled, which
Renewal actions will leave the operational queues, and which
conversations will be closed.

**79. Customer Management — Mobile Behaviour**

The mobile Customer experience should prioritise contact and immediate
actions.

**Customer List**

Use card/list rows.

Example:

Selecting the card opens Customer Profile.

**Customer Profile**

Primary actions should remain easily accessible:

**Call \| WhatsApp \| Email \| Follow-up \| More**

**Call** follows the click-to-call behaviour defined in Sections
27.1–27.5. It opens the phone's native calling interface and does
not by itself complete a Follow-up or create a Call activity.

Where the header cannot comfortably show every channel, Email may be
placed under **More**. It must not be removed from mobile entirely.

The profile should stack:

> • Customer information
>
> • Upcoming Actions
>
> • Products & Services
>
> • Activity
>
> • Documents

**Add Product/Service** should remain accessible from the More menu or
prominent profile action.

**Renewals & Reminders**

Use a vertical work list rather than a desktop table.

Example:

**Ramesh Kumar**

**Health Insurance**

**STAR/FH/44120**

**Due in 4 days**

**Reminder: Not Scheduled**

**Assigned To: Arun**

**\[ WhatsApp \] \[ Email \] \[ View \]**

Tabs such as:

**Overdue \| Today \| 7 Days \| 30 Days**

may scroll horizontally on mobile.

**80. Customer / Renewal Flow Summary**

The Customer workflow should support both customers converted from Leads
and customers added directly.

**Customer**

↓

**Add Product / Service**

↓

**Enter Due / Renewal Date**

↓

**Configure Reminder**

↓

**Due Date Approaches**

↓

**In-app / WhatsApp / Email Reminder**

↓

**Customer Responds / Staff Follows Up**

↓

**Renewed / Completed?**

**│**

**├── Yes**

│ ↓

**│ New Due Date?**

**│ │**

│ ├── Yes → Start Next Cycle

│ └── No → Complete

**│**

**└── No**

↓

**Not Renewing**

↓

**Close Current Cycle**

**81. WhatsApp Module**

The WhatsApp module allows users holding the WhatsApp permissions in
Section 162 to communicate with Leads and Customers they may access
(Section 162.1) and to manage incoming customer replies.

V1 supports:

> • individual WhatsApp messaging
>
> • template-based messages where required by the WhatsApp platform
>
> • renewal/reminder messages
>
> • controlled bulk messaging to eligible recipients
>
> • incoming customer replies
>
> • lightweight shared conversation inbox
>
> • conversation assignment
>
> • conversation status
>
> • message delivery status and history

The WhatsApp module is **not** a full customer-support or omnichannel
inbox.

The WhatsApp module does not include:

> • SMS channels
>
> • social-media channels
>
> • chatbot builder
>
> • ticketing
>
> • SLA management
>
> • complex routing
>
> • advanced messaging automation
>
> • marketing campaign analytics

Email is a separate outbound communication channel in V1 and is defined
under Email Communications. It is not part of the WhatsApp module and
does not share the WhatsApp conversation inbox.

For V1, each workspace uses **one connected WhatsApp business messaging
connection/number**.

Support for multiple WhatsApp numbers within the same workspace is
outside V1.

## 81.1 WhatsApp Provider Contract

The CRM integrates through a **server-side provider adapter**. The
specification stays provider-agnostic: which provider is used is a
deployment decision requiring CTO approval (Section 180.1). Provider
credentials, tokens and secrets must never be exposed to the browser.

The adapter must support outbound submission, inbound messages,
delivery-status events, template synchronization, provider message
identifiers, error classification and connection status.

**Webhook security**

Every inbound provider call must be:

> • signature-verified using the provider's documented mechanism
>
> • rejected when the signature is invalid
>
> • protected against replay where the provider supports it
>
> • processed **idempotently**
>
> • deduplicated by workspace connection together with the provider
> event or message identifier
>
> • safe when the same event is delivered twice or out of order

Audit metadata is retained for each event without logging credentials or
secrets.

The workspace is identified from the **receiving business number or
provider connection** before any contact record is considered. Workspace
identity must never be resolved from the customer's phone number alone.
Contact matching then follows Sections 94, 96 and 130.1.

An event for an archived record is still accepted and retained, and
creates no operational work (Section 88).

**Delivery status and ordering**

Status events are applied **monotonically** along the provider's valid
lifecycle. A delayed lower-progress event must never downgrade a later
confirmed state — a late `Sent` cannot replace a confirmed `Delivered`
or `Read`.

A late failure must not overwrite a confirmed Delivered or Read state
unless the provider contract explicitly defines that failure as
authoritative for the same attempt.

Raw provider events and each delivery attempt are retained for audit.

**Messaging window and templates**

- A free-form outbound message is permitted only while the provider's
  customer-service window allows it.
- Outside that window an **active, provider-approved template** is
  required.
- The server enforces this even when the interface is bypassed.
- A template that is inactive, rejected, paused or deleted at the
  provider must not be used.
- The CRM records which template, template version and variable values
  were used for each message.

**Outbound attempts and retries**

- A transient failure permits at most **three retries** after the
  initial attempt.
- Provider responses are classified as transient or permanent.
- Every attempt is retained separately with its own timestamp, result
  and provider message identifier.
- Concurrent workers must never submit the same attempt twice.
- A retry creates another **delivery attempt for the same logical
  message**. It must never create a second conversation message.
- A manual **Retry** action revalidates every condition before
  resubmitting.

No retry is permitted when the recipient is opted out, the number is
invalid, the related record is archived, the sender connection is
disabled or disconnected, the template is inactive or no longer
approved, permission or record access is missing, or the provider
returned a permanent rejection.

**Rate and bulk limits**

Both provider limits and workspace limits are enforced. The V1
controlled bulk limit is **500 recipients per job**. The final
production limit requires CTO approval after load testing and a review
of provider policy (Section 180.1).

**82. WhatsApp Navigation**

Selecting **WhatsApp** from the main navigation opens the shared
WhatsApp Inbox.

Recommended structure:

**WhatsApp**

**All \| Mine \| Unassigned**

**\[ Search conversations \]**

Each conversation row should show:

> • Lead/Customer name, or phone number for an unknown contact
>
> • latest message preview
>
> • latest message time
>
> • unread indicator
>
> • Assigned To
>
> • Open/Closed status where useful

Selecting a conversation opens the Conversation screen.

Staff users see only conversations permitted by their role.

**83. WhatsApp Inbox**

The Inbox provides a shared view of incoming and outgoing WhatsApp
conversations.

**Tabs**

**All**

Shows conversations the user has permission to access.

**Mine**

Shows conversations currently **Assigned To** the logged-in user.

**Unassigned**

Shows conversations that do not currently have an Assigned To user.

Owner/Admin and permitted Managers may access Unassigned conversations.

Staff users do not have access to all workspace conversations. They see
the conversations assigned to them on records they may access (Sections
162 and 162.1).

**84. Conversation List**

Example:

**Person**

**Latest Message**

**Assigned To**

**Time**

**Status**

Ramesh Kumar

Yes, please renew it

Arun

10:32 AM

Open

Priya Iyer

Thank you

Sneha

9:45 AM

Open

98765 43210

I need more details

Unassigned

Yesterday

Open

Unread conversations should be visually distinguishable.

Search supports:

> • Lead/Customer name
>
> • phone number

V1 does not require complex support-inbox filters, labels or queues.

**85. Conversation Identity**

A WhatsApp conversation is primarily identified by:

**Workspace WhatsApp Number + Contact Phone Number**

Both sides use the normalized comparison value defined in Section 130.1,
and the workspace is identified from the receiving connection rather
than from the contact's number (Section 81.1).

The system should maintain a single continuous conversation history for
that contact rather than creating a separate conversation every time a
message is sent.

Where the same phone number is linked to a Lead that is later converted
into a Customer, the existing WhatsApp conversation continues and
becomes associated with the resulting Customer.

The conversion should **not create a second conversation**.

Closed conversations are also part of the same history and are reopened
rather than duplicated when new messages arrive.

**86. WhatsApp Conversation Screen**

Recommended desktop structure:

**Ramesh Kumar**

**Customer**

**98470 12345**

**Open**

**Assigned To: Sneha**

**────────────────────────────────────**

**Conversation**

**10:15 AM**

**Business:**

**Your Health Insurance policy expires**

**on 26 September. Would you like us**

**to assist with renewal?**

**10:32 AM**

**Ramesh:**

**Yes, please renew it.**

**────────────────────────────────────**

**\[ Message composer / Template selector \]**

**────────────────────────────────────**

**Customer Context**

**Health Insurance**

**Due: 26 Sep 2026**

**Record Owner: Arun**

**\[ Open Customer \]**

**\[ Add Follow-up \]**

The Conversation screen should provide enough CRM context to understand
who the customer is and take the next action.

It should not reproduce the entire Customer Profile.

**87. Conversation Assignment**

A WhatsApp conversation uses **Assigned To**.

It does not use Record Owner.

When the first conversation is created for an existing Lead or Customer:

> • if the record has a Record Owner, the conversation initially
> inherits that user as **Assigned To**
>
> • if no suitable user can be assigned, the conversation remains
> **Unassigned**

Example:

**Customer Record Owner: Arun**

↓

**New WhatsApp Conversation Assigned To: Arun**

A user holding the conversation assignment permission in Section 162 may
later reassign the conversation, and only to a user who can access the
related Lead or Customer (Section 162.1). Being assigned a conversation
never grants access to that record.

Example:

**Conversation Assigned To: Sneha**

This does **not** change:

**Customer Record Owner: Arun**

Every conversation reassignment should be recorded in activity/history.

WhatsApp conversations are never assigned by Lead round robin. Changing
a user's Sales Team or Lead-assignment eligibility does not reassign
their conversations (Section 163.11).

**88. Conversation Status**

V1 uses:

> **• Open**
>
> **• Closed**

**Open**

The conversation is active or may require attention.

**Closed**

No immediate messaging action is required.

Available actions:

**Close Conversation**

**Reopen Conversation**

A new incoming message to a Closed conversation whose related Lead or
Customer is **active** automatically:

> • reopens the same conversation
>
> • marks it unread
>
> • retains its previous message history

Where the related record is archived, the rules under **Archived related
records** below apply instead, and the conversation does not reopen.

Closing a conversation does not:

> • change Lead stage
>
> • change Customer status
>
> • complete a Follow-up
>
> • complete a Renewal
>
> • change Record Owner

WhatsApp conversations are **not permanently deleted through normal V1
CRM actions**.

**Archived related records**

Archiving a Lead or Customer closes its open conversation while
retaining every message and every delivery attempt (Sections 50 and 78).

Archiving prevents new **CRM-originated outbound** messages. It cannot
prevent an external contact from sending an inbound message, and a
provider webhook must never be discarded merely because the related
record is archived.

When an inbound WhatsApp message arrives for an archived Lead or
Customer, the system must:

> • verify and accept the webhook normally (Section 81.1)
>
> • retain the message and its provider metadata
>
> • associate it with the existing conversation where the identity is
> unambiguous
>
> • keep the conversation **Closed**, or blocked from new outbound work,
> with the reason `Related Record Archived`
>
> • show an in-app review alert to the assigned user, where that user is
> still active and permitted, and to active Owner/Admin users (Section
> 175)
>
> • allow a permitted user to inspect the message in read-only context
> (Sections 162 and 162.1)

It must **not**:

> • restore the Lead or Customer
>
> • reopen the conversation as active work
>
> • create a Follow-up, Renewal action, reminder or assignment
>
> • permit an outbound reply while the record remains archived

Responding requires explicit record restoration first (Section 29.1),
and after restoration the conversation reopens only through an explicit
reopen action. It must never reopen automatically.

Where the inbound identity is ambiguous, the event enters the manual
identity-resolution state defined in Sections 96 and 130.1, without
exposing another record or another workspace.

**89. Starting an Individual WhatsApp Message**

Authorized users may initiate WhatsApp messaging from:

> • Lead Detail
>
> • Customer Profile
>
> • WhatsApp Inbox
>
> • Customer Product/Service Detail
>
> • Renewals & Reminders where applicable

Selecting **WhatsApp** should:

> • identify the CRM record's phone number
>
> • open the existing WhatsApp conversation for that number if one
> exists
>
> • otherwise create/open the messaging conversation for that number

The system should not create duplicate conversations for the same
contact phone number.

If the record has no valid phone number:

**WhatsApp unavailable — no valid phone number**

**90. Message Composer**

The available composer depends on the messaging state allowed by the
connected WhatsApp platform.

**When normal reply/free-form messaging is allowed**

Display:

**\[ Type a message... \]**

**\[ Send \]**

**When an approved/eligible template is required**

Do not display an unrestricted composer as though a normal message can
be sent.

Display:

**Select Template**

Example:

**Renewal Reminder ▼**

Preview the populated message.

**\[ Send \]**

The CRM should use the messaging eligibility/state returned by the
WhatsApp integration rather than asking users to understand WhatsApp
platform rules themselves.

**91. WhatsApp Templates**

Owner/Admin users can manage the **CRM's available WhatsApp templates
and their use within the CRM**.

The template screen should display relevant templates available through
the connected WhatsApp integration.

Example:

**Template**

**Purpose**

**Status**

Renewal Reminder

Renewal

Approved

Follow-up Reminder

Follow-up

Approved

Service Expiry

Expiry

Pending

Offer Message

Marketing

Rejected

Relevant states may include:

> • Approved
>
> • Pending
>
> • Rejected
>
> • Unavailable

Only templates currently eligible for sending should be selectable by
normal users.

The CRM should not recreate the entire WhatsApp platform administration
interface.

**Template management boundary in V1**

V1 may synchronize templates from the provider, show their provider
status, preview approved templates and let a permitted user select an
approved template (Section 162).

V1 does **not** create a provider template, submit one for approval,
approve one, or change its approval state at the provider. Those actions
happen in the provider's own administration.

Any **New template** control must therefore either open an explanatory
hand-off to that external administration, or be absent from the
operational V1 interface. It must never imply that the CRM creates a
template that is immediately usable for sending.

**92. Template Variables**

Templates may use supported CRM values.

Example:

**Hello {{customer_name}},**

**Your {{product_service}} is due on {{due_date}}.**

**Please reply if you would like assistance.**

Before sending:

**Hello Ramesh,**

**Your Health Insurance is due on 26 September 2026.**

**Please reply if you would like assistance.**

Supported variables should come from known CRM fields.

Examples:

> • Customer Name
>
> • Lead Name
>
> • Product / Service
>
> • Due Date
>
> • Reference Number

Before manual or bulk sending, the system should resolve required
variables.

If a required value is missing:

> • identify the missing value
>
> • prevent that recipient's message from being sent until resolved

A preview should show the final populated message.

**93. Incoming WhatsApp Message**

When an incoming message is received:

> • identify the sender's phone number
>
> • find the existing conversation for that number
>
> • attempt to associate it with an existing Customer or Lead
>
> • add the message to the conversation
>
> • mark the conversation unread
>
> • reopen it if previously Closed
>
> • notify the Assigned To user where applicable

If the conversation has no Assigned To user but is associated with a CRM
record that has a Record Owner, the conversation should inherit that
Record Owner as Assigned To.

If no assignment can be determined, it remains **Unassigned**.

**94. Matching Incoming Numbers to CRM Records**

Incoming phone numbers should be matched against Leads and Customers.

Matching priority:

> • an already-linked CRM record
>
> • a Customer created through conversion from a linked Lead
>
> • a unique Customer match
>
> • a unique active Lead match

A converted Lead and its resulting linked Customer should **not be
treated as two conflicting matches**.

The Customer becomes the primary active CRM record while the Lead
remains historical.

**95. Message From Unknown Number**

If no matching Lead or Customer exists, the conversation still appears
in the Inbox.

Example:

**Unknown Contact**

**98765 43210**

> Hi, I would like to know about your services.

Actions:

**Create Lead**

**Create Customer**

If Leads are disabled:

**Create Customer**

The phone number should be prefilled.

After creation:

> • link the conversation to the new CRM record
>
> • retain the existing conversation history
>
> • assign the conversation according to the normal conversation
> assignment rule (Section 87)
>
> • if a Lead is created, assign its Record Owner according to the Lead
> assignment rules (Section 163). Lead round robin assigns only the
> Lead; it does not itself assign the conversation.

Creating a Lead/Customer should **not start a new conversation thread**.

**96. Multiple CRM Record Match**

If a normalized phone number matches more than one permitted active CRM
record (Section 130.1), the system must not silently select one. The
conversation enters manual identity resolution.

Show:

**Multiple CRM records use this phone number.**

Display matching records.

Authorized user action:

**Link Conversation**

Until resolved:

> • retain the conversation
>
> • keep the messages accessible
>
> • do not add message activity to any one of the candidate records
>
> • never show a candidate from another workspace

**Who may resolve an ambiguous identity**

Identity ambiguity may be resolved only by:

> • an **Owner/Admin**, or
>
> • a **Manager**, where the capability is enabled and **every**
> candidate record is within that Manager's permitted scope (Sections
> 162 and 162.1)

A **Staff/Sales** user must not resolve shared-number identity
ambiguity, and being a Team Lead grants no identity-resolution
authority.

Where a Manager cannot access every candidate needed to decide safely,
the case is escalated to an Owner/Admin without revealing details of the
inaccessible candidates. Only users permitted to resolve the ambiguity
may view the complete candidate list.

**Resolution audit**

Each resolution records the workspace, the WhatsApp connection or
business number, the normalized contact phone number, the candidate
record references, the selected record, the previously selected record
where one is being corrected, the acting user, the timestamp and a
**mandatory reason**.

Resolving an identity must never merge records, change a Record Owner,
grant record access or move data across workspaces. Every previous
resolution stays in history, and a later correction is possible only
through this same authorized, audited process (Section 97).

**97. Link / Correct Conversation Association**

Authorized users may link an unknown or unresolved conversation to an
existing:

> • Lead
>
> • Customer

Action:

**Link to CRM Record**

Search by:

> • name
>
> • phone
>
> • email

If a conversation is associated with the wrong CRM record, the
association may be corrected by a user permitted to resolve conversation
identity — an Owner/Admin, or a Manager within scope (Sections 96 and
162). The correction follows the same audited process and carries a
mandatory reason.

Correcting the CRM association:

> • does not delete the WhatsApp messages
>
> • does not create a new conversation
>
> • updates where future conversation activity is displayed

The change should be recorded in history.

**98. Sending a Message**

Before sending any outgoing message, the system should verify:

> • WhatsApp is connected
>
> • the user has messaging permission
>
> • the contact has a valid phone number
>
> • messaging is currently eligible
>
> • an eligible template is selected where required
>
> • required template variables are available

Every condition is enforced on the server, not only in the interface
(Section 81.1). If a condition fails, display the reason before or after
the send attempt as appropriate.

The system must not show an unsuccessful message as successfully sent.

**99. Message Status**

Outgoing messages should display the delivery status available from the
WhatsApp integration.

Possible states:

> • Sending
>
> • Sent
>
> • Delivered
>
> • Read — where available
>
> • Failed

Example:

**10:15 AM · Delivered**

If a message fails:

> • mark it Failed
>
> • display a useful reason where available
>
> • allow a permitted user to retry a **transient** failure, within the
> limit of three retries after the initial attempt (Section 81.1)
>
> • retain the failed attempt, its provider response and its identifier
> in message history

A retry creates a new delivery attempt for the same logical message. It
never rewrites a historical failed attempt as successful, and never
creates a second conversation message. Permanent failures — including
opt-out, an invalid number, an archived record, a disconnected sender,
an unusable template or a permanent provider rejection — must not be
retried.

**100. WhatsApp Message History in CRM Records**

Messages associated with a Lead or Customer should contribute to its
Activity Timeline.

The CRM timeline does not need to reproduce every message bubble.

Example:

**Today · 10:15 AM**

**WhatsApp renewal reminder sent**

Health Insurance

Selecting the activity may open the corresponding WhatsApp conversation.

The complete message thread remains available in the WhatsApp module.

Incoming messages that represent meaningful CRM activity may also appear
in the Customer/Lead timeline without duplicating the full conversation.

**101. Create Follow-up From Conversation**

From a linked WhatsApp conversation:

**+ Add Follow-up**

The related Lead or Customer is automatically selected.

The normal Follow-up form opens with:

> • Related To
>
> • Follow-up Type
>
> • Date
>
> • Time
>
> • Assigned To
>
> • Note

The Follow-up's **Assigned To** may differ from the conversation's
Assigned To.

Creating a Follow-up does not:

> • automatically close the conversation
>
> • automatically send a WhatsApp message
>
> • change the CRM Record Owner

**102. Scheduled WhatsApp Renewal Reminder**

A scheduled WhatsApp renewal reminder is different from a normal
WhatsApp Follow-up.

When a configured renewal reminder reaches its scheduled send time, the
system attempts to send the relevant WhatsApp message automatically.

Before sending, verify:

> • Customer has a valid phone number
>
> • WhatsApp connection is active
>
> • the message is eligible to be sent
>
> • an eligible template exists where required
>
> • required CRM variables can be populated

If successful:

> • send the message
>
> • add it to the existing WhatsApp conversation
>
> • mark that reminder instance **Sent**
>
> • record it in Customer Activity
>
> • retain it in Product/Service reminder history

If unsuccessful:

> • do not silently skip it
>
> • mark that reminder instance **Failed**
>
> • record the available reason
>
> • surface the failure to appropriate users

A failed reminder does not automatically become Sent later unless a
successful retry or send occurs. Late execution, missed execution and
the permitted retry intervals are defined in Section 67.1.

**103. Manual Renewal Reminder**

From Renewals & Reminders, a user holding the reminder permissions in
Section 162 may select:

**Send WhatsApp Reminder**

This is an immediate manual send action.

It uses the same eligibility, template and validation rules as other
WhatsApp messages.

It is different from scheduling a future reminder.

Successful manual reminders should be recorded in:

> • WhatsApp Conversation
>
> • Customer Activity
>
> • Product/Service reminder history

**104. Controlled Bulk WhatsApp Messaging**

Authorized users may send the same eligible template message to multiple
selected CRM records.

Bulk messaging may be initiated from permitted views such as:

> • Leads
>
> • Customers
>
> • Renewals & Reminders

The action is:

**Send WhatsApp Message**

V1 bulk messaging is **selection-based messaging**, not a marketing
campaign builder. A bulk job requires the bulk permission in Section 162,
uses an active approved template where one is required, and is limited to
**500 recipients per job** in V1 (Section 81.1).

It does not include:

> • audience campaign management
>
> • automated journeys
>
> • A/B testing
>
> • campaign analytics
>
> • complex segmentation

**105. Bulk Recipient Validation**

Before bulk sending, each selected record should be checked
individually.

Possible exclusions include:

> • missing phone number
>
> • invalid phone number
>
> • duplicate phone number within the selected batch
>
> • messaging unavailable
>
> • opt-out/restriction
>
> • missing required template variable
>
> • insufficient user permission

Where multiple selected records use the same destination phone number,
V1 should send only one copy of that bulk message to that number unless
the records intentionally represent distinct eligible messages such as
separate renewal items.

**106. Bulk Message Review**

Before sending:

**Send WhatsApp Message**

**Selected Records: 42**

**Eligible: 37**

**Excluded: 5**

**Template**

**Renewal Reminder ▼**

**\[ Preview \]**

**\[ Review Excluded \]**

**\[ Send to 37 \]**

**\[ Cancel \]**

The review should show:

> • number selected
>
> • number eligible
>
> • number excluded
>
> • selected template
>
> • message preview
>
> • reason for excluded records

Bulk send requires explicit confirmation.

Excluded recipients do not prevent eligible recipients from being
processed.

**107. Bulk Message Result**

After processing:

**Bulk Message Complete**

**Selected: 42**

**Sent: 35**

**Failed: 2**

**Excluded: 5**

**\[ View Failed \]**

**\[ View Excluded \]**

**\[ Done \]**

Definitions:

**Sent  
** The send request succeeded.

**Failed  
** The CRM attempted to send, but the message was unsuccessful.

**Excluded  
** The CRM did not attempt to send because validation/eligibility failed
before sending.

The user should be able to identify the affected records. Each recipient
keeps its own status and attempt history.

A bulk job may be cancelled for recipients **not yet submitted**.
Cancellation never recalls a message a provider has already accepted
(Section 172.1), and a job must never cross workspace boundaries.

V1 does not require campaign analytics beyond operational send results.

**108. Messaging Eligibility / Opt-Out**

The CRM must respect messaging eligibility or customer communication
restrictions available through the WhatsApp integration and CRM
configuration.

Where outbound messaging should not occur, clearly show an applicable
state such as:

**WhatsApp messaging unavailable**

or

**Customer opted out**

Such recipients must be excluded from applicable bulk or automated
outbound messaging.

A Staff/Sales user may mark a Lead or Customer **WhatsApp Opted Out**.
Only a Manager or Owner/Admin may remove that opt-out, and the removal
is audited (Section 162). The state may also be set from the provider
integration where supported.

An opted-out recipient must not receive manual, automated, reminder or
bulk WhatsApp messages, and an inbound message from that contact does
not remove the opt-out by itself. The interface must show the
restriction and the alternative actions still available.

**Opt-out applies to the destination, not to one record**

WhatsApp opt-out applies to the **normalized phone number** within the
workspace and its WhatsApp connection (Section 130.1). Where several
Leads or Customers use that number:

> • the opt-out blocks manual, automated, reminder and bulk sends
> through **all** of them
>
> • creating another Lead or Customer with that number does not bypass
> it
>
> • resolving conversation identity does not remove it (Section 96)
>
> • an inbound message does not remove it

Contact-level history and record references are retained, but suppression
is enforced at the normalized destination.

The CRM should never attempt to bypass WhatsApp platform restrictions.

**109. WhatsApp Not Connected**

If the workspace has not connected WhatsApp:

**Owner/Admin view**

**WhatsApp isn't connected yet.**

Connect your business WhatsApp account to send and receive customer
messages from the CRM.

**\[ Connect WhatsApp \]**

**Other users**

**WhatsApp is not connected for this workspace. Contact your
administrator.**

WhatsApp actions elsewhere in the CRM should display a
disabled/not-connected state.

Failure to connect WhatsApp must not block normal CRM functionality.

**110. WhatsApp Connection Problem**

If an existing WhatsApp connection becomes unavailable or requires
administrator attention:

**WhatsApp connection needs attention.**

Messages cannot currently be sent or received through the CRM.

Authorized users:

**\[ Review Connection \]**

Existing conversation history remains accessible.

Unrelated CRM functionality remains available.

The CRM should clearly distinguish:

> • never connected
>
> • temporarily disconnected/connection problem

**111. WhatsApp Notifications**

Relevant notifications may include:

> • new WhatsApp reply
>
> • conversation assigned to you
>
> • WhatsApp message failed
>
> • scheduled reminder failed
>
> • bulk send completed
>
> • bulk send partially failed

Selecting the notification opens the relevant:

> • conversation
>
> • Customer/Lead
>
> • renewal/reminder
>
> • bulk-send result

Do not generate a user notification for every successful outgoing
message.

**112. WhatsApp Permission Behaviour**

WhatsApp actions must follow the role/permission rules defined later
under Settings → Roles & Permissions.

At minimum, permissions should distinguish between:

> • viewing permitted conversations
>
> • sending individual messages
>
> • assigning/reassigning conversations
>
> • closing/reopening conversations
>
> • sending bulk messages
>
> • configuring WhatsApp
>
> • viewing/managing templates

Users must not be shown actions they cannot perform, and every action is
enforced on the server (Section 81.1).

The authoritative role matrix is Section 162, and record access follows
Section 162.1.

**113. WhatsApp Inbox — Empty States**

**No conversations**

**No WhatsApp conversations yet.**

Messages will appear here once you start communicating with customers or
receive a reply.

**Mine — no assigned conversations**

**No conversations assigned to you.**

**Unassigned — none**

**No unassigned conversations.**

Avoid displaying an empty table without explanation.

**114. WhatsApp Inbox — Loading / Error States**

**Loading**

Use conversation/message skeleton states.

**Conversation loading failure**

**Unable to load this conversation.**

**\[ Try Again \]**

**Inbox failure**

**Unable to load WhatsApp conversations.**

**\[ Try Again \]**

**Send failure**

Keep the typed message/content available where possible and clearly show
that sending failed.

Do not discard the user's unsent text solely because the send failed.

**115. WhatsApp Inbox — Mobile Behaviour**

WhatsApp is a primary operational mobile module.

**Inbox**

Use a vertical conversation list showing:

> • name/phone
>
> • latest message
>
> • time
>
> • unread state

Assignment information may be shown where useful.

**Conversation**

The message thread occupies the main screen.

Lead/Customer context should be available through a compact header or
secondary panel/action rather than permanently taking excessive space.

Useful actions:

**Call \| Open Record \| Follow-up \| More**

**Call** follows the click-to-call behaviour defined in Sections
27.1–27.5. It opens the phone's native calling interface and does
not by itself complete a Follow-up or create a Call activity.

The message composer should remain easily accessible near the bottom of
the screen.

Conversation assignment/status controls may be available through
**More**.

**116. WhatsApp Flow Summary**

**Incoming Message**

**Incoming WhatsApp Message**

↓

**Find Existing Conversation**

↓

**Match CRM Record**

**│**

**├── Existing Customer / Lead**

│ ↓

**│ Link / Retain Link**

│ ↓

**│ Determine Assigned To**

│ ↓

**│ Mark Unread**

│ ↓

**│ Notify Responsible User**

│ ↓

**│ Reply / Follow-up / CRM Action**

**│**

**└── No Match**

↓

**Unknown Conversation**

↓

**Create Lead / Customer**

**OR Link Existing Record**

↓

**Retain Same Conversation**

**Scheduled Renewal Reminder**

**Reminder Send Time Reached**

↓

**Validate Customer + WhatsApp**

↓

**Validate Template / Variables**

↓

**Eligible?**

**│**

**├── No**

│ ↓

**│ Failed**

│ ↓

**│ Surface Failure**

**│**

**└── Yes**

↓

**Send**

↓

**Sent Successfully?**

**│**

**├── Yes**

│ ↓

**│ Reminder = Sent**

**│ Conversation History**

**│ Customer Activity**

**│**

**└── No**

↓

**Failed**

↓

**Surface / Retry**

**Responsibility Rule**

**Lead / Customer**

**Record Owner: Arun**

↓

**WhatsApp Conversation**

**Assigned To: Sneha**

Changing Assigned To on the WhatsApp conversation does not change the
Lead or Customer Record Owner.

## 116.1 Email Communications

The Email module allows users holding the Email permissions in Section 162 to send business emails from the CRM Lead, Customer and Renewal records they may access (Section 162.1).

Email is an outbound communication channel in V1.

V1 supports:

- sending an individual email from a Lead
- sending an individual email from a Customer
- sending a renewal reminder email
- scheduled renewal reminder emails
- controlled bulk renewal reminder emails
- reusable email templates
- template variables populated from CRM data
- file attachments
- email activity history on the related CRM record
- delivery and failure status where available
- email communication preferences and opt-out handling

V1 does not include:

- a shared email inbox
- Gmail or Outlook mailbox synchronization
- reading incoming replies inside the CRM
- automatic association of incoming emails
- email conversation assignment
- marketing campaign management
- automated sales sequences
- audience segmentation
- A/B testing
- email open or click tracking
- a complex drag-and-drop email designer

Replies are delivered to the configured Reply-To address outside the CRM. They are not synchronized back into the CRM in V1.

Email functionality must remain optional. A workspace that does not enable or configure Email must continue to use the rest of the CRM normally.

## 116.2 Email Entry Points

Authorized users may initiate an individual email from:

- Lead Header
- Lead Detail
- Customer Header
- Customer Profile
- Customer Activity
- Customer Product / Service Detail
- Renewals & Reminders

Available actions may include:

**Send Email**

**Send Email Reminder**

Email actions should appear only when:

- the Email module is enabled
- a verified sender is configured
- the user has permission to send email
- the related record contains a valid email address
- the recipient is eligible to receive email

Selecting an email address from a Lead or Customer record should open the CRM email composer rather than exposing configuration details.

## 116.3 Workspace Email Sender

V1 supports one active email sender identity per workspace.

The sender configuration contains:

- Sender Name
- Sender Email Address
- Reply-To Address
- Verification Status

Possible verification states:

- Not Configured
- Verification Required
- Verified
- Configuration Problem

Outbound email must be sent through the server-side email service. Email provider credentials and secrets must never be exposed to the browser.

If the sender is not verified, normal email actions should be disabled and the user should see a clear explanation.

Owner/Admin:

**Email sending is not configured. Configure and verify a sender before sending email.**

Other users:

**Email is not available for this workspace. Contact your administrator.**

A missing or failed email configuration must not block unrelated CRM functionality.

## 116.4 Email Composer

Selecting **Send Email** opens the email composer.

Show:

- From — configured workspace sender, read-only
- Reply-To — configured workspace address, read-only
- To — prefilled from the Lead or Customer
- Template — optional
- Subject — required
- Message — required
- Attachments — optional
- Related Record — read-only
- Send
- Cancel

The recipient may be changed only to another permitted email address stored on the same CRM record. V1 does not require arbitrary recipient entry, CC or BCC.

The message editor may support basic formatting:

- paragraphs
- bold
- italic
- lists
- links

V1 does not require arbitrary HTML editing or a visual email-page builder.

Before sending, the user should be able to review the recipient, subject, message and attachments.

If the composer is closed with unsent changes, warn the user before discarding the content.

## 116.5 Email Templates

Owner/Admin can create reusable Email templates.

Template fields:

- Template Name
- Purpose
- Subject
- Message
- Available Variables
- Status

Example purposes:

- Lead Follow-up
- Customer Follow-up
- Product / Service Information
- Document Sharing
- Renewal Reminder
- General Communication

Template statuses:

- Active
- Inactive

Actions:

- Add
- Edit
- Preview
- Duplicate
- Deactivate
- Reactivate

Deactivating a template prevents future selection but does not remove it from historical email activity.

Templates belong to one workspace and must never be visible to another workspace.

V1 does not require template approval by the email provider.

## 116.6 Email Template Variables

Email templates may use approved CRM variables.

Examples:

- Customer First Name
- Customer Full Name
- Lead First Name
- Lead Full Name
- Business Name
- Product / Service Name
- Due Date
- Renewal Date
- Assigned User Name
- Record Owner Name

Before sending, the CRM should replace each variable with data from the related record.

If a required variable cannot be populated:

- do not silently send incomplete template text
- identify the missing variable
- allow the user to correct the record or edit the message
- block automated sending until the required value is available

The preview must show the final resolved subject and message.

## 116.7 Email Attachments

Authorized users may attach permitted files to an individual email.

Attachments may be:

- uploaded from the user's device
- selected from Customer Documents, where applicable

Validate attachments before sending.

Validation must include:

- permitted file type, verified by signature and MIME, with a successful
  malware scan, exactly as defined in Section 176.1 — including for a
  file uploaded only for this message
- a total attachment size of no more than **10 MB** per email
- safe file name
- successful upload
- file availability
- user access to the related document

Executable or otherwise prohibited file types must not be accepted.

When an attachment is selected from Customer Documents, the original document remains part of the Customer record.

An attachment uploaded while emailing a Lead may be retained with the email activity entry but does not create a general Lead Documents module.

Email activity retains attachment names and references for users who may access the related record (Section 162.1).

## 116.8 Recipient Validation and Email Preference

Before sending, validate:

- the related record exists
- the user can access the record
- the user has email permission
- the Email module is enabled
- the workspace sender is verified
- the recipient email address is present
- the recipient email address has a valid format
- the recipient is not marked Email Opted Out
- required template variables are available
- attachments are valid and accessible

Lead and Customer records should support:

**Email Opted Out**

When Email Opted Out is enabled:

- automated email reminders must not be sent
- bulk email must exclude the record
- individual email actions should be disabled
- existing email history must remain visible

A Staff/Sales user may record **Email Opted Out**. Only a Manager or Owner/Admin may remove it, and the removal is audited (Section 162). Every change is recorded in CRM Activity with the acting user and date.

An unsubscribe or provider complaint may set the opt-out automatically. No delivery event, later profile edit, address change or import may clear it silently (Section 116.19).

**Email Opted Out** and complaint suppression are **consent** restrictions recorded at contact level, with the normalized destination suppressed as well. They are separate from the technical deliverability states in Section 116.19: clearing one never clears the other, and a send requires both a deliverable address and an unsuppressed contact.

Because several records may share a destination, the restriction applies through every one of them; another record, an import or a formatting-only edit cannot be used to send anyway (Sections 116.19 and 130.1). Where a contact who opted out is given a genuinely different address, sending resumes only after an explicit, auditable opt-in (Section 116.19).

## 116.9 Sending an Individual Email

When the user selects **Send**:

1. Revalidate authentication, workspace access and permission on the server.
2. Revalidate the recipient, template variables and attachments.
3. Create an Email send record linked to the Lead or Customer.
4. Submit the email through the configured server-side provider.
5. Record the result.
6. Add the activity to the related CRM timeline.

The Send button should prevent accidental repeated submissions while processing.

A successful send should show:

**Email sent successfully.**

A failed send should show:

**Email could not be sent. Review the error and try again.**

If sending fails:

- retain the composed subject and message where possible
- do not record the email as successfully sent
- store the available failure reason and provider identifier
- allow a permitted user to retry a transient failure, within the limit
  of three retries after the initial attempt (Section 116.19)
- do not create duplicate successful sends during retry

## 116.10 Email Status

Possible Email statuses:

- Queued
- Sent
- Delivered
- Failed
- Bounced

Definitions:

**Queued**

The CRM accepted the request and is waiting to submit it to the email provider.

**Sent**

The email provider accepted the message for delivery.

**Delivered**

The provider confirmed delivery where such confirmation is available.

**Failed**

The CRM or provider could not send the email.

**Bounced**

The provider reported that the recipient address did not accept the email. A **hard** bounce additionally establishes the technical state **Undeliverable** for that address and blocks new sends to it, while a provider **complaint** establishes the consent restriction **Email Opted Out** for the contact (Section 116.19).

Status events are applied monotonically in attempt and event order. A late event from an earlier attempt must never downgrade a later confirmed status, and must never clear an established Undeliverable state, opt-out or complaint suppression (Section 116.19).

The CRM must not describe an email as Delivered unless the provider has confirmed delivery.

Sent or Delivered does not mean that the recipient opened or read the email.

V1 does not include open tracking or click tracking.

## 116.11 Email History in CRM Records

Sent and attempted emails should appear in the related Lead or Customer Activity timeline.

Show:

- Date and Time
- Email Status
- Recipient
- Subject
- Message
- Attachment Names
- Sent By
- Related Product / Service, where applicable
- Failure Reason, where applicable

Example:

**Today · 11:30 AM**

**Email sent by Meera**

**Subject: Health Insurance Renewal**

**To: anjali@example.com**

Selecting the activity opens the permitted email details.

Email history follows the same record visibility and workspace-isolation rules as the related Lead or Customer.

Users must not access email content for CRM records they are not permitted to view.

Email activity is historical data and must not be deleted when:

- a template is deactivated
- a user is deactivated
- the Email module is disabled
- a Lead or Customer is archived

## 116.12 Scheduled Email Renewal Reminder

Email may be selected as a reminder channel for a Customer Product / Service with a Due Date.

When the scheduled reminder time is reached, validate:

- the Customer still exists and is eligible
- the Customer has a valid email address
- Email Opted Out is not enabled
- the Email module is enabled
- the workspace sender remains verified
- an active Email template is available
- required variables can be populated
- the reminder instance has not already been sent

If successful:

- send the email
- mark the reminder instance Sent
- record the email in Customer Activity
- retain it in Product / Service reminder history

If unsuccessful:

- do not silently skip the reminder
- mark the reminder instance Failed
- store the available failure reason
- notify the appropriate user
- allow a permitted user to retry within the limits in Section 67.1, or
  to take another action permitted by Section 162

The system must prevent the same reminder instance from being sent twice because of a retry, refresh or repeated background-job execution.

Late execution, missed execution, the permitted retry intervals and the failures that must never be retried are defined in Section 67.1.

## 116.13 Manual Email Renewal Reminder

From Renewals & Reminders, a user holding the reminder permissions in
Section 162 may select:

**Send Email Reminder**

This is an immediate send action and is different from scheduling a future reminder.

The recipient, template, variables and attachments should be reviewed before sending.

A successful manual email reminder should be recorded in:

- Email History
- Customer Activity
- relevant Product / Service reminder history

A manual email reminder follows the same eligibility, permission and validation rules as other outbound emails.

## 116.14 Controlled Bulk Email Reminder

Authorized users may send the same Email template to multiple selected renewal records.

Bulk Email in V1 is available only from Renewals & Reminders. It is not a general marketing campaign feature.

Before sending, validate each selected record separately.

Possible exclusions include:

- missing email address
- invalid email address
- Email Opted Out
- duplicate recipient for the same renewal
- missing template variable
- inactive template
- unavailable sender configuration
- insufficient user permission

Review screen:

**Send Email Reminder**

**Selected: 24**

**Eligible: 21**

**Excluded: 3**

**Template:**

**Renewal Reminder**

**[Preview]**

**[Review Excluded]**

**[Send to 21 Customers]**

**[Cancel]**

Bulk Email requires explicit confirmation and is limited to **500 recipients per job** in V1 (Section 116.19).

Excluded records do not prevent eligible records from being processed.

After processing, show:

**Bulk Email Complete**

**Selected: 24**

**Sent: 19**

**Failed: 2**

**Excluded: 3**

**[View Failed]**

**[View Excluded]**

**[Done]**

The user should be able to identify affected records and the reason for each failure or exclusion.

V1 does not include campaign analytics beyond operational send results.

## 116.15 Email Permission Behaviour

Email actions follow the role matrix in Section 162 and the record-access rules in Section 162.1.

Permissions should distinguish between:

- sending individual emails
- sending manual renewal emails
- sending controlled bulk renewal emails
- creating and managing Email templates
- configuring the workspace Email sender

Users should not see or execute actions they do not have permission to perform.

Every server-side email operation must independently enforce:

- authenticated user
- workspace isolation
- related-record access
- role permission
- recipient eligibility

Hiding an Email button in the user interface is not sufficient authorization.

## 116.16 Email Empty, Loading and Error States

**Email not configured**

**Email sending is not configured for this workspace.**

**Recipient missing**

**This record does not have an email address.**

**Invalid recipient**

**Enter a valid email address before sending.**

**Email opted out**

**Email communication is disabled for this recipient.**

**Loading**

Use a clear composer or email-history loading state.

**Send failure**

Keep the user's subject, message and attachment selection where possible and explain that the email was not sent.

**History failure**

**Unable to load Email history.**

**[Try Again]**

Do not display an empty table without an explanation.

## 116.17 Email Mobile Behaviour

Mobile users may:

- send an individual email from a permitted Lead or Customer
- use an Email template
- add permitted attachments from the phone
- send a manual renewal reminder
- view Email activity on a permitted CRM record

The mobile composer should:

- use a full-width layout
- keep the recipient and subject easy to review
- provide a large Send action
- support the phone's file-selection interface
- retain unsent content when a recoverable error occurs

Workspace Email configuration, template administration and bulk Email sending remain web-first.

## 116.18 Email Flow Summary

**Individual Email**

**Lead / Customer**

↓

**Select Send Email**

↓

**Validate User + Workspace + Permission**

↓

**Validate Sender + Recipient + Opt-Out**

↓

**Select Template / Compose Message**

↓

**Resolve Variables + Validate Attachments**

↓

**Review**

↓

**Send**

↓

**Record Status + CRM Activity**

**Scheduled Renewal Email**

**Reminder Send Time Reached**

↓

**Validate Customer + Email Eligibility**

↓

**Validate Sender + Template + Variables**

↓

**Already Sent?**

- **Yes:** Stop and retain the existing result
- **No:** Submit Email

↓

**Sent Successfully?**

- **Yes:** Reminder = Sent, Email History and Customer Activity updated
- **No:** Reminder = Failed, reason stored and responsible user notified

## 116.19 Email Provider Contract

Email is sent through a **provider-independent, server-side adapter**.
Which provider is used is a deployment decision requiring CTO approval
(Section 180.1). Provider credentials and secrets remain server-side and
are never exposed to the browser.

V1 supports **one verified sender identity per workspace** (Section
116.3). The sender must be verified before outbound email is enabled.

The adapter must support submission, delivery events, provider message
identifiers, bounce events, complaint events, error classification and
connection status.

**Webhook security**

Every inbound provider event must be signature-verified, rejected when
invalid, processed idempotently, deduplicated, and safe when delivered
twice or out of order. Events are associated using the workspace
connection together with the provider identifier. Audit metadata is
retained without exposing credentials.

Events for archived records and disabled modules are still accepted and
retained, and create no operational work (Sections 78 and 172.1).

**Three distinct states**

The CRM distinguishes:

- **message delivery status** — what happened to one message (Section
  116.10)
- **recipient-address status** — whether an address can be delivered to
- **contact opt-out status** — whether the person may be emailed at all

**Address-level deliverability**

Deliverability is a **technical** property of the normalized email
address within the workspace (Section 130.1), not of a single Lead or
Customer record. An address holds one of:

- **Unknown** — never yet confirmed either way
- **Deliverable** — a successful delivery has been confirmed
- **Undeliverable** — a hard bounce has been recorded

A **hard bounce** records the message's final bounce result and may
establish **Undeliverable**, blocking new sends to that address.

**Deliverability and consent are separate**

Unknown, Deliverable and Undeliverable describe only whether an address
can technically be delivered to. They say nothing about permission to
write to the person.

**Email Opted Out** and **complaint suppression** are **consent**
restrictions. An explicit unsubscribe, or a provider complaint,
establishes them (Section 116.8).

- Clearing **Undeliverable** never clears an opt-out or complaint
  suppression.
- Clearing an **opt-out** never makes an address Deliverable; its
  technical state is unchanged.
- A send is permitted only when **both** conditions hold: the address is
  not technically blocked, **and** the contact is not suppressed by
  consent.

**Where each restriction is stored**

- The **technical** state belongs to the normalized address within the
  workspace.
- **Consent** is recorded at **contact level**, and the normalized
  destination involved is suppressed as well. Contact-level opt-out
  history is preserved permanently.

Where the same normalized address appears on several records, both kinds
of restriction apply to **every** one of them. Creating another record,
editing a record, importing a record, resolving a duplicate identity or
changing capitalization must never be a way to bypass either (Sections
96 and 130.1).

**Changing a contact's email address**

Where a permitted user changes the contact to a genuinely **different**
normalized address, the system must:

- preserve the previous normalized address and its complete technical
  and consent history in record history and audit
- create the new normalized address with the technical state **Unknown**
  and validate its format
- not copy the previous address's Undeliverable state to the different
  address
- not treat the address change itself as consent

An address change must never restore Email permission for a contact who
opted out or whose address drew a complaint. Sending resumes only after
an **explicit, auditable opt-in** recorded through an approved workflow,
capturing who recorded it, when, for which contact and normalized
address, and the stated basis. V1 requires only this minimum record; it
defines no wider legal consent-capture system.

A change that only alters capitalization, surrounding whitespace or
other formatting produces the **same** normalized address and bypasses
neither the technical block nor the consent restriction.

**Clearing Undeliverable on the same address**

Because the state belongs to the address rather than to one record,
clearing it can affect every record that uses it. It may be cleared
only by:

- an **Owner/Admin**, or
- a **Manager**, where the capability is enabled for Managers **and**
  every record currently using that normalized address is within the
  Manager's permitted scope (Sections 162 and 162.1)

Access to only one of several matching records is **not** sufficient.
Where any matching record falls outside the Manager's scope, the action
must be escalated to an Owner/Admin, and the Manager must not be shown
the details of the records they cannot access. A **Staff/Sales** user
cannot clear the status, and holding the Team Lead responsibility grants
no email-administration authority.

Clearing requires:

- explicit confirmation that the address was corrected or verified
  outside the CRM
- a **mandatory reason**

and records the acting user, the timestamp, the affected normalized
address, the count of records affected, the related records the actor
was permitted to see, whether the action was escalated, and the old and
new technical state.

Re-saving the same address through ordinary record editing must never
clear an Undeliverable status.

Clearing a technical block, or recording a re-opt-in, never merges
records, never changes a Record Owner and never grants record access
(Section 162.1).

**Late and out-of-order provider events**

Provider events are applied **monotonically**, in attempt and event
order (Section 116.10).

- A delayed **Delivered** event belonging to an older attempt must never
  automatically clear a later **Undeliverable** state.
- Once Undeliverable is established for an address, only the authorized,
  audited clearing workflow above may clear it.
- A retry, or a later successful delivery, updates its own attempt and
  message history but must not bypass the address-level block.
- A provider event must never clear an opt-out or complaint
  suppression.

**Attempts and retries**

- A transient failure permits at most **three retries** after the
  initial attempt.
- Each attempt is retained separately with its provider message
  identifier and result.
- Concurrent workers must not create duplicate attempts.
- Permanent failures are classified explicitly.
- A manual retry revalidates every condition first.

No retry is permitted for: Email Opted Out, an Undeliverable address, an
invalid recipient, an archived related record, a disabled Email module,
an unverified sender, missing permission or record access, a permanent
provider rejection, a complaint, or a hard bounce.

**Attachments**

Total attachment size per email must not exceed **10 MB**.

**Every outbound attachment** must pass the file-type, signature, MIME
and size validation and the malware scan defined in Section 176.1
**before submission**, whether it was selected from Customer Documents
or uploaded only for this message. A transient attachment must never
bypass those checks, and a file that fails validation or scanning must
not be sent (Section 116.7).

**Incoming replies**

Incoming replies are **not** synchronized into the CRM in V1 (Section
116.1). Delivery, bounce and complaint webhooks are still processed.
Email remains a separate channel and never becomes a WhatsApp
conversation.

**Bulk limit**

The V1 controlled bulk Email limit is **500 recipients per job**. It is
deployment-configurable only after load testing and CTO approval
(Section 180.1). A bulk job revalidates opt-out status, Undeliverable
status, permission and recipient validity for **every** recipient, and
each recipient keeps its own result and attempt history.

**117. Data Import & Export**

The CRM allows users holding the Import / Export permission in Section
162 to import Lead and Customer data, and to export the records and
fields they may access under Section 162.1.

V1 supports:

> • Lead import
>
> • Customer import
>
> • simple field mapping
>
> • validation before import
>
> • duplicate detection
>
> • partial import where valid rows can continue
>
> • import result summary
>
> • downloadable error report
>
> • basic export of Leads and Customers

V1 does not include:

> • scheduled imports
>
> • automatic synchronization with external systems
>
> • ETL/data-pipeline tools
>
> • complex data transformation
>
> • API-based bulk data migration tools

**118. Import Entry Points**

Import may be started from:

> • Leads → Import Leads
>
> • Customers → Import Customers
>
> • Settings → Data Import / Export

The onboarding import step should also open the same import workflow.

Import is available only to users holding the Import / Export permission
(Section 162), and the limits and file rules in Section 119.1 apply to
every entry point.

**119. Supported Import File**

V1 supports:

> • CSV, encoded as UTF-8
>
> • XLSX only, as the spreadsheet format

Legacy and macro-capable spreadsheet formats — including `.xls`,
`.xlsm` and `.xlsb` — are rejected, as are password-protected or
encrypted files. The limits and validation rules are defined in Section
119.1.

The upload screen must clearly state the accepted formats and the
current limits.

Example:

**Import Customers**

Upload a CSV or Excel file containing your customer data.

**\[ Choose File \]**

**\[ Download Sample File \]**

The sample file should contain the standard CRM fields expected for that
record type.

## 119.1 Import Limits and File Safety

This subsection is authoritative for what an import may accept, how the
file is handled and how long it is kept. Sections 119, 121, 128, 132,
134, 135 and 136 refer to it.

**V1 default limits**

> • maximum uploaded file size: **10 MB**
>
> • maximum data rows: **10,000**
>
> • maximum columns: **200**
>
> • CSV encoding: **UTF-8**
>
> • spreadsheet format: **`.xlsx` only**
>
> • worksheets imported per job: **exactly one**

Where an XLSX file contains more than one worksheet, the user must
select the worksheet explicitly before processing; the system must never
choose one silently.

Blank trailing rows and columns must not count towards the data limits,
but the parser must still enforce safe processing limits on the raw
file.

These are the V1 defaults. A deployment may raise or lower them only
after load testing and CTO approval (Section 180.1), and a configured
value must never exceed the safe deployment limit.

**File validation**

Before parsing, the system must:

> • validate the file extension, the MIME type and the actual file
> signature
>
> • treat the browser-supplied MIME type as untrusted
>
> • reject a file whose extension and content do not match
>
> • reject macros, embedded executable content and unsafe external links
>
> • reject password-protected or encrypted files
>
> • reject a malformed or suspicious compressed spreadsheet archive

**Safe parsing**

> • Formulas must never be executed. The parser uses the cell's stored
> displayed or cached value only.
>
> • Where a required cell holds a formula with no safe cached value, the
> row raises a validation issue rather than being guessed.
>
> • A CSV value beginning with a formula-control character is treated as
> data, never as executable content.
>
> • The parser is configured with limits for rows, columns, cell size,
> archive entries and decompressed size.
>
> • Import parsing must never fetch an external URL or linked workbook
> content.

**Handling and storage**

Uploads are processed in **private temporary storage**, scanned for
malware before parsing, and are never placed in public storage.

**Retention and download access**

> • the temporary original upload is retained for a maximum of
> **24 hours**
>
> • import results are retained for **30 days**
>
> • downloadable error and issue reports are retained for **30 days**

When a retention period expires, the stored file or report is removed
while the permanent audit summary is retained (Section 136).

A result or report may be downloaded only by the user who started the
import, while still authorized, and by authorized Owner/Admin users
(Section 162). Every download performs a fresh permission check. Any
signed or temporary link must expire promptly and must never be public.
Cross-workspace access is forbidden.

**Audit**

Each import records: upload, validation start and result, import
confirmation, cancellation, completion or failure, report download, and
retention cleanup.

**120. Import Workflow**

The import flow should be:

Upload File → Map Columns → Validate → Review → Import → Results

The system should not import records immediately after file upload.

The user must be able to review how columns will be interpreted first.

**121. Step 1 — Upload File**

Example:

**Import Customers**

**\[ Upload CSV / Excel \]**

Once uploaded, show:

> • file name
>
> • number of detected rows
>
> • number of detected columns

Example:

**customers-september.xlsx**

**428 rows detected**

Actions:

**Continue**

**Replace File**

**Cancel**

If the file cannot be read, or it breaches a limit or validation rule in
Section 119.1, the upload is rejected with the specific reason — for
example an unsupported format, an encrypted file, a size or row limit,
or an extension that does not match the file's content:

> **Unable to read this file. Please upload a valid UTF-8 CSV or .xlsx
> file within the stated limits.**

Where an `.xlsx` file contains several worksheets, the user must select
the worksheet to import before continuing.

**122. Step 2 — Column Mapping**

The CRM should attempt to automatically match obvious column names.

Example uploaded file:

**Uploaded Column**

**CRM Field**

Customer Name

Customer Name

Mobile

Phone Number

Email ID

Email

Executive

Record Owner

Policy

—

Renewal

—

Each uploaded column should allow the user to select a CRM field.

Example:

Mobile → Phone Number

Renewal Date → \[Select CRM Field\]

Options should include:

> • relevant standard fields
>
> • configured custom fields
>
> • Do Not Import

A CRM field should not normally be mapped from multiple file columns
unless explicitly supported.

**123. Required Field Mapping**

The mapping screen must clearly indicate mandatory fields.

For Customer import:

> • Customer Name
>
> • at least one contact method: Phone Number or Email

For Lead import:

> • Lead Name
>
> • at least one contact method: Phone Number or Email

If a required field is not mapped, the user cannot continue.

Example:

> Customer Name has not been mapped.

**124. Record Owner Mapping**

Imported data may contain a staff/owner column.

Example:

Sales Executive → Record Owner

The CRM should attempt to match imported owner values to existing active
users.

Example:

Arun → Arun Mathew

If the value cannot be matched:

> **Record Owner "Joseph K" could not be matched to an active CRM
> user.**

The user should be able to choose:

> • map it to an existing user
>
> • leave those records Unassigned, where Section 162 permits it
>
> • use a default Record Owner

The import process must not automatically create new users from
spreadsheet values.

**Sales Teams and imported Leads**

> • An explicitly mapped, valid, active owner remains the Record Owner,
> subject to validation. It must not be silently overwritten by round
> robin.
>
> • An owner value that does not match an active user produces a
> validation issue.
>
> • A Sales Team value that does not match an active Sales Team in the
> workspace produces a validation issue.
>
> • Import must never create a Sales Team, a team membership or a Team
> Lead, and must never transfer a salesperson between teams.
>
> • Round robin applies only to imported Leads, never to imported
> Customers or other record types.
>
> • Where imported Leads are approved to use a Lead assignment rule, they
> are assigned fairly and in order through the same team-scoped
> assignment process as any other Lead (Section 163.8), never across all
> workspace salespeople.
>
> • An imported Lead that cannot be assigned is still imported, in
> **Assignment Required** (Section 163.9).

Whether imported Leads without a valid mapped Record Owner enter
team-scoped round robin is unresolved client decision 2 (Section
163.18). Until it is approved, such Leads must not be assigned
automatically.

**125. Lead Stage Mapping**

For Lead imports, an uploaded Stage column may be mapped to the CRM Lead
Stage field.

Imported values should be matched against currently active pipeline
stages.

Example:

New → New

Interested → Interested

Follow Up → No matching stage

For unmatched values, allow the user to map them to an existing active
stage.

The import process should not create new pipeline stages automatically.

If no Stage column is supplied, imported Leads use the first active
pipeline stage.

**126. Product / Service Mapping**

If an imported Lead contains a Product/Service Interested In value, the
CRM should attempt to match it to an existing Product/Service
definition.

For Customer import, basic Customer information can be imported
independently of Customer Product/Service records.

V1 should **not attempt to interpret arbitrary product, policy, renewal
and service columns into complex Customer Product/Service records during
the basic Customer import unless the import specifically supports that
structure.**

This keeps the basic import predictable.

**127. Custom Field Mapping**

Configured custom Lead or Customer fields should appear in the mapping
options.

Example:

**Uploaded:**

**Vehicle Number**

**CRM:**

**Vehicle Number — Custom Field**

Field values should be validated according to the custom field type.

Examples:

> • Number must contain a valid numeric value
>
> • Date must contain a recognizable date
>
> • Dropdown must match an allowed option or be flagged for review

**128. Step 3 — Validation**

Before import, validate each row.

Possible validation issues include:

> • required field missing
>
> • invalid phone number
>
> • invalid email format
>
> • invalid date
>
> • unknown Record Owner
>
> • unknown pipeline stage
>
> • invalid custom field value
>
> • possible duplicate

Validation classifies each row independently as:

> **• Ready**
>
> **• Needs Attention**
>
> **• Possible Duplicate**
>
> **• Cannot Import**

Each row keeps a **stable row reference** so its decision, result and
any error can be reported without ambiguity, and without exposing data
from another workspace.

**Date interpretation**

For a column containing dates the system must:

> • detect unambiguous ISO-style values where it is safe to do so
>
> • require the user to select the expected date format where values are
> ambiguous, for example where both day-month-year and month-day-year are
> valid readings
>
> • show sample parsed results before the import is confirmed
>
> • reject impossible dates
>
> • treat renewal, expiry and equivalent values as **date-only** and
> never shift them through UTC conversion (Section 158)
>
> • record the selected interpretation in import history (Section 136)

The system must never guess between two valid date interpretations.

**129. Import Review Summary**

Before confirming the import, show a summary.

Example:

**428 rows found**

**390 Ready**

**18 Possible Duplicates**

**12 Need Attention**

**8 Cannot Import**

Actions:

**Review Issues**

**Import Valid Rows**

**Cancel**

The system should not force the user to fix every invalid row before
importing valid records.

**130. Duplicate Detection During Import**

Duplicate detection uses the same normalized matching rules as manual
creation (Section 130.1), applied both within the file and against
existing workspace records.

Check for matching:

> • normalized phone number
>
> • normalized email

Where a possible duplicate exists, classify the row as:

**Possible Duplicate**

The CRM must not silently overwrite or merge the existing record.

## 130.1 Duplicate Matching Rules

This subsection is authoritative for how duplicates are detected,
wherever a Lead or Customer is created. Sections 32, 47, 55, 85, 96, 128
and 131 refer to it. All matching is **workspace-scoped**: a record in
another workspace is never a candidate and must never be revealed.

**Phone normalization**

- The user-entered phone number is preserved for display and audit.
- A separate **normalized comparison value** is derived from it.
- Normalization targets **E.164** where the country context and the
  number allow it to be done reliably.
- The system must not invent a country code when it cannot be determined
  safely.
- A number that cannot be normalized reliably is flagged for review
  rather than silently rewritten.
- Comparison ignores harmless display formatting — spaces, hyphens and
  parentheses — where doing so is safe.
- A stored contact value must never change silently because the
  normalization logic changed later.

**Email normalization**

For comparison the system trims leading and trailing whitespace,
lowercases the whole address and validates its basic structure. The
user-entered value is preserved separately where it must be displayed.

Provider-specific transformations must **not** be applied. Dots are not
removed and a `+tag` portion is not stripped, because those are
provider-specific conventions and treating them as equivalent would
merge distinct addresses.

**Checkpoints**

Duplicate detection runs at four points:

1. during manual Lead or Customer creation (Sections 32 and 55)
2. within the current import file, across its own rows (Section 128)
3. against existing workspace records
4. again inside the final server-side create or import transaction

The fourth check is **mandatory** even when an earlier check passed,
because records can be created concurrently.

**Matching strength**

V1 classifies a candidate as:

- exact normalized **phone** match
- exact normalized **email** match
- **both** phone and email match
- **possible duplicate** on weaker supporting evidence, such as name
  together with product or service context

A name alone must never block creation. The system may show candidates
and the reason each matched, but must never merge records automatically
(Section 131).

**Override**

`Create Anyway` is restricted to Manager and Owner/Admin (Section 162).
Each override records the acting user, the timestamp, the candidate
records shown, the fields that matched, any explanation given and the
resulting new record.

**Shared phone numbers**

A genuinely shared number may be retained after authorized review — for
example a family or business number. However, where a number maps to
more than one permitted Lead or Customer:

- WhatsApp conversation identity must not be assigned automatically
- the conversation enters manual identity resolution (Section 96)
- resolving that identity is audited
- no message may expose a record belonging to another workspace

**Channel suppression follows the destination**

Because several records may share a destination, two separate kinds of
restriction are enforced against the **normalized phone number or email
address within the workspace** rather than against a single record:

- a **technical** block — an email address marked Undeliverable
  (Section 116.19)
- a **consent** restriction — WhatsApp opt-out, Email opt-out or
  complaint suppression, recorded at contact level with the normalized
  destination suppressed as well (Sections 108 and 116.8)

A new or edited record using the same destination inherits both and can
never be used to bypass either. Neither kind is lifted by resolving a
duplicate identity, editing or importing a record, or changing
capitalization, whitespace or other formatting. Each is lifted only
through its own authorized, audited route — the clearing workflow for a
technical block, and an explicit re-opt-in for consent (Section
116.19).

**Not a duplicate**

A later enquiry from an existing Customer is **not** duplication. It
creates a new Lead linked to that Customer and must not be blocked or
treated as an override (Sections 46.1 and 47).

**131. Duplicate Handling Options**

Before import, a user holding the Import / Export permission (Section
162) may choose how possible duplicates are handled.

V1 options:

**Skip Duplicates**

or

**Import as New Records**

for a Manager or Owner/Admin, matching the duplicate-override permission
in Section 162.

V1 must **not automatically merge or update existing CRM records during
a normal import**. Matching uses the rules in Section 130.1, applied
within the file and against existing workspace records.

Automatic update/merge significantly increases the risk of overwriting
good CRM data and is outside the simple V1 import flow.

The user can review existing records separately.

**132. Invalid Rows**

Rows that cannot be imported should not prevent valid rows from being
processed.

Example:

**420 records imported successfully**

**8 records could not be imported**

Actions:

**Download Error Report**

**View Errors**

The error report includes:

> • the original row number and stable row reference
>
> • relevant identifying information from that row only
>
> • the reason the row failed

Error reports are retained for 30 days and may be downloaded only by the
user who started the import, while still authorized, or by an authorized
Owner/Admin. Every download rechecks permission (Section 119.1).

Example:

**Row**

**Name**

**Error**

14

Ramesh Kumar

Phone and Email both missing

89

Priya Nair

Invalid date format

146

John Thomas

Unknown Record Owner

**133. Import Confirmation**

Before the actual import begins, show a confirmation.

Example:

**Import 390 Customers?**

This will create new Customer records in this workspace.

**18 possible duplicates will be skipped.**

**\[ Start Import \]**

**\[ Cancel \]**

Import is considered a major data action and requires confirmation.

**134. Import Processing**

After the import starts, the system should process the data without
requiring the user to keep the page open.

For small files, completion may happen quickly.

For larger imports, show:

**Import in progress**

**390 records are being processed.**

The user may continue using the CRM.

A notification should be created when the import completes or fails.

The system should not create duplicate records if the user refreshes or
accidentally revisits the import result while the same import job is
already processing.

**Row-level idempotency**

Each row is processed idempotently against its stable row reference. A
retry, refresh or repeated background execution must never create a
second record for a row that already completed successfully, and the
duplicate and uniqueness checks are repeated inside the final
transaction (Section 130.1).

A retry processes only the rows that did not already complete
successfully. Importing the same file again as a **new** import is an
explicit user action and is treated as a new job.

**Import job lifecycle**

An import job holds exactly one of these states:

> • **Queued** — accepted and waiting to start
>
> • **Processing** — rows are being imported
>
> • **Completed** — the run finished, whether or not every row succeeded
>
> • **Failed** — the run could not complete
>
> • **Cancelled** — a permitted user stopped it, or it was stopped
> before starting (Section 172.1)

A retry creates, or records, a distinct attempt. A row already imported
successfully must never be imported again by that retry, and row-level
results are preserved across attempts. Detailed import limits and file
safety rules are defined separately (Sections 119 and 121).

Where imported Leads are assigned by a Lead assignment rule, background
processing uses the same atomic, team-scoped assignment process as
interactive Lead creation (Section 163.8). Retrying or resuming an
import job must not assign a Lead twice or duplicate its assignment
history.

**135. Import Result**

On completion:

**Import Complete**

Example:

**390 Imported**

**18 Skipped as Duplicates**

**12 Failed**

Where Leads were imported with assignment, the result also reports how
the imported Leads were assigned:

**352 Assigned**

**38 Assignment Required**

Assigned, Assignment Required, skipped and failed counts must be
accurate. A Lead that could not be assigned is still counted as
imported, and each such Lead records its canonical failure reason
(Section 163.9). Imported Leads waiting in Assignment Required are
resolved through the same explicit actions as any other waiting Lead;
completing an import assigns none of them automatically.

Actions:

**View Imported Records**

**Download Error Report**

**Done**

The result should remain available long enough for the user to review
the outcome.

**136. Import History**

Authorized users should be able to view recent imports under:

Settings → Data Import / Export

Example:

**Import**

**Type**

**User**

**Date**

**Result**

customers-september.xlsx

Customers

Admin

03 Sep

390 Imported

august-leads.csv

Leads

Arun

29 Aug

118 Imported

Selecting an entry shows the import summary, including the worksheet
chosen, the date interpretation used and the row-level outcome counts.

Import results and reports are retained for 30 days; afterwards the
stored file is removed and the permanent audit summary is retained
(Section 119.1).

V1 does not require detailed audit analytics for every imported cell.

**137. Export**

Users holding the Import / Export permission (Section 162) may export
the Lead or Customer data they may access (Section 162.1), subject to
the safety rules in Section 139.

Export may be available from:

> • Leads
>
> • Customers
>
> • Settings → Data Import / Export

Actions:

**Export**

The export should respect:

> • current user permissions
>
> • active filters where applicable

For example, if the Customers list is filtered to:

**Record Owner = Arun**

the user may export those filtered results.

**138. Export Fields**

V1 exports should include relevant standard fields and permitted
configured custom fields.

Customer example:

> • Customer Name
>
> • Phone
>
> • Email
>
> • Record Owner
>
> • Created Date
>
> • custom Customer fields

Lead example:

> • Lead Name
>
> • Phone
>
> • Email
>
> • Product / Service Interested In
>
> • Stage
>
> • Record Owner
>
> • Lead Source
>
> • Created Date
>
> • custom Lead fields

Customer Product/Service data should not be flattened into the basic
Customer export in an ambiguous way.

If Product/Service export is required, it should be treated as a
separate dataset.

**139. Export Format**

**V1 export format: CSV**

The exported file uses clear column headings corresponding to CRM field
names.

**Formula-injection protection**

Where a text value begins with a character a spreadsheet application may
interpret as a formula — `=`, `+`, `-`, `@`, a tab or a carriage return —
the export must neutralize it safely for the export format, for example
by quoting and prefixing the field so the value is read as text.

The stored CRM value must never be altered to make an export safe. The
protection applies when the file is generated, and the original value
remains intact in the application.

**Generation and delivery**

Every export must:

> • remain workspace-scoped
>
> • recheck the user's permission both when the file is generated and
> when it is downloaded (Sections 162 and 162.1)
>
> • be generated into private storage, never a public location
>
> • use an expiring download link
>
> • exclude any field the user cannot view in the application
>
> • record the acting user, the scope, the filters applied, the row
> count, the generation time and the download event

**Export job lifecycle**

An export job holds exactly one of these states: **Requested**,
**Generating**, **Available**, **Expired** or **Failed**. An expired or
failed export is never silently regenerated; the user requests a new
export, which is audited in the same way. Expiry removes the generated
file while the audit record is retained.

**140. Export Confirmation / Sensitive Data**

Normal exports do not need repeated confirmation dialogs unless they
contain a large volume of sensitive or restricted data.

However:

> • only the roles granted Import / Export in Section 162 may export
>
> • users may export only the records and fields they may access under
> Section 162.1
>
> • generation, delivery and formula-injection protection follow Section
> 139

**141. Import / Export Permission Behaviour**

The authoritative permission matrix is Section 162, and record access
follows Section 162.1. In summary:

**Owner/Admin**

> • import Leads
>
> • import Customers
>
> • export permitted/all CRM data

**Manager**

> • import and export only where the workspace has enabled the
> Configurable permission, and only within the Manager's record scope

**Staff/Sales**

> • no import or export access. Section 162 is authoritative: this is a
> denial, not a default that a workspace may relax

Import and export controls are hidden where the user does not hold the
permission, and every import, export and report download rechecks it on
the server (Sections 119.1 and 139).

**142. Import — Mobile Behaviour**

Large data imports are primarily a desktop/web administrative workflow.

V1 does not need to reproduce the full spreadsheet mapping experience on
mobile.

On mobile, authorized users may see:

**Data Import is available on the web application.**

Export may also remain web-first.

This is consistent with the product principle that mobile focuses on
operational CRM work rather than administration.

**143. Import Flow Summary**

**Upload CSV / Excel**

↓

**Read Columns**

↓

**Map to CRM Fields**

↓

**Validate Rows**

↓

**Check Duplicates**

↓

**Review Summary**

↓

**Confirm Import**

↓

**Process Import**

↓

**Results**

**│**

**├── Imported**

**├── Duplicate / Skipped**

**└── Failed**

↓

**Error Report**

The important V1 rule is:

**Import should help customers bring existing data into the CRM safely
without silently overwriting existing records or requiring developer
assistance.**

**144. Reports**

The Reports module provides Owner/Admin, and Managers holding the View
Reports permission (Section 162), with a simple view of CRM performance
and pending business activity.

V1 reporting focuses on:

> • Leads
>
> • Follow-ups
>
> • Renewals
>
> • Customers
>
> • basic staff activity

V1 does not include:

> • custom report builders
>
> • advanced forecasting
>
> • financial/accounting reports
>
> • configurable dashboards
>
> • complex business intelligence
>
> • cross-workspace reporting

**145. Reports — Main Screen**

Navigation:

Sidebar → Reports

The Reports screen should contain:

**Date Range**

> • Today
>
> • This Week
>
> • This Month
>
> • Custom Date Range

Where applicable:

**Record Owner / User Filter**

Owner/Admin can view permitted workspace-wide data.

Managers see data according to their permissions.

Staff do not have access to management reports by default.

The detailed access rules will be defined under Settings → Roles &
Permissions.

**146. Lead Report**

The Lead Report provides a summary of Lead activity and outcomes for the
selected period.

Show:

> • Leads Created
>
> • Leads Won
>
> • Leads Lost
>
> • Open Leads

Breakdowns:

**Leads by Stage**

Example:

**Stage**

**Leads**

New

42

Contacted

28

Interested

17

Proposal Sent

9

**Leads by Source**

Where Lead Source is available:

**Source**

**Leads**

Website

24

Referral

18

Walk-in

12

Other

8

**Lead Outcomes**

Show:

> • Won
>
> • Lost
>
> • Still Open

Selecting a stage, source or outcome should open the Leads list with the
corresponding filter applied where practical.

**147. Follow-up Report**

The Follow-up Report helps management understand whether customer and
Lead follow-ups are being completed on time.

Show:

> • Follow-ups Created
>
> • Completed
>
> • Pending
>
> • Overdue

Breakdown by user:

**User**

**Completed**

**Pending**

**Overdue**

Arun

32

8

2

Sneha

27

5

4

The report should include both Lead and Customer Follow-ups.

Where useful, selecting a count should open the corresponding filtered
Follow-ups list.

**148. Renewal Report**

The Renewal Report provides visibility into recurring and renewal
business.

Show:

> • Renewals Due
>
> • Renewed / Completed
>
> • Overdue
>
> • Not Renewing

The selected date range applies primarily to the relevant **Due/Renewal
Date**.

Breakdown by Product/Service:

**Product / Service**

**Due**

**Renewed / Completed**

**Overdue**

**Not Renewing**

Health Insurance

28

20

5

3

Motor Insurance

17

13

3

1

Where useful, selecting a count should open the Renewals list with the
corresponding filter applied.

**149. Customer Report**

The Customer Report provides a simple overview of the customer base.

Show:

> • Total Customers
>
> • New Customers
>
> • Customers with Upcoming Due Dates
>
> • Customers with Overdue Items

**Total Customers** represents the current active Customer count.

**New Customers** represents Customers created during the selected date
range.

Upcoming and overdue counts are based on active Customer Product/Service
records and their Due/Renewal/Expiry Dates.

This report is intended as a high-level customer overview rather than
detailed customer analytics.

**150. Staff Activity Report**

Authorized management users should be able to review basic CRM activity
by staff members.

Example:

**User**

**Leads Owned**

**Follow-ups Completed**

**Follow-ups Overdue**

**Renewals Completed**

Arun

38

32

2

14

Sneha

31

27

4

11

The purpose is operational visibility, not employee productivity
scoring.

Definitions:

> **• Leads Owned** = active Leads where the user is the current Record
> Owner
>
> **• Follow-ups Completed** = Follow-ups assigned to and completed by
> the user during the selected period
>
> **• Follow-ups Overdue** = incomplete Follow-ups currently overdue and
> assigned to the user
>
> **• Renewals Completed** = Renewal actions completed by the user
> during the selected period

This distinction is important because **Record Owner** and **Assigned
To** are different concepts.

Where the permissions in Section 162 allow it, this report may be
filtered by **Sales Team** and **Team Lead**. Filtering by team groups
users by their current team; it does not change which records are
counted against each user, and it grants no access to another user's
records (Section 162.1).

**151. Report Filters**

Reports should support only the filters relevant to that report.

Common filters may include:

> • Date Range
>
> • Record Owner / User
>
> • Product/Service
>
> • Lead Stage
>
> • Lead Source
>
> • Sales Team — where Section 162 permits it
>
> • Team Lead — where Section 162 permits it
>
> • Lead assignment method — Manual or Round Robin
>
> • Lead assignment rule
>
> • Lead assignment outcome — Assigned or Assignment Required

Staff/Sales report restrictions in Section 162 are unchanged. Being a
Team Lead does not grant access to Reports.

Do not show every filter on every report.

For example:

**Renewal Report**

> Date Range  
> Product/Service  
> Assigned To

**Lead Report**

> Date Range  
> Record Owner  
> Stage  
> Source

Changing filters refreshes the report.

A **Clear Filters** action restores the default report view.

**152. Report Drill-down**

Where a report metric corresponds directly to CRM records, selecting the
metric should open the appropriate filtered list.

For example:

**5 Overdue Renewals**

opens:

Renewals → Overdue

Similarly:

**12 Leads — Interested**

opens the Leads list filtered to:

**Stage = Interested**

This allows reports to act as an entry point into actual CRM work rather
than displaying numbers with no action behind them.

**153. Report Export**

Authorized users may export report data.

Action:

**Export**

V1 report export format is CSV.

The export must respect:

> • selected report
>
> • active filters
>
> • selected date range
>
> • user permissions (Sections 162 and 162.1)

Report exports use the same generation, delivery and formula-injection
rules as record exports (Section 139).

The exported data should contain the underlying report data relevant to
the selected report rather than a screenshot of the report UI.

**154. Empty, Loading and Error States**

**Empty State**

If no data exists for the selected filters:

> **No report data available  
> ** There is no data matching the selected period and filters.

**Loading State**

Use loading placeholders while report data is being retrieved.

**Error State**

> **Unable to load report  
> **Please try again.

**\[ Retry \]**

Existing filters should remain selected after a temporary loading error.

**155. Reports — Mobile Behaviour**

Reports are primarily a web/management feature, but users with the View
Reports permission (Section 162) may access a simplified report view on
mobile.

On mobile:

> • summary metrics appear as stacked cards
>
> • filters open in a compact filter panel
>
> • tables may be shown as stacked rows/cards
>
> • detailed analysis and report export remain web-first

Mobile reporting should prioritize quick management visibility rather
than reproducing the full desktop reporting layout.

**156. Reports Flow Summary**

**Reports**

↓

**Select Report**

**│**

**├── Leads**

**├── Follow-ups**

**├── Renewals**

**├── Customers**

**└── Staff Activity**

↓

**Select Date Range / Filters**

↓

**View Summary + Breakdown**

↓

**Select Metric**

↓

**Open Relevant Filtered CRM Records**

**157. Settings & Administration**

Settings & Administration allows users holding the Configure CRM
Settings permission (Section 162) to configure the CRM for their
workspace.

Navigation:

Sidebar → Settings

Settings should include:

> • Business Settings
>
> • Users
>
> • Roles & Permissions
>
> • Sales Teams
>
> • Lead Assignment
>
> • Lead Source
>
> • Pipeline
>
> • Products & Services
>
> • Custom Fields
>
> • Reminder Settings
>
> • WhatsApp Settings
>
> • Email Settings
>
> • Email Templates
>
> • Modules & Features
>
> • Data Import / Export

Settings are primarily a web/desktop administrative experience.

**Settings → Sales Teams** is an administrative surface for Owner/Admin
and any user separately authorized for Sales Team administration. A Team
Lead manages their own team's Lead-assignment eligibility from **My
Team** (Section 163.6) and does not need access to Settings to do so.

**158. Business Settings**

Navigation:

Settings → Business Settings

Owner/Admin can manage:

> • Business Name
>
> • Business Type / Industry
>
> • Business Phone
>
> • Business Email
>
> • Address
>
> • Time Zone
>
> • Country
>
> • Currency

The workspace Time Zone is used for scheduled activities such as
Follow-ups and automated reminders. It is stored as an **IANA time-zone
identifier**, for example `Asia/Kolkata`. The server validates the
identifier and rejects an unknown value. A fixed offset is not
sufficient, because offsets change across daylight-saving transitions.

**Date-only values**

The following are stored as calendar dates, with no time and no UTC
conversion:

> • Renewal due date
>
> • policy expiry date
>
> • service expiry date
>
> • any equivalent date-only business value

A date-only value must never shift because of the viewer's device zone
or because the workspace time zone changed.

**Timed values**

A timed Follow-up, and every scheduled reminder instance, stores:

> • the resolved **UTC instant**
>
> • the **IANA workspace time-zone identifier** used when it was
> scheduled
>
> • the entered local date and time, or enough audit information to
> reconstruct it

The browser's time zone must never silently replace the workspace time
zone. Where a user's device is in a different zone, the interface may
show that difference, but scheduling uses the workspace zone.

**Display**

Operational screens show timed work in the **current** workspace time
zone. History retains the original scheduling zone and offset so a past
action can still be read as it was entered.

**Daylight-saving transitions**

Where the chosen local time **does not exist** because the clock moves
forward, the system must reject it, explain that it does not exist in
the selected time zone, and require another time.

Where the chosen local time **occurs twice** because the clock moves
back, the system must require explicit confirmation of which occurrence
or offset is intended, display the resolved abbreviation or offset
before saving, and store the resulting UTC instant.

The system must never silently guess a nonexistent or ambiguous local
time.

**Changing the workspace time zone**

An Owner/Admin may change the workspace time zone (Section 162). The
confirmation must explain that:

> • date-only values do not change
>
> • the UTC instant of every existing Follow-up is unchanged
>
> • the UTC instant of every scheduled reminder is unchanged
>
> • existing timed items may therefore display at a different local
> wall-clock time
>
> • new timed work will use the new workspace time zone

Changing the time zone must not silently reschedule existing work. The
change is audited with the old zone, the new zone, the acting user and
the timestamp.

Action:

**Save Changes**

**159. Users**

Navigation:

Settings → Users

Show:

> • User Name
>
> • Email
>
> • Role
>
> • Sales Team
>
> • Status
>
> • Actions

Roles:

> • Owner/Admin
>
> • Manager
>
> • Staff/Sales

Statuses:

> • Active
>
> • Inactive

Actions:

> • Add User
>
> • Edit User
>
> • Change Role
>
> • Deactivate
>
> • Reactivate

Users with CRM history should be deactivated rather than permanently
deleted.

At least one active Owner/Admin must remain in the workspace.

**Team Lead** is not a role and does not appear in the Roles list. A
user's Sales Team and any Team Lead responsibility are shown alongside
their role and are managed through Sales Team settings (Section
163.12).

**160. User Deactivation**

Before deactivating a user, check whether they currently own or are
assigned active work.

This includes:

> • Leads
>
> • Customers
>
> • incomplete Follow-ups
>
> • Renewal actions
>
> • open WhatsApp conversations

If active responsibilities exist, they must be reassigned to an active
user before deactivation is completed. Deactivating a
user immediately makes them ineligible for new automatic Leads and ends
their active Sales Team membership, which is retained as history. If
the user is a Team Lead, a replacement Team Lead must be designated, or
the team explicitly deactivated, before deactivation is completed
(Section 163.3). The last active Owner/Admin cannot be deactivated.

Historical activity should continue to show the original user's name.

Reactivating the user does not automatically restore previously
reassigned work, previous Sales Team membership, Team Lead
responsibility or Lead-assignment eligibility. A user who rejoins a team
receives a new membership period (Section 163.2).

**161. Roles & Permissions**

Navigation:

Settings → Roles & Permissions

V1 uses three predefined roles:

**Owner/Admin**

Full workspace and administration access.

**Manager**

Operational management access to permitted records and reports.

**Staff/Sales**

Operational access primarily to owned or assigned records.

V1 does not include custom role creation or field-level permission
configuration.

**Team Lead** is a responsibility within a Sales Team, not a fourth role
(Section 163.3). A user of any of the three roles may hold it, and
holding it changes neither their role nor their record access (Section
162.1). The capabilities it confers apply only to the team they lead and
are listed in Section 163.6.

**162. Permission Matrix**

**Permission**

**Owner/Admin**

**Manager**

**Staff/Sales**

View all Leads/Customers

Yes

Configurable

No

Add Leads/Customers

Yes

Yes

Configurable

Edit permitted records

Yes

Yes

Yes

Change Record Owner

Yes

Configurable

No

Reassign Follow-ups / Renewals

Yes

Configurable

No

Send individual WhatsApp messages

Yes

Yes

Yes

Assign WhatsApp conversations

Yes

Configurable

No

Send bulk WhatsApp messages

Yes

Configurable

No

Import / Export

Yes

Configurable

No

View Reports

Yes

Yes

No

Manage Users

Yes

No

No

Configure CRM Settings

Yes

No

No

Send individual Emails

Yes

Yes

Yes

Send manual Email reminders

Yes 

Yes

Configurable

Send controlled bulk Email reminders

Yes

Configurable

No

Manage Email templates

Yes 

No 

No

Configure Email sender

Yes

No

No

View own Sales Team and Team Lead

Yes

Yes

Yes

View other Sales Teams

Yes

Decision required (163.18 #5)

No

Create, edit or deactivate Sales Teams

Yes

Decision required (163.18 #5)

No

Add, remove or transfer team members

Yes

Decision required (163.18 #5)

No

Designate or replace a Team Lead

Yes

Decision required (163.18 #5)

No

Access Settings → Sales Teams

Yes

Decision required (163.18 #5)

No

View Lead-assignment eligibility

Yes

Team Lead of that team; otherwise Decision required (163.18 #5)

Team Lead of that team only

View own team's minimum roster (My Team)

Yes

Team Lead of that team; otherwise Decision required (163.18 #5)

Team Lead of that team only

Receive Leads from own team's rotation while eligible

Team Lead of that team; otherwise as permitted

Team Lead of that team; otherwise as permitted

Yes

Change own Lead-assignment eligibility

Yes

Team Lead only; otherwise No

Team Lead only; otherwise No

Change own-team members' Lead-assignment eligibility

Yes

Team Lead of that team only

Team Lead of that team only

Override Lead-assignment eligibility (audited)

Yes

No

No

Configure Lead assignment rules

Yes

Decision required (163.18 #5)

No

View own team's current eligible pool and empty-pool warning (My Team)

Yes

Team Lead of that team; otherwise Decision required (163.18 #5)

Team Lead of that team only

Preview detailed rotation state — stored order, next recipient and
batch progress

Yes

Decision required (163.18 #5)

No; Team Lead: Decision required (163.18 #3)

View own team's Assignment Required warning and its operational detail

Yes

Team Lead of that team; otherwise Decision required (163.18 #5)

Team Lead of that team only

View assignment failures for any team

Yes

Decision required (163.18 #5)

No

Manually assign Leads within a team

Yes

Configurable

No; Team Lead: Decision required (163.18 #4)

Manually assign Leads across teams

Yes

Decision required (163.18 #5)

No

View assignment audit history

Yes

Decision required (163.18 #5)

No; Team Lead: Decision required (163.18 #3)

View own team's workload

Yes

Decision required (163.18 #5)

No; Team Lead: Decision required (163.18 #3)

View other teams' workload

Yes

Decision required (163.18 #5)

No

Create a Follow-up on an accessible record

Yes

Yes

Yes

Complete or reschedule a Follow-up assigned to them

Yes

Yes

Yes

Schedule the next Follow-up when completing one

Yes

Yes

Yes

Complete a Renewal, mark Not Renewing or set the next due date

Yes

Yes

Yes, when assigned to them

Send an individual renewal reminder

Yes

Yes

Yes, when assigned to them

Retry a failed reminder they sent

Yes

Yes

Yes

Change workspace reminder defaults or schedules

Yes

No

No

View an assigned WhatsApp conversation on a permitted record

Yes

Configurable

Yes, when assigned

Close or reopen a WhatsApp conversation

Yes

Yes

Yes, when assigned

Add a conversation note or create a Follow-up from a conversation

Yes

Yes

Yes, when assigned

Mark a contact WhatsApp Opted Out

Yes

Yes

Yes

Remove a WhatsApp opt-out (audited)

Yes

Yes

No

Manage WhatsApp templates

Yes

No

No

Mark a record Email Opted Out

Yes

Yes

Yes

Remove an Email opt-out (audited)

Yes

Yes

No

Convert an accessible Lead they own

Yes

Yes

Yes

Link a Lead to an existing accessible Customer

Yes

Yes

Yes, when they can access both records

Archive or restore a Lead

Yes

Configurable

No

Archive or restore a Customer

Yes

Configurable

No

Upload, view or download a Customer document

Yes

Yes

Yes, for permitted Customers

Archive or restore a Customer document

Yes

Yes

No

Create Anyway after a duplicate warning

Yes

Yes

No

Grant or revoke an explicit record share

Yes

Configurable, within record scope

No

Manually resolve a Lead in Assignment Required

Yes

Configurable, within record and team scope

No; Team Lead: Decision required (163.18 #4)

Retry automatic assignment for a waiting Lead

Yes

Configurable, within record and team scope

No; Team Lead: Decision required (163.18 #4)

Bulk reprocess Leads in Assignment Required

Yes

Configurable, within record and team scope

No; Team Lead: Decision required (163.18 #4)

Clear an Undeliverable Email address

Yes

Configurable, only when every record using that address is within
permitted scope

No

Resolve an ambiguous WhatsApp conversation identity

Yes

Configurable, only when all candidates are within permitted scope

No

Manager record visibility can be configured as:

> **• All Records**
>
> **• Own, Assigned and Explicitly Shared Records**

Record visibility itself — who may see which Lead or Customer, and how
access is granted — is defined in Section 162.1. The rows above define
what a user may **do** with a record they can already access.

In the Sales Team rows above:

> • **Team Lead of that team only** means the permission is available to
> a user in that column only while they hold the Team Lead
> responsibility for the team concerned. It is not granted to the role
> in general.
>
> • **Decision required** means the permission is not yet approved. It
> must never be assumed, and it is denied until approved — see **Least
> privilege** below (Section 163.18).
>
> • The Manager role by itself grants no Sales Team authority at all.
> Read a Sales Team row as:
>
> > **Manager role alone:** Decision required under Section 163.18.
> >
> > **Active Team Lead of that team:** permitted, but only for the
> > confirmed Team Lead capabilities in Section 163.6.
>
> • A Manager who is the active Team Lead of a team therefore keeps every
> confirmed Team Lead capability for that team — the minimum roster, the
> current eligible pool and empty-pool warning, the own-team Assignment
> Required warning, and the eligibility controls including their own.
> Those come from the responsibility, not the role, and never extend to
> another team (Sections 2, 161 and 163.5).
>
> • A Team Lead uses **My Team** (Section 163.6) for their team's
> eligibility controls. Access to Settings → Sales Teams does not extend
> anyone's eligibility authority beyond a team they lead; eligibility
> changes made there are Owner/Admin overrides.
>
> • **Otherwise as permitted** means the user receives Leads only if their
> role is explicitly permitted to (Section 163.8).
>
> • Where a row says **accessible**, **permitted** or **assigned to
> them**, the record-access rules in Section 162.1 apply first. A user
> may act only on a record they can already access.
>
> • **Configurable** means the workspace may enable the capability for
> that role. Until it is enabled, the capability is denied.

**Least privilege**

A capability marked **Decision required**, or otherwise awaiting client
confirmation, is **denied in production** until the decision is approved
and the permission is explicitly configured for the workspace. An
unapproved capability must never be enabled by default, inferred from a
role, granted by Sales Team membership or Team Lead responsibility, or
assumed because a user can reach the screen that offers it.

Every **Decision required** value corresponds to decision 3, 4 or 5 in
Section 163.18. Decisions 1 and 2 are workflow questions and never
appear as a permission cell.

> • **Decision 5** — Manager column only: authority the Manager role
> itself would confer, including Sales Team administration, rule
> configuration, cross-team assignment and cross-team visibility. Where
> the cell reads *Team Lead of that team; otherwise Decision required*,
> the capability is already confirmed for a Manager who is that team's
> Team Lead; only the role-based case is open.
>
> • **Decision 4** — Staff/Sales column: whether a Team Lead may manually
> assign, resolve, retry or bulk reprocess Leads for their own team.
>
> • **Decision 3** — Staff/Sales column: whether a Team Lead may see more
> than the confirmed My Team set, such as detailed rotation state, team
> workload or the full assignment audit history.

A confirmed My Team capability (Section 163.6) is never recorded as
Decision required. Where a row grants *Team Lead of that team only*, the
capability applies to whoever currently holds the responsibility,
whatever their workspace role.

Sales Teams, used to scope Lead assignment, are the only team structure
in V1 (Section 163). Team membership does not grant record access;
record visibility follows Section 162.1.

## 162.1 Record Access and Explicit Sharing

This subsection is **authoritative for record visibility**. Where any
other section says a user may act on a record they are "permitted" or
"authorized" to access, the access itself is decided here.

**Owner/Admin**

May access all CRM records in their workspace.

**Manager**

The workspace configures the Manager record scope as either:

- **All Records**, or
- **Own, Assigned and Explicitly Shared Records**

This record-access setting is separate from unresolved client decision 5
in Section 163.18, which concerns Sales Team administration rather than
record visibility.

**Staff/Sales**

May access:

- Leads and Customers they own
- operational items assigned to them, where the related-record
  permission has been validated
- Leads and Customers explicitly shared with them

**Team and conversation boundaries**

- Sales Team membership alone grants **no** access to another member's
  Leads, Customers, Follow-ups, Renewal actions, documents or WhatsApp
  conversations.
- Being a Team Lead grants only the minimum My Team roster in Section
  163.6. Wider visibility requires client decision 3 (Section 163.18)
  and is denied until approved.
- WhatsApp conversation assignment grants **no** access to the related
  Lead or Customer. A user who is assigned a conversation but cannot
  access the record sees the conversation only, without the record's
  data.
- Operational assignment must never be used as a hidden record-sharing
  mechanism.

**Validating an operational assignment**

Before a Follow-up, Renewal action, WhatsApp conversation or other
operational item is assigned to a user, the server must verify that the
assignee can access the related Lead or Customer.

If that access is missing, the operation must either:

- be rejected with an explanation, or
- require an authorized explicit share to be granted first

**Explicit record share**

An explicit share is a deliberate, recorded grant of access to one Lead
or Customer. Conceptually it holds:

- workspace
- the Lead or Customer
- permitted user
- granted by
- granted at
- revoked by
- revoked at
- reason for the share — optional

These are required information, not a database design.

**Who may share**

- **Owner/Admin** may grant or revoke an explicit record share.
- **Manager** may do so only where the workspace grants that permission,
  and only for records within the Manager's scope.
- **Staff/Sales** users, and ordinary Record Owners, must **not** be
  able to grant or revoke access merely because they own the record.

**Effects**

- Revocation blocks future access. It preserves historical audit entries
  and the activities legitimately created while the share was valid
  (Section 163.15).
- An explicit share does **not** change the Record Owner.
- An explicit share does **not** add the user to a Sales Team.
- An explicit share does **not** assign a WhatsApp conversation, a
  Follow-up or a Renewal action.
- Every grant and revocation is audited (Section 163.13).

Record access is enforced on the server for every read and every write.
Hiding a control in the interface is never sufficient (Section 177).

**163. Lead Assignment**

Navigation:

Settings → Lead Assignment

Controls how new Leads receive a Record Owner.

Lead assignment applies to **Leads only**. It never assigns or
reassigns Customers, Follow-ups, Renewal actions, WhatsApp
conversations, activities, notes, documents or existing records. See
Section 163.11.

Supported V1 methods:

**Manual**

A user holding the manual assignment permission selects the Record
Owner (Sections 162 and 163.10).

**Round Robin**

New Leads are assigned in a repeating sequence to the eligible members
of **one Sales Team**. Round robin is always team-scoped: it never
rotates across every salesperson in the workspace, and it never falls
back to members of another Sales Team.

V1 uses **strict round robin only**. Automatic assignment applies only to
Leads, and the rotation order does not vary according to how much work a
member already holds. V1 must not implement:

- workload-based routing
- capacity-based routing
- weighted routing
- performance-based routing
- AI-based or predictive routing

These methods are outside V1 (Section 180) and require separate approval
before they may be considered.

Round robin is configured through **Lead assignment rules**. Every Lead
assignment rule targets exactly one Sales Team. See Sections 163.1 to
163.9.

Owner/Admin can configure a **Batch Size** on each Lead assignment
rule. Batch Size defines how many consecutive Leads are assigned to one
eligible team member before the rotation moves to the next eligible
member of the same team.

**Batch Size rules**

- Batch Size must be an integer from **1 to 100**. A value outside that
  range must be rejected, both in the interface and on the server.
- The V1 default Batch Size is **1**.
- A Batch Size of 1 produces normal one-by-one round robin.
- Changing Batch Size affects future assignments only. It does not
  rewrite existing Lead ownership or assignment history.
- If a member is paused during their current batch, that batch ends
  immediately (Section 163.5).

Example — Sales Team **Health Insurance Team**, members Arun, Sneha and
Joseph, **Batch Size = 10**:

Leads 1–10 → Arun

Leads 11–20 → Sneha

Leads 21–30 → Joseph

Leads 31–40 → Arun

If **Batch Size = 1**, Leads are assigned one at a time:

Lead 1 → Arun

Lead 2 → Sneha

Lead 3 → Joseph

Lead 4 → Arun

Configuration of each Lead assignment rule:

> • Target Sales Team
>
> • Batch Size

The rotation pool is derived from the target team's membership and each
member's Lead-assignment eligibility. It is not a separately maintained
list of workspace users. See Section 163.8.

Changes to team membership, eligibility, a rule or its Batch Size apply
only to future Lead assignments and do not alter existing Lead ownership
or assignment history. Inactive, paused or transferred members do not participate
in future assignments.

If no eligible member of the target team is available, the Lead is not
assigned elsewhere. It remains **Unassigned** in the explicit
**Assignment Required** state described in Section 163.9.

Unassigned Leads, including Leads in Assignment Required, are visible
to Owner/Admin and to Managers with appropriate visibility. A Team Lead
is alerted to Assignment Required Leads for their own team.

## 163.1 Sales Teams

A **Sales Team** is a named group of salespeople within one workspace.
In V1, Sales Teams exist to scope automatic Lead assignment and to give
authorized users a team view of that work.

**Sales Team fields**

- Team ID
- Workspace ID
- Team name
- Description — optional
- Status — Active or Inactive
- Active Team Lead
- Created by
- Created date
- Updated by
- Updated date

**Rules**

- A Sales Team belongs to exactly one workspace. Teams, memberships,
  rules and rotation state must never cross workspace boundaries.
- Team names must be unique within a workspace.
- A team is **deactivated**, not destructively deleted, once it has
  membership or assignment history.
- An inactive team cannot receive new automatic Lead assignments. A
  Lead assignment rule that targets an inactive team cannot assign
  Leads.
- Deactivating a team preserves its memberships, Team Lead history,
  Lead ownership and assignment history.
- Deactivating a team must not silently reassign any existing record.
- Every active Sales Team must have exactly one active Team Lead. See
  Section 163.3.
- A Sales Team may be Active with **zero eligible members**. The team,
  and every Lead assignment rule targeting it, must then show the
  assignment warning defined in Section 163.5, and new Leads routed to
  the team enter Assignment Required (Section 163.9).

**Team deactivation**

Deactivating a Sales Team must:

- stop all future automatic Lead assignment through that team
- deactivate every active Lead assignment rule that targets the team
  (Section 163.7)
- end every active membership of the team (Section 163.2)
- end the current Team Lead responsibility (Section 163.3)
- leave the team's rotation pool empty (Section 163.8)

Deactivating a team must not change any Lead's Record Owner, reassign
any existing record, or delete membership history, Team Lead history,
rule history, stored rotation state, Lead assignment history or the
failure history of Leads in Assignment Required. Leads already waiting
in Assignment Required remain waiting (Section 163.9).

**Team reactivation**

Reactivation is a guarded configuration operation, not a single toggle.
Reactivating a team must not automatically restore previous
memberships, the previous Team Lead, previous eligibility, previously
targeted Lead assignment rules, or any previous Lead ownership or
assignment.

The reactivation workflow is defined in Section 163.12. A team may
become Active only when it has exactly one active Team Lead and every
active member is an active workspace user. Reactivating a team must not
assign Leads already waiting in Assignment Required; those Leads are
resolved only as described in Section 163.9.

## 163.2 Sales Team Membership

Sales Team membership is separate from workspace membership. Being a
workspace user does not place someone in a team, and being in a team
does not change their workspace role.

**Membership fields**

- Membership ID
- Workspace membership / user
- Sales Team
- Membership status — Active or Ended
- Joined date
- Ended / transferred date
- Team Lead responsibility
- Eligible for Lead assignment
- Eligibility last changed by
- Eligibility last changed at
- Eligibility reason, where appropriate

**Rules**

- Only an active workspace member may hold an active Sales Team
  membership.
- **One active Sales Team membership per workspace membership.** A
  salesperson may belong to only one active Sales Team at a time within
  a workspace.
- A salesperson may have any number of ended, historical memberships
  from previous teams.
- The system must never silently create a second active membership. An
  attempt to add a user who already has an active membership must be
  refused, or handled as an explicit transfer (Section 163.4).
- Historical memberships must be retained.
- An ended membership is permanent history and must never be reopened. A
  user who rejoins a team receives a **new membership period** with a new
  joined date, and each earlier period remains visible as history.
- A deactivated workspace user is automatically ineligible for new
  Leads.
- Team membership does not grant access to records owned by other team
  members. Record access is governed only by Section 162.1, and being in
  a team is never a record-access path.

This integrity rule must be enforced by the system, not only by the
interface. It applies regardless of how the change is made, including
settings screens, imports and retries.

## 163.3 Team Lead

**Team Lead** is a responsibility within one Sales Team. It is **not** a
workspace role.

- Every active Sales Team has exactly one active Team Lead.
- The Team Lead must be an active member of that same team. Selecting a
  user who is not an active member of the team is invalid.
- A user keeps their workspace role while acting as Team Lead. A Staff /
  Sales user may be Team Lead and remains a Staff / Sales user. A Manager
  may also be Team Lead and remains a Manager. An Owner/Admin who is an
  active member of the team may also be Team Lead; the same team-scoped
  rules apply.
- An active Team Lead is explicitly permitted to receive Leads for their
  own team while eligible. Their Team Lead responsibility satisfies the
  receive-Leads permission for that team, regardless of whether their
  workspace role is Staff/Sales, Manager or Owner/Admin. It gives them no
  Leads from, and no authority over, any other team.
- Authority over a team's Lead-assignment eligibility comes from the
  Team Lead responsibility for that team, not from the user's role. A
  Manager who is not that team's Team Lead has no such authority.
- Becoming Team Lead does not grant Owner/Admin, Manager or any
  workspace-wide permission.
- A Team Lead manages only their own team's Lead-assignment eligibility,
  from My Team (Section 163.6). They cannot manage another team unless
  separately authorized, and any such authorization does not come from
  the Team Lead responsibility.
- Removing, transferring or deactivating the current Team Lead requires
  either a replacement Team Lead from the same team or explicit
  deactivation of the team. A team must not be left active without a
  Team Lead.
- Former Team Lead responsibility is retained in history and remains
  visible historically.
- Deactivating a Sales Team ends the current Team Lead responsibility
  (Section 163.1). Reactivation requires designating exactly one active
  Team Lead again (Section 163.12). A previous Team Lead is never
  restored automatically.

## 163.4 Team Transfer

Moving a salesperson to another Sales Team is an explicit **transfer**.

When a transfer is confirmed, the system must:

1. Verify that the destination team belongs to the same workspace.
2. Verify that the acting user is permitted to transfer members.
3. End the salesperson's existing active membership.
4. Create a **new membership period** in the destination team. An ended
   membership is never reopened (Section 163.2).
5. Record the transfer as a single atomic change, so the salesperson is
   never left with two active memberships or none because of a partial
   failure.
6. Preserve the former membership as history.
7. Stop future round-robin assignment to the salesperson from the
   former team.
8. Leave existing Leads with their current Record Owner. A transfer
   does not reassign Leads automatically.
9. Leave Customers, Follow-ups, Renewal actions and WhatsApp
   conversations unchanged.
10. Record an audit entry containing the former team, destination team,
    salesperson, acting user and timestamp.

If the salesperson is the Team Lead of the former team, the transfer
cannot complete until a replacement Team Lead is designated or the
former team is explicitly deactivated.

On joining the destination team, the salesperson's Lead-assignment
eligibility follows the default in Section 163.5.

## 163.5 Lead-Assignment Eligibility

Each active team member is either:

- **Eligible for Lead assignment** — included in the team's automatic
  Lead rotation, or
- **Paused from Lead assignment** — excluded from future automatic Lead
  assignment.

Do not use vague labels such as "Available" for this setting.

Eligibility controls only whether a member receives future
**automatic** Leads. It is separate from the member's workspace role,
team membership, Team Lead responsibility, Record Ownership, Follow-up
assignment, Renewal assignment and WhatsApp conversation assignment.

**Default**

- Every active team member is **Eligible for Lead assignment** by
  default.
- The Team Lead is **Eligible for Lead assignment** by default and
  participates in their own team's rotation like any other eligible
  member. An active Team Lead is explicitly permitted to receive Leads
  for their own team while eligible. Their Team Lead responsibility
  satisfies the receive-Leads permission for that team, regardless of
  whether their workspace role is Staff/Sales, Manager or Owner/Admin.
- The Team Lead may pause themselves, and an Owner/Admin may override
  their eligibility, exactly as for any other member.

**Who may change eligibility**

- The **Team Lead** may mark any member of their own active team —
  including themselves — as Eligible or Paused, from My Team (Section
  163.6). A Team Lead has no eligibility authority in any other team.
- An **Owner/Admin** may override the eligibility of any member of any
  team in the workspace, from Settings → Sales Teams (Section 163.12).
- An **ordinary team member** cannot change their own eligibility or
  anyone else's.
- A **Manager** does not receive the Owner/Admin override. A Manager may
  change eligibility only while acting as the Team Lead of that team,
  unless the Manager permission decision in Section 163.18 is later
  approved and configured (Section 162).
- Access to Settings → Sales Teams does not, by itself, grant any
  eligibility-changing authority. Authority comes only from the
  Owner/Admin role or the Team Lead responsibility for that team.

**Three distinct authorities**

- **Team Lead eligibility control** — confirmed. The active Team Lead
  changes eligibility within their own team only, including their own
  (Section 163.6). It is available whatever their workspace role.
- **Owner/Admin override** — confirmed. An Owner/Admin changes
  eligibility in any team in the workspace. A reason is required and the
  change is audited.
- **Manager administrative override by role** — not granted. A Manager
  receives no eligibility authority from the Manager role. A Manager who
  is that team's Team Lead uses the Team Lead control above. Whether the
  Manager role itself confers an administrative override is unresolved
  client decision 5 (Section 163.18) and is denied until approved.

**Owner/Admin override**

An Owner/Admin eligibility override **requires a short reason**. The
change must be rejected if no reason is supplied.

Each override records an audit entry containing:

- workspace
- Sales Team
- affected member
- previous eligibility
- new eligibility
- acting user
- reason
- timestamp

The audit entry is retained as history (Section 163.13) and is never
rewritten by a later change.

**Effect of pausing**

Pausing takes effect immediately for future automatic Lead assignments.

Pausing does not change:

- existing Lead ownership
- existing Customers
- existing Follow-ups
- existing Renewal actions
- existing WhatsApp conversations
- historical assignment activity

A paused Team Lead remains the Team Lead, remains an active team member
and remains the Record Owner of their existing records. Only their
future Lead eligibility changes.

A **Paused** member may still receive a **manual** Lead assignment
(Section 163.10). Pausing restricts automatic assignment only.

V1 has **no scheduled or automatic return from Paused**. A paused member
becomes eligible again only when the Team Lead, from My Team, or an
Owner/Admin, by override, explicitly marks them Eligible for Lead
assignment. The system must not restore eligibility on a date, after a
period of time, or because the team has no eligible members left.

If a member is paused part-way through a batch, that batch ends
immediately. The next automatic Lead goes to the next eligible member in
the rotation, who starts a new batch.

**Effect of making a member eligible again**

- The member becomes eligible immediately.
- They do not receive a backlog of Leads they would otherwise have
  received.
- They do not automatically receive the next Lead as compensation.
- The unfinished portion of any batch that ended when they were paused
  is not restored.
- They receive no backlog, compensation or special priority.
- The rotation proceeds normally from its stored state, and the
  returning member starts a new batch only when the rotation next reaches
  them.
- Making a member eligible again must not assign any Lead already
  waiting in Assignment Required. Those Leads are resolved only through
  the explicit actions in Section 163.9.

**Last eligible member**

If a change would leave the team with no eligible members:

- warn the Team Lead or Owner/Admin before the change is saved
- allow the change if it is operationally necessary
- mark the team and each Lead assignment rule targeting it with an
  **assignment warning**
- place new Leads routed to that team in **Assignment Required**
  (Section 163.9)

**Security**

Eligibility changes must be authorized on the server. The server
determines the acting user's authority from their authenticated session
and their current role and Team Lead responsibility. The team, member
or authority submitted by the browser must never be trusted on its own.

Every eligibility change is audited (Section 163.13).

## 163.6 My Team — Team Lead Controls

**My Team** is the team-scoped control surface for the current Team
Lead. It is separate from Settings → Sales Teams (Section 163.12): a Team
Lead does not need access to Settings to manage eligibility. These
controls come from the Team Lead responsibility, whatever the user's
workspace role, and apply to their own active team only — a Manager has
them only for a team they lead.

**Confirmed capabilities**

The following are **confirmed** for the active Team Lead of that team,
whatever their workspace role — Staff/Sales, Manager or Owner/Admin —
and only for the team they lead. They come from the Team Lead
responsibility, never from a workspace role.

**Minimum roster.** For their own active team, a Team Lead can always
see, for each member:

- member name
- active membership status
- current Lead-assignment eligibility
- whether the member is the Team Lead

**Current eligible pool.** Derived from that roster, the Team Lead can
see who is currently eligible for the team's rotation, and can see that
the team has **no eligible members** when the pool is empty.

**Operational Assignment Required detail.** For their own team, the Team
Lead receives the in-app assignment-failure notification and can see the
Lead reference, the canonical failure reason, the target team, the time
of failure and the Lead's current Assignment Required status (Section
163.9).

**Eligibility controls.** For their own team, the Team Lead may:

- mark a member **Eligible for Lead assignment**
- mark a member **Paused from Lead assignment**
- change their own eligibility

**Not included in the confirmed set**

The roster exists so the Team Lead can operate the eligibility controls.
It does not, by itself, give access to:

- other members' Leads or Customers
- other members' Follow-ups, Renewal actions or WhatsApp conversations
- team workload or workload per member
- performance reports
- the full assignment audit history
- the **detailed rotation state** — the stored rotation order, the next
  recipient, batch progress or per-assignment history detail
- any other team's roster
- Lead assignment rule configuration
- authority over any other team

What a Team Lead may see beyond the confirmed set is unresolved client
decision 3 (Section 163.18). Whether a Team Lead may manually reassign
or resolve a Lead is unresolved client decision 4. Both are denied until
approved and configured (Section 162).

My Team follows the desktop and mobile principle in Section 179. If a
Team Lead also has access to Settings → Sales Teams, that access does not
extend their eligibility authority beyond their own team.

Team Lead is a responsibility inside one Sales Team, never a fourth
workspace role (Sections 2, 161 and 163.3).

Being Team Lead does **not**, by itself, allow a user to:

- create workspace users
- change workspace roles
- add, remove or transfer team members
- designate or replace a Team Lead
- configure another team
- create or change Lead assignment rules or global assignment settings
- configure global integrations
- view global reports
- access every workspace record
- change the Record Owner of existing records without a separate
  permission

## 163.7 Lead Assignment Rules

A **Lead assignment rule** tells the system which Sales Team should
receive automatic Leads.

**Every Lead assignment rule defines**

- Workspace
- Rule name
- Lead trigger or routing condition
- Target Sales Team — exactly one
- Assignment method — Round Robin
- Batch Size — an integer from 1 to 100; default 1
- Status — Active or Inactive
- Rule priority — a unique integer
- Whether the rule is the workspace catch-all rule
- Created by, created date, updated by and updated date

**Rules**

- A Lead assignment rule targets exactly one Sales Team.
- The target team must belong to the same workspace and be active.
- Deactivating a rule stops future automatic assignment through it and
  preserves its audit history.
- A rule targeting an inactive team, or a team with no eligible members,
  displays an assignment warning.

The following must **not** be offered:

- All salespeople
- All Staff
- workspace-wide round robin
- Customer round robin
- Follow-up round robin
- Renewal round robin
- WhatsApp conversation round robin

**Resolving a rule**

A request for automatic assignment must resolve **exactly one active
matching Lead assignment rule**. If it cannot, the Lead is kept
Unassigned in Assignment Required with a canonical failure reason
(Section 163.9). The Lead must never be discarded.

**Priority and overlapping conditions**

Overlapping rule conditions are **permitted**. Several rules may
legitimately match the same Lead — for example a broad Product/Service
rule and a narrower rule for one source within it. Priority exists
precisely so that such an overlap resolves deterministically.

- Every rule must have an integer priority. A **lower number means
  higher priority**.
- Priority must be unique among rules that can match the same Lead. Two
  rules that can never match the same Lead may hold the same priority.
- Where several active rules match and one holds a unique highest
  priority, that rule is used. The overlap is valid and is not an error.
- Where the highest priority is tied, or resolution is otherwise
  ambiguous, the system must not choose arbitrarily. It records
  **Multiple Matching Rules** and places the Lead in Assignment Required
  (Section 163.9).
- Changing a priority affects future assignment attempts only. It never
  rewrites an existing Record Owner or assignment history.

**Overlap validation**

Overlap detection is a **validation aid, not a prohibition on
overlapping rules**. Configuration must:

- allow an overlap whose priority order is unique, because the result is
  deterministic
- block activation only where the overlap could produce an ambiguous
  result — most commonly two overlapping active rules sharing the same
  priority
- explain which rules conflict, and at which priority, so the
  administrator can correct the priority rather than remove the rule
- never reject the catch-all rule for overlapping more specific rules,
  because that overlap is intentional

Configuration validation should normally prevent an ambiguous priority
from being activated. The runtime must still fail safely, because
configuration can change while assignment is in progress and a workspace
may hold historical configuration that predates a validation rule.

**Catch-all rule**

A workspace may have at most **one active catch-all rule**. It must:

- hold the lowest priority in the workspace
- target exactly one Sales Team
- be considered only when no active specific rule matches

The catch-all is an **intentional overlap**: it is expected to cover
Leads that specific rules also cover, and it must never be rejected on
that basis. It is not a workspace-wide rotation pool — it targets one
Sales Team like any other rule, and the rotation still runs only among
that team's eligible members (Section 163.8).

A catch-all rule is optional. Without one, a Lead that matches no active
specific rule enters Assignment Required with **No Matching Rule** or
**Matching Rule Inactive**, as defined in the resolution order below.

**Resolution order**

This ordered sequence is the authoritative definition of how one rule is
selected. No other section repeats it; Sections 163.8 and 163.9 refer to
it.

1. Confirm that the routing fields the workspace's rules require are
   present on the Lead. If they are not, stop with **Missing Routing
   Data**.
2. Evaluate the specific assignment-rule conditions relevant to the
   Lead. The catch-all rule is not evaluated at this step.
3. Keep only the **active** specific rules whose conditions match.
4. If one or more active specific rules match:
   - sort them by priority, lowest number first
   - select the single rule holding the unique highest priority
   - if the highest priority is tied, or the result is otherwise
     ambiguous, stop with **Multiple Matching Rules**
5. If no active specific rule matches, select the active catch-all rule
   if the workspace has one.
6. If no rule can be selected:
   - stop with **Matching Rule Inactive** where applicable rule
     definitions exist but every one of them is inactive
   - otherwise stop with **No Matching Rule**
7. Having selected a rule:
   - if its target Sales Team is inactive, stop with **Target Team
     Inactive**
   - if the target team has no eligible member, stop with **No Eligible
     Team Member**
   - otherwise continue with the concurrency-safe team rotation in
     Section 163.8

**Edge cases**

- An inactive specific rule does not defeat an active catch-all. Step 3
  keeps only active rules, so an inactive specific rule simply drops out
  and step 5 may still use the catch-all.
- If at least one active specific rule matches, the catch-all is not
  considered at all, whatever its priority.
- If only inactive specific rules match and an active catch-all exists,
  the catch-all is used.
- If only inactive applicable rules exist and there is no active
  catch-all, the reason is **Matching Rule Inactive**.
- If no rule definition matches at all and there is no active catch-all,
  the reason is **No Matching Rule**.
- Every stop above leaves the Lead Unassigned in Assignment Required
  with that reason recorded. The Lead is never discarded, never assigned
  arbitrarily and never passed to another team.

**Rule deactivation**

Deactivating a Lead assignment rule must:

- stop all future automatic assignment through that rule
- preserve the rule, its configuration and its audit history
- preserve the stored rotation state and assignment history
- leave every existing Lead's Record Owner unchanged
- never activate another rule automatically
- never create a workspace-wide or cross-team fallback

Which Lead field, or combination of fields, selects the routing rule is
unresolved client decision 1 (Section 163.18).

## 163.8 Rotation Pool and Assignment Algorithm

**Rotation pool**

A user is in the rotation pool for a rule only when all of the following
are true:

- they are an active workspace member
- they hold an active membership of the rule's target team
- they are permitted to receive Leads for that team: either their
  workspace role is Staff / Sales or another role explicitly permitted to
  receive Leads, or they are the team's active Team Lead
- they are **Eligible for Lead assignment**
- they are not deactivated
- they have not been transferred out of the team
- they are not paused by the Team Lead or Owner/Admin
- they are otherwise permitted by the rule

An active Team Lead is explicitly permitted to receive Leads for their own
team while eligible. Their Team Lead responsibility satisfies the
receive-Leads permission for that team, regardless of whether their
workspace role is Staff/Sales, Manager or Owner/Admin. An eligible Team
Lead is therefore always in their own team's pool. The Team Lead
responsibility never places anyone in another team's pool.

The pool is evaluated at the moment each Lead is assigned. Members are
taken in the team's **stable rotation order**.

A member who becomes eligible — a newly added member, a transferred
member or a member the Team Lead or an Owner/Admin marks Eligible again
— **joins at the end of that stable rotation order**. Becoming eligible
never moves a member ahead of anyone already in the order, and never
grants a backlog, compensation or priority (Section 163.5).

**Rotation state after a team is reactivated**

A reactivated team resumes its **preserved rotation state**; it does not
restart from the beginning.

- If the stored next member is currently an eligible member of the team,
  the next automatic Lead goes to them.
- If the stored next member is not currently eligible — for example
  because their membership ended when the team was deactivated — the
  rotation continues to the next eligible member in the current stable
  order.
- If no rotation state was ever stored for that workspace, team and
  rule, assignment starts with the first eligible member in the current
  stable order.
- Reactivating a team must not assign any Lead already waiting in
  Assignment Required (Section 163.9).

**Assignment steps**

Automatic Lead assignment is performed on the server:

1. Receive or create the Lead.
2. Resolve exactly one active matching Lead assignment rule by applying
   the resolution order in Section 163.7. If that order stops at any
   step, follow Section 163.9 and record the canonical failure reason it
   produced.
3. Resolve exactly one target Sales Team.
4. Load the active, eligible members of that team only.
5. Exclude paused, inactive, deactivated and transferred members.
6. Lock or atomically update the rotation state for that workspace,
   team and rule.
7. Select the assignee: the member holding the current batch if that
   batch has not ended, is not complete and the member is still
   eligible; otherwise the next eligible member after the stored
   position, who starts a new batch.
8. Assign the Lead to that member as Record Owner.
9. Create the assignment history entry.
10. Advance the rotation state only when the assignment succeeds.
11. Return the assignment result.

If step 4 finds no eligible member, follow Section 163.9 instead of
steps 6 to 10.

**Concurrency and reliability**

- Simultaneous assignments for the same rule must not corrupt the
  rotation order.
- Two concurrent requests must never select the same rotation position
  because of a race.
- A failed assignment must not advance the rotation position.
- Retrying the same assignment must not create duplicate assignment
  history or assign the Lead twice.
- Rotation state is scoped by workspace, team and rule.
- Pausing a member must not reset the rotation position.
- Making a member eligible again must not give them priority or a
  backlog.
- When Batch Size is greater than 1, the batch holder and the number of
  Leads already assigned in the current batch are read and updated in the
  same atomic operation as the assignment. Concurrent requests must never
  overfill a batch, skip part of one, or start two batches at once.
- Pausing the member who holds the current batch ends that batch in the
  stored rotation state using the same lock or atomic update. The stored
  position is kept, so the next assignment moves on to the next eligible
  member.
- These guarantees apply equally to Leads created interactively, by
  import (Section 134) and from WhatsApp (Section 95).

These requirements are technology-neutral. The implementation may use
any mechanism that provides the same guarantees.

## 163.9 Assignment Required

A Lead is in **Assignment Required** when automatic assignment was
attempted and could not be completed — because no single active rule
could be resolved, or because the resolved rule's target team could not
supply an eligible member.

When this happens the system must:

- keep the Lead, with no Record Owner, in the explicit **Assignment
  Required** state
- record the rule where one was resolved, the target team where one was
  resolved, and the canonical failure reason
- notify the users listed under **Assignment-failure notifications**
- allow a permitted user to resolve the Lead (Section 162)
- not assign the Lead to a member of another Sales Team
- not assign the Lead from a workspace-wide pool
- not reject, discard or lose the Lead because assignment failed

**Canonical failure reasons**

The resolution order in Section 163.7 decides which reason applies.
Every failure records exactly one of:

- **Missing Routing Data** — the Lead lacks the routing fields the
  workspace's rules require
- **No Matching Rule** — no rule definition matched the Lead and no
  active catch-all rule exists
- **Multiple Matching Rules** — more than one active rule matched and no
  unique highest priority resolved it
- **Matching Rule Inactive** — applicable rule definitions exist but
  every one of them is inactive, and no active catch-all rule exists
- **Target Team Inactive** — the selected rule targets an inactive Sales
  Team
- **No Eligible Team Member** — the target team is active but its
  rotation pool is empty

**Unassigned** continues to mean any Lead without a Record Owner.
Assignment Required is the subset of Unassigned Leads for which an
automatic assignment was attempted and could not be completed.

**Eligibility returning does not assign waiting Leads**

Leads waiting in Assignment Required must never be assigned
automatically because a member became eligible, a team was reactivated,
a rule was activated or a user was added to a team. Waiting Leads are
resolved only by the explicit actions below.

**Seeing the warning is not resolving it**

Two capabilities are deliberately separate.

**Confirmed.** The active Team Lead of the target team receives the
in-app assignment-failure notification for their own team and may view
the operational detail needed to act on it:

- the Lead reference
- the canonical failure reason
- the target Sales Team
- the time of the failure
- the Lead's current Assignment Required status

This is confirmed for the Team Lead of that team whatever their
workspace role, and it grants no access to the Lead's record content,
to team workload, to performance reporting or to the full assignment
audit history (Sections 162.1 and 163.6). Broader visibility remains
unresolved client decision 3 (Section 163.18).

**Not confirmed.** Whether a Team Lead may manually assign, retry or
bulk reprocess the affected Lead is unresolved client decision 4
(Section 163.18) and is denied until approved. An Owner/Admin may always
resolve a waiting Lead. A Manager may resolve one only where that
permission is separately enabled and only within their record and team
scope. An ordinary Staff/Sales user may not resolve a waiting Lead
merely because other operational work is visible to them (Section 162).

**Resolving a waiting Lead**

For a Lead in Assignment Required, a permitted user may:

- manually select an active workspace user as Record Owner (Section
  163.10)
- correct the Lead's routing data and retry automatic assignment
- explicitly re-run the current rule for that Lead
- select several waiting Leads for explicit bulk reprocessing
- leave the Lead waiting

**Bulk reprocessing**

Bulk reprocessing is always an explicit, user-initiated action. It must:

- process the selected Leads **oldest first**
- revalidate the Lead, the rule, the target team and the eligible pool
  at execution time rather than reusing the earlier evaluation
- use the same concurrency-safe assignment transaction as interactive
  assignment (Section 163.8)
- guarantee that a Lead cannot be assigned twice, including under retry,
  refresh or repeated background execution
- audit every attempt, successful or not
- preserve the original failure reason and every previous failed attempt

**Effect of a successful resolution**

A successful manual resolution must:

- set the selected user as Record Owner
- resolve the active assignment warning for that Lead
- retain the original failure history
- create an assignment-history entry recording the manual method
  (Section 163.13)
- not advance the rotation
- not create or alter any Sales Team membership or eligibility

A successful automatic retry uses the normal team-scoped round-robin
state and advances it exactly once.

**Assignment-failure notifications**

When automatic assignment fails, the system sends an **in-app**
notification (Section 175) to:

- the target team's active Team Lead, where a target team was resolved
- active Owner/Admin users

Where no target team could be resolved, only active Owner/Admin users
are notified. V1 must not send assignment-failure notifications by
WhatsApp, email, SMS or push notification.

## 163.10 Manual Lead Assignment

Manual Lead assignment is separate from round robin.

**Who may assign manually**

- An **Owner/Admin** may manually assign a Lead to any active workspace
  user.
- A **Manager** may manually assign only where that permission is
  enabled, and only within the Manager's permitted records and teams
  (Sections 162 and 162.1).
- **Staff/Sales** users cannot manually reassign Leads by default.
- **Cross-team** manual assignment is Owner/Admin only, unless a later
  client decision explicitly grants a narrower capability.

**Who may receive a manual assignment**

- A **Paused** member may receive a manual assignment. Pausing restricts
  automatic assignment only (Section 163.5).
- An active user who belongs to **no Sales Team** may receive a manual
  assignment, but never enters automatic team rotation (Section 163.8).
- The assignee must be an active workspace user. The server validates
  the assignee and never accepts it from the browser alone.

**Effects**

- Manual assignment **must not** advance or otherwise alter the stored
  round-robin rotation state for any workspace, team or rule.
- Manual assignment never creates, ends or changes a Sales Team
  membership.
- Manual assignment never changes anyone's Lead-assignment eligibility.
- Manual assignment does not change the Lead's Follow-ups, Renewal
  actions, Customers or conversations.
- Every manual assignment records the acting user, previous Record
  Owner, new Record Owner, Sales Team where applicable, and timestamp
  (Section 163.13).

Whether a Team Lead may manually reassign Leads within their own team is
unresolved client decision 4 (Section 163.18). Until it is approved and
configured, a Team Lead has no manual reassignment capability beyond
what their workspace role already grants (Section 162).

## 163.11 Assignments Outside Round Robin

Round robin and Sales Teams affect **only** the Record Owner of new
Leads.

- Converting a Lead to a Customer does not run round robin again and
  does not select a different salesperson automatically (Section 46).
- A Customer's Record Owner remains governed by conversion and
  ownership rules.
- Follow-up **Assigned To** remains independent (Section 40).
- Renewal action **Assigned To** remains independent (Section 65).
- WhatsApp conversation **Assigned To** remains independent (Section
  87).
- V1 has no Email conversation assignment (Section 116.1). Round robin
  does not introduce one.
- Activities, notes and documents are never assigned by round robin.
- Changing a user's team membership, eligibility or Team Lead
  responsibility does not rewrite any of these assignments.

## 163.12 Sales Team Settings

Navigation:

Settings → Sales Teams

This is the administrative control surface. It is for Owner/Admin, and
for a Manager only where the workspace has enabled Sales Team
administration under unresolved client decision 5 (Sections 162 and
163.18). It is not the Team Lead's control surface; Team Leads use My
Team (Section 163.6), and a Manager who is a Team Lead uses My Team for
that team like anyone else holding the responsibility.

Authorized users can:

- create a team
- rename a team
- activate or deactivate a team
- add an existing active workspace user to a team
- transfer a salesperson between teams (Section 163.4)
- designate or replace the Team Lead
- view each member's Lead-assignment eligibility
- override Lead-assignment eligibility, as Owner/Admin (Section 163.5)
- create, edit and deactivate Lead assignment rules (Section 163.7)
- preview the eligible rotation pool for a rule
- view assignment failures and Assignment Required Leads
- view administrative audit information, including assignment audit
  history
- resolve or bulk reprocess Leads in Assignment Required, where
  permitted (Sections 162 and 163.9)

**Reactivating a Sales Team**

Reactivation is a guarded configuration workflow, not a single toggle
(Section 163.1). The Owner/Admin workflow is:

1. Prepare the team for reactivation.
2. Add or restore members, each as a **new membership period** (Section
   163.2).
3. Designate exactly one active Team Lead (Section 163.3).
4. Review each member's Lead-assignment eligibility (Section 163.5).
5. Select which Lead assignment rules to reactivate (Section 163.7).
   None is reactivated automatically.
6. Activate the team only after the required validations pass.

A team may become **Active** only when it has exactly one active Team
Lead and every active member is an active workspace user. The
configuration may be collected over several interface steps, but
activation must be validated and applied **atomically**, so the team is
never exposed as Active without exactly one active Team Lead.

A team may be activated with **zero eligible members**. The interface
must then warn, before the change is saved, that:

- the team's rotation pool is empty
- Leads matched to this team will enter Assignment Required (Section
  163.9)
- no other Sales Team and no workspace-wide pool will be used instead

Show for each team:

- Team name
- Team Lead
- Status
- Active members
- Eligible members
- Paused members
- Lead assignment rules targeting the team
- Assignment warning, where present

Eligibility changes made on this screen are Owner/Admin overrides
(Section 163.5), and each one is audited. Access to this screen does not
by itself grant any eligibility-changing authority. If a Team Lead or
Manager is separately authorized to use it, that access does not extend
their eligibility authority beyond a team they lead.

Sales Teams cannot be deleted in a way that breaks history. Adding a
user to a team never creates a workspace user; the user must already
exist and be active.

## 163.13 Assignment Audit History

The system records:

- team creation, change and deactivation
- membership creation, end and transfer
- Team Lead designation and replacement
- a member being made Eligible for Lead assignment
- a member being Paused from Lead assignment
- every Owner/Admin eligibility override, with its required reason
  (Section 163.5)
- automatic Lead assignment
- manual Lead assignment and reassignment
- assignment failure, with its canonical reason (Section 163.9)
- every explicit retry and every bulk reprocessing attempt, successful
  or not (Section 163.9)
- team deactivation and reactivation, including which rules were
  reactivated (Sections 163.1 and 163.12)
- every grant and revocation of an explicit record share (Section
  162.1)
- Lead assignment rule creation, change and deactivation, including
  Batch Size changes

**Each Lead assignment history entry includes**

- Workspace
- Lead
- Previous Record Owner, where applicable
- New Record Owner
- Sales Team
- Lead assignment rule, where applicable
- Method — Round Robin or Manual
- Trigger source — for example Add Lead, import or WhatsApp
- Sequence identifier, where useful
- Acting user, or System
- Timestamp
- Failure reason, where applicable

Eligibility and membership audit entries record the workspace, the Sales
Team, the affected member, the previous value, the new value, the acting
user, the timestamp and the reason. An Owner/Admin eligibility override
must carry a reason; the change is rejected without one (Section
163.5).

## 163.14 Sales Team Entities and Relationships

The following conceptual entities support this section. They describe
required information, not a database design.

- **SalesTeam** — a workspace's named team (Section 163.1)
- **SalesTeamMembership** — one user's current or historical membership
  of one team (Section 163.2)
- **LeadAssignmentRule** — routes automatic Leads to one team (Section
  163.7)
- **TeamRoundRobinState** — the stored rotation position for one
  workspace, team and rule (Section 163.8)
- **LeadAssignmentHistory** — the assignment record kept for each Lead
  (Section 163.13)

**Relationships**

- A workspace has many Sales Teams.
- A Sales Team has many memberships over time.
- A workspace membership has at most one active Sales Team membership.
- An active Sales Team has exactly one active Team Lead.
- A Lead assignment rule targets exactly one Sales Team.
- Round-robin state belongs to one workspace, team and rule.
- A Lead keeps its assignment history.
- Customer ownership and Follow-up, Renewal and conversation assignment
  remain separate from Sales Teams.

## 163.15 Historical Integrity

- No history is silently rewritten.
- Deactivating a team preserves its history.
- Transferring a member preserves their former membership.
- Former Team Lead responsibility remains visible historically.
- Pausing eligibility does not alter existing ownership.
- Retiring a Lead assignment rule preserves its audit records.
- Moving a salesperson between teams does not mass-reassign Leads.
- Existing activity continues to show the original user and team.
- Deactivated users' and teams' names remain visible in historical
  activity.
- Deactivating a Sales Team preserves Lead ownership, membership
  history, Team Lead history, rule history, stored rotation state, Lead
  assignment history and the failure history of Leads waiting in
  Assignment Required (Section 163.1).
- An ended membership stays ended. A user who rejoins a team receives a
  new membership period rather than a reopened one (Section 163.2).
- Reactivating a team restores no membership, Team Lead, eligibility,
  rule or assignment by itself (Sections 163.1 and 163.12).
- Resolving a Lead in Assignment Required preserves its original failure
  reason and every earlier failed attempt (Section 163.9).
- Revoking an explicit record share preserves the activities and audit
  entries created while the share was valid (Section 162.1).

## 163.16 Sales Team Mobile Behaviour

**My Team** — the Team Lead's minimum roster, eligibility controls and
Assignment Required alerts — follows the desktop and mobile principle in
Section 179.

**Settings → Sales Teams** — creating teams, changing membership,
designating Team Leads, configuring Lead assignment rules and
Owner/Admin overrides — remains a web-first administrative task,
consistent with other Settings (Section 157).

Installing the CRM as an application does not change any assignment
rule, and the device never performs Lead assignment itself.

## 163.17 Verification Requirements

Before this capability is accepted, the following must be demonstrated:

- A salesperson cannot hold two active Sales Team memberships, including
  under concurrent requests.
- An active team cannot be left without an active Team Lead who is a
  member of that team.
- Round robin assigns only to eligible members of the rule's target
  team and never to another team or a workspace-wide pool.
- Pausing and resuming take effect for the next assignment, and
  resuming gives no backlog or priority.
- An ordinary member cannot change eligibility, including by submitting
  a crafted request.
- A Team Lead cannot change eligibility for another team.
- A Manager who is not the Team Lead of a team cannot change that team's
  eligibility, including through Sales Team settings.
- An eligible Team Lead is in their own team's rotation by default,
  including when their workspace role is Manager.
- A Team Lead can see the minimum roster and change eligibility from My
  Team without access to Settings → Sales Teams.
- The minimum roster does not expose other members' Leads, Customers,
  Follow-ups, Renewal actions or conversations.
- Every Owner/Admin override is audited.
- Concurrent assignments preserve rotation order and never pick the same
  position twice.
- A failed assignment does not advance the rotation, and a retry does not
  duplicate assignment history.
- Batch Size accepts only an integer from 1 to 100 and defaults to 1; a
  value outside that range is rejected on the server.
- With Batch Size greater than 1, concurrent assignments never overfill
  or split a batch, and pausing the batch holder ends the batch at once.
- A member made eligible again does not resume an unfinished batch.
- A team with no eligible members produces Assignment Required Leads and
  an alert, and no Lead is lost.
- Lead conversion, Follow-ups, Renewal actions and WhatsApp
  conversations are never assigned by round robin.
- A team transfer changes no existing record.
- Imported Leads follow Section 124 and Section 134.
- Teams, memberships, rules and rotation state are isolated between
  workspaces.
- Automatic assignment resolves exactly one active matching rule, and
  each of the six canonical failure reasons can be produced and is
  recorded (Sections 163.7 and 163.9).
- A rule that would match ambiguously at the same priority cannot be
  activated, and a workspace cannot hold two active catch-all rules.
- Manual assignment never advances or alters stored rotation state, and
  never creates a membership or changes eligibility.
- An Owner/Admin eligibility override without a reason is rejected, and
  a successful override records every audited field (Section 163.5).
- A paused member receives no automatic Lead but can still receive a
  manual assignment, and nothing restores eligibility automatically.
- Deactivating a team ends its memberships and Team Lead responsibility,
  deactivates its rules, empties its pool and preserves all history.
- A team cannot become Active without exactly one active Team Lead, and
  activation is atomic.
- A reactivated team resumes its stored rotation state, skipping a
  stored next member who is no longer eligible, and assigns no Lead that
  is already waiting in Assignment Required.
- A returning member receives a new membership period rather than a
  reopened one.
- Leads waiting in Assignment Required are never assigned automatically
  when eligibility returns, and bulk reprocessing is oldest first,
  revalidated and unable to assign a Lead twice.
- Sales Team membership, Team Lead responsibility and WhatsApp
  conversation assignment grant no record access (Section 162.1).
- An operational item cannot be assigned to a user who cannot access the
  related Lead or Customer.
- A revoked explicit share blocks future access while preserving the
  activity and audit entries created while it was valid.
- A capability whose client decision is still open is denied (Sections
  162 and 163.18).

## 163.18 Decisions Required

The following five client decisions are not yet approved. They are the
only unresolved questions in this section.

Until a decision is approved and configured for the workspace, the
capability it describes is **denied in production** (Section 162). The
product must not assume an answer, and no interface may present an
unapproved capability as available.

1. **Target team selection.** How is the target Sales Team selected for
   a new Lead — by Product/Service, Lead Source, geography, manual team
   selection or ordered routing rules? Section 163.7 already defines how
   exactly one rule must be resolved, prioritised and detected as
   overlapping once the matching field or fields are agreed.
2. **Imported Leads without a valid Record Owner.** Do imported Leads
   whose mapped owner is missing or invalid enter team-scoped round
   robin, or do they remain Unassigned for manual handling (Sections 124
   and 134)?
3. **Team Lead visibility.** What team-level records, workload
   information and assignment history may a Team Lead see beyond the
   minimum My Team roster defined in Section 163.6?
4. **Team Lead reassignment.** May a Team Lead manually reassign Leads
   within their own team (Section 163.10)?
5. **Manager Sales Team permissions.** What Sales Team management and
   cross-team permissions do Managers receive — team configuration,
   membership changes, Team Lead designation, rule configuration,
   rotation preview, assignment audit history, workload visibility and
   cross-team manual assignment (Section 162)? Manager record visibility
   is a separate workspace setting defined in Section 162.1, and Manager
   eligibility authority is already settled by Section 163.5.

Each **Decision required** value in the Permission Matrix (Section 162)
corresponds to one of these five decisions and is denied until approved.

**164. Lead Sources**

Owner/Admin can manage the Lead Source options used by the workspace.

Default options:

> • Website
>
> • Referral
>
> • Walk-in
>
> • Campaign
>
> • Other

Actions:

> • Add
>
> • Rename
>
> • Deactivate

Deactivating a source prevents future selection but retains existing
Lead history.

**165. Pipeline**

Navigation:

Settings → Pipeline

Owner/Admin can:

> • Add Stage
>
> • Rename Stage
>
> • Reorder Stages
>
> • Deactivate Stage

Won and Lost remain outcome states.

If active Leads are currently using a stage, those Leads must be moved
before the stage can be deactivated.

Historical stage information must be retained.

**166. Products & Services**

Navigation:

Settings → Products & Services

This area defines the Products or Services offered by the business.

Fields:

> • Name — required
>
> • Description — optional

Actions:

> • Add
>
> • Edit
>
> • Deactivate
>
> • Reactivate

Example:

**Insurance**

> • Health Insurance
>
> • Motor Insurance

**PUC Centre**

> • Pollution Certificate

A Product/Service definition is different from an individual Customer
Product/Service record.

Deactivating a Product/Service prevents future selection but does not
remove existing Customer records or history.

**167. Custom Fields**

Navigation:

Settings → Custom Fields

Owner/Admin can create additional fields for:

> • Leads
>
> • Customers

Supported V1 types:

> • Text
>
> • Number
>
> • Date
>
> • Dropdown
>
> • Checkbox

Fields:

> • Field Name
>
> • Applies To
>
> • Field Type
>
> • Required
>
> • Dropdown Options, where applicable

Actions:

> • Add
>
> • Edit
>
> • Reorder
>
> • Deactivate
>
> • Reactivate

Configured custom fields appear on relevant Add/Edit screens and in
import mapping.

Deactivating a field must retain existing stored values.

Removing a used Dropdown option prevents future selection but retains
existing values. Making an existing custom field Required does not
invalidate existing records that do not yet contain a value.

**168. Reminder Settings**

Navigation:

Settings → Reminder Settings

Owner/Admin can configure default renewal reminder schedules.

Example:

> • 30 days before
>
> • 7 days before
>
> • 1 day before

For each reminder, select:

> • In-app
>
> • WhatsApp
>
> • Email

Owner/Admin may also configure one workspace-wide **default reminder
time**, which is **9:00 AM in the workspace time zone** unless changed
(Sections 158 and 67.1).

These defaults apply when new reminder schedules are created. Changing a
default must not alter the send instant of a reminder instance that is
already scheduled.

A user holding the reminder permissions in Section 162 may override the
schedule for an individual Customer Product/Service.

Changing the default should not silently modify reminder schedules
already created for existing records.

WhatsApp can be selected as a reminder channel only when the WhatsApp
module is enabled. If the connection or required template is
unavailable, the configuration should clearly show that automated
WhatsApp sending cannot operate until the issue is resolved. Existing
configuration should not be silently replaced or changed.

Email may be selected only when the Email module is enabled and the workspace has a verified sender and an active reminder template.

If the sender or required template is unavailable, the configuration should clearly show that automated Email sending cannot operate until the issue is resolved. Existing configuration must not be silently replaced or changed.

**169. WhatsApp Settings**

Navigation:

Settings → WhatsApp

V1 supports:

**One WhatsApp business messaging connection/number per workspace.**

Show:

> • Connection Status
>
> • Connected Number
>
> • available account/business information
>
> • available templates

Connection states:

> • Not Connected
>
> • Connected
>
> • Connection Problem

Actions:

> • Connect WhatsApp
>
> • Manage / Reconnect
>
> • Disconnect

Disconnecting WhatsApp requires confirmation and does not delete
existing conversation history. Queued messages not yet submitted are
cancelled, while provider-accepted messages keep their final status and
their delivery events continue to be processed (Sections 81.1 and
172.1). Reconnecting never resends a cancelled or failed message.

**170. WhatsApp Templates**

Owner/Admin can view templates available to the CRM.

Show:

> • Template Name
>
> • Status
>
> • Purpose/Category where available

Statuses may include:

> • Approved
>
> • Pending
>
> • Rejected
>
> • Unavailable

Only eligible templates may be used.

V1 template management means **viewing and synchronizing available
templates and using them inside the CRM**. Creating a template,
submitting it for approval and changing its approval state happen in the
provider's own administration, never in the CRM (Sections 91 and 81.1).

## 170.1 Email Settings

Navigation:

Settings → Email

Owner/Admin can configure one Email sender identity for the workspace.

Show:

> • Sender Name
>
> • Sender Email Address
>
> • Reply-To Address
>
> • Verification Status
>
> • Connection / Configuration Status

Actions:

> • Configure
>
> • Send Verification
>
> • Recheck Verification
>
> • Update
>
> • Disable

Disabling Email requires confirmation and does not delete existing Email activity or template history.

Email service credentials and secrets must never be exposed to client-side code. Sending, delivery events, bounce and complaint handling follow the adapter contract in Section 116.19.

## 170.2 Email Templates

Navigation:

Settings → Email Templates

Owner/Admin can:

> • Add
>
> • Edit
>
> • Preview
>
> • Duplicate
>
> • Deactivate
>
> • Reactivate

Templates contain:

> • Template Name
>
> • Purpose
>
> • Subject
>
> • Message
>
> • Available Variables
>
> • Status

Only active templates may be selected for new messages or reminders.

Deactivating a template must not change previously sent Email history.

**171. Modules & Features**

Navigation:

Settings → Modules & Features

Owner/Admin can enable or disable applicable modules:

> • Leads
>
> • Customer Follow-ups
>
> • Products & Services
>
> • Renewals & Reminders
>
> • WhatsApp
>
> • Email


Customer Management remains a core module and cannot be disabled.

Example:

**A PUC centre may disable Leads and use:**

**Customer**

↓

**Product / Service**

↓

**Expiry**

↓

**Reminder**

↓

**WhatsApp**

↓

**Renewal**

Disabling a module hides its normal navigation and entry points but does
not delete existing data. Disabling and re-enabling a module are
Owner/Admin actions (Section 162), are audited, and require a
confirmation that describes the queued and scheduled work affected
(Section 172.1). Historical screens remain available in read-only form
to users permitted to see them (Section 162.1).

Disabling Email prevents future Email sending and hides normal Email actions. It does not delete Email templates, configuration history or previously recorded Email activity.

**172. Module Dependencies**

Some features depend on other modules or configuration and cannot
operate independently.

> **• Renewals & Reminders** requires **Products & Services**.
>
> **• Automated WhatsApp renewal reminders** require **Renewals &
> Reminders**, **WhatsApp**, an active WhatsApp connection, and an
> eligible message template.
>
> **• Lead Assignment** and **Pipeline configuration** are available
> only when **Leads** is enabled.
>
> **• Import Leads** is available only when **Leads** is enabled.
>
> • New **Customer Product/Service** records can be created only when
> **Products & Services** is enabled.
>
> • WhatsApp sending is available only when the **WhatsApp module** is
> enabled and the workspace has an active WhatsApp connection.
>
> • Email sending requires the Email module and a verified workspace sender.
>
> • Automated Email renewal reminders require Renewals & Reminders, Email, a verified sender and an active Email template.
>
> • Controlled bulk Email reminders require Renewals & Reminders and Email.

**Dependency Behaviour**

When Owner/Admin attempts to disable a module that another enabled
feature depends on, the CRM should **block the change** and explain
which dependent feature must be disabled first.

Example:

> **Products & Services cannot be disabled while Renewals & Reminders is
> enabled.  
> ** Disable Renewals & Reminders first.

The following dependency rules apply:

**Attempted Change**

**CRM Behaviour**

Disable Products & Services while Renewals & Reminders is enabled

Block and require Renewals & Reminders to be disabled first

Disable Leads

Also hide Lead Assignment, Pipeline and Import Leads

Disable WhatsApp

Stop new WhatsApp sending and automated WhatsApp reminders; retain
existing conversation history

Disconnect WhatsApp

Keep the WhatsApp module and existing history available, but disable
sending until reconnected

Required WhatsApp template becomes unavailable

Prevent the affected automated/template send and show the configuration
problem

Disable Renewals & Reminders

Stop new renewal reminder activity and cancel future scheduled reminder
instances after confirmation; retain renewal/reminder history

Disabling a module:

> • hides its normal navigation and creation actions
>
> • prevents new activity belonging to that module
>
> • does not delete existing or historical data
>
> • does not silently disable another module without informing the user

If the module is re-enabled later, retained data becomes accessible
again according to user permissions. Re-enabling must not automatically
resume, recreate or retry work that was cancelled while the module was
disabled (Section 172.1).

## 172.1 In-Flight Work When a Module Is Disabled

This subsection is authoritative for work that is already under way when
a module is disabled, disconnected or a related record is archived. It
applies to Sections 50, 78, 171 and 172, and to the WhatsApp, Email,
Renewals and Import modules.

The governing distinction is whether a provider has already accepted the
operation.

**Work not yet submitted externally**

Scheduled or queued work that has **not** been submitted to a provider
is cancelled with the reason `Module Disabled`. This applies to queued
outbound WhatsApp messages, queued Email messages and reminder instances
that have not yet been submitted (Section 67.1).

**Provider-accepted work**

Where a provider has already accepted the operation, the CRM must:

> • not report it as cancelled
>
> • continue to receive and process its verified delivery-status
> callbacks
>
> • retain its final delivery status
>
> • retain every attempt
>
> • never submit a duplicate when the module is re-enabled

**Imports already in progress**

An import already in **Processing** may continue to completion when the
Import module is disabled. A user holding the import permission in
Section 162 may cancel it explicitly. Disabling the module must:

> • prevent new imports from being started
>
> • prevent queued imports from starting
>
> • not corrupt an import that is already processing
>
> • preserve row-level results and idempotency (Section 134)

**Renewals and Reminders**

Disabling Renewals & Reminders must prevent new Renewal actions and
reminder schedules, cancel pending reminders that have not been
submitted externally, and retain Customer Product/Service and renewal
history. Re-enabling makes the underlying records visible again but must
not recreate cancelled reminders.

**WhatsApp**

Disabling or disconnecting WhatsApp must prevent new outbound sends,
prevent queued unsubmitted sends from being submitted, leave
conversation and message history readable, safely process verified
webhooks already received or in flight, preserve provider-accepted
messages and their final statuses, and prevent automatic retry while
disconnected. Reconnecting must not resend a cancelled or failed
message.

**Email**

Disabling Email must prevent new sends, cancel queued messages not yet
submitted to the provider, retain message history, and continue
processing delivery events for provider-accepted messages. Re-enabling
must not resend cancelled or failed email.

**Restoring an archived record**

The same distinction applies when a Lead or Customer is archived: queued
unsubmitted work is cancelled with the archive reason, while
provider-accepted work completes and keeps its final status. Restoring
the record recreates none of it (Section 29.1).

Inbound provider events continue to be accepted, verified and retained
for archived records and for disabled modules. They create no
operational work (Sections 81.1, 88 and 116.19).

**173. Data Import / Export**

Navigation:

Settings → Data Import / Export

Provides access to the import/export functionality defined in the Data
Import & Export section.

Show:

> • Import Leads
>
> • Import Customers
>
> • Import History
>
> • permitted Export actions

This screen should reuse the existing import/export workflow rather than
duplicate it.

**174. Important Settings Behaviour**

Significant administrative actions require confirmation, including:

> • deactivate user
>
> • change user role
>
> • deactivate pipeline stage
>
> • deactivate Product/Service
>
> • disconnect WhatsApp
>
> • disable a module
>
> • disable Email
>
> • change or remove the verified Email sender

Every confirmation for disabling a module must describe the queued and
scheduled work that will be cancelled, and must distinguish it from work
a provider has already accepted, which continues and keeps its final
status (Section 172.1).

Configuration changes should stop or affect **future use without
deleting historical CRM data** unless explicitly stated otherwise.

Users should only see settings and actions they have permission to
access.

**175. Notifications**

Notifications alert users about CRM activity that requires attention.

Navigation:

Top Bar → Notifications

Show:

> • Notification
>
> • Related Lead / Customer / Activity
>
> • Date / Time
>
> • Read / Unread status

Newest notifications appear first.

**V1 Notification Triggers**

> • Lead / Customer assigned to you
>
> • automatic Lead assignment could not be completed (Assignment
> Required) — shown to the target team's Team Lead and to authorized
> Owner/Admin users
>
> • Follow-up due / overdue
>
> • Renewal due / overdue
>
> • new WhatsApp reply
>
> • WhatsApp conversation assigned
>
> • WhatsApp message / scheduled reminder failed
>
> • bulk WhatsApp send completed / partially failed
>
> • Email message or scheduled Email reminder failed
>
> • Email bounced
>
> • controlled bulk Email reminder completed or partially failed
>
> • workspace Email sender requires administrator attention
>
> • import completed / failed

Notifications should be sent only to the relevant user, such as the
assigned user or the user who initiated the action.

Selecting a notification should open the relevant CRM record, activity
or result where possible.

New notifications are **Unread**. Opening them marks them as **Read**.

Actions:

> • Mark as Read
>
> • Mark All as Read

The CRM should avoid duplicate notifications for the same event and
should not notify users for routine successful actions that do not
require attention.

Mobile should support the same notification list, with links opening the
relevant mobile screen where available.

V1 notifications are in-app only. Installing the CRM as an application
does not enable operating-system push notifications. Web Push and
scheduled background notifications are outside V1.

**176. Documents**

Documents allow users to store files related to a Customer and, where
applicable, a specific Customer Product/Service.

Documents are available from the **Customer Profile**.

Show:

> • File Name
>
> • File Type
>
> • Uploaded By
>
> • Uploaded Date
>
> • Related Product/Service, where applicable
>
> • Actions

Actions:

> • Upload — for a permitted Customer (Sections 162 and 162.1)
>
> • View
>
> • Download
>
> • Archive — Manager or Owner/Admin only
>
> • Restore — Manager or Owner/Admin only

Documents remain available when a Customer or Product/Service is
archived, subject to the archived-record visibility rules (Sections 78
and 162.1). A document is archived and restored on its own, through the
document permissions in Section 162; restoring a Customer does not
restore a separately archived document (Section 29.1).

V1 does not include:

> • document versioning
>
> • approval workflows
>
> • e-signature
>
> • document collaboration
>
> • complex folder structures

For V1, Documents should belong to **Customers only**, not Leads.

If a document relates to a specific Customer Product/Service, the user
can optionally link it to that record.

## 176.1 Document Storage and Access Security

This subsection is authoritative for Customer document validation,
storage, access and lifecycle. Sections 77, 116.7 and 176 refer to it.

**Permitted file types in V1**

> • PDF
>
> • JPG / JPEG
>
> • PNG
>
> • DOCX
>
> • XLSX

The following are rejected: executable files, scripts, HTML capable of
active content, macro-enabled Office files, password-protected or
encrypted Office files, any file whose extension, MIME type and
signature disagree, and any file larger than **10 MB**.

**Upload lifecycle**

A document holds exactly one of these states:

> • **Uploading** — bytes are being received
>
> • **Scanning** — validation and malware scanning are running
>
> • **Available** — usable and downloadable by permitted users
>
> • **Rejected** — refused by validation or scanning
>
> • **Archived** — withdrawn from active lists, retained privately

A file must not become **Available** before server-side signature and
MIME validation, size validation, a successful malware scan, and
validation of the user's permission on the related Customer.

A scanner that fails or is unavailable must **fail closed**: the file
stays unavailable and is never treated as clean.

A **Rejected** file retains safe audit metadata and its rejection
reason, and must not be downloadable by ordinary users.

**Storage and download**

> • encrypted, private object storage
>
> • no public bucket and no permanent public URL
>
> • unpredictable object identifiers
>
> • sanitized display file names
>
> • a permission check on **every** view or download (Sections 162 and
> 162.1)
>
> • a signed download link valid for no more than **five minutes**
>
> • downloads served with a safe content disposition
>
> • strict workspace and Customer isolation
>
> • access logging for every view and download

**Archive, restore and deletion**

Archiving a document removes it from active lists, preserves its
metadata, history and the stored private object, and never permanently
deletes it. Archiving and restoring are restricted to Manager and
Owner/Admin (Section 162), and restoring never bypasses Customer access
(Section 162.1). A document is archived and restored independently of
its Customer (Section 29.1).

Permanent retention and deletion periods require CTO and legal approval
(Section 180.1). They are not client workflow decisions.

**Audit**

Each document records: upload initiation, validation and scan result,
availability, every view, every download, archive, restore, the handling
of a rejected upload, and any later permanent deletion carried out under
an approved retention policy.

**177. System-Wide Behaviour**

The following rules apply across the CRM and should be interpreted
consistently in all modules.

**Record Responsibility**

> • Leads and Customers use **Record Owner**.
>
> • Follow-ups, Renewal actions and WhatsApp conversations use
> **Assigned To**.
>
> • Operational actions may initially inherit the related
> Lead/Customer's Record Owner.
>
> • Changing **Assigned To** does not change the Lead/Customer's
> **Record Owner**.
>
> • Sales Teams and Lead round robin set only the Record Owner of new
> Leads. They never assign Customers, Follow-ups, Renewal actions or
> WhatsApp conversations.

**Deactivation / Disabling**

When a User, Sales Team, Lead assignment rule, Pipeline Stage,
Product/Service, Custom Field or Module is deactivated or disabled:

> • future use is restricted as defined in the relevant section
>
> • existing data is retained
>
> • historical activity is not deleted or rewritten

**Permissions**

Users should only see records and actions they are permitted to access.
Record access is defined in Section 162.1 and the available actions in
Section 162.

Permissions must be enforced by the system, not only by hiding UI
controls.

**Workspace isolation and defence in depth**

Every stored business entity belongs to exactly one workspace, and every
read and write is scoped to the acting user's workspace. Isolation must
be enforced **both** in server-side authorization and independently at
the database layer through row-level security, so that a fault in
application code cannot expose another workspace's data. Neither layer
replaces the other, and server-side authorization remains required even
where database enforcement exists.

Provider connections identify their own workspace (Sections 81.1 and
116.19). Customer contact information — a phone number or email address
— must never determine workspace identity.

A capability whose client decision is still open is denied until it is
approved and explicitly configured (Sections 162 and 163.18).

**Significant Actions**

Actions with meaningful consequences should require confirmation.

Examples include:

> • archiving records
>
> • deactivating users
>
> • disabling modules
>
> • disconnecting WhatsApp
>
> • disabling Email
>
> • changing the verified Email sender
>
> • controlled bulk Email reminders
>
> • bulk messaging

Confirmation should explain what will happen rather than displaying only
a generic **Are you sure?**

**Historical Data**

Changes to current configuration should not rewrite past CRM history.

For example:

> • changing Record Owner should not remove previous ownership history
>
> • deactivating a user should not remove their name from past activity
>
> • changing reminder defaults should not alter completed reminders
>
> • deactivating Products/Services should not remove previous Customer
> records
>
> • transferring a user between Sales Teams, pausing their
> Lead-assignment eligibility or deactivating a team should not rewrite
> past ownership or assignment history

**178. Common UI States**

Where relevant, wireframes should account for:

> • Empty
>
> • Loading
>
> • Validation Error
>
> • Save / Processing Error
>
> • Permission Restricted
>
> • Disabled / Unavailable Action
>
> • Archived / Inactive Record
>
> • Integration Not Connected
>
> • Offline
>
> • Update Available

These states may appear as inline messages, banners, dialogs or disabled
controls depending on the screen.

**179. Desktop and Mobile Principle**

The **web application** is the complete CRM and administration
experience.

Mobile focuses on day-to-day operational work such as:

> • Dashboard
>
> • Leads
>
> • Customers
>
> • Follow-ups
>
> • initiating calls
>
> • recording call outcomes
>
> • completing Call follow-ups
>
> • scheduling the next follow-up
>
> • Renewals
>
> • WhatsApp
>
> • individual Email communication
>
> • Notifications

Configuration-heavy functions such as Users, Permissions, Pipeline
configuration, Custom Fields, Import/Export and integration setup remain
web-first.

Mobile layouts should simplify desktop tables into mobile-friendly cards
or lists rather than reproducing desktop layouts directly.

Email sender configuration, Email template administration and controlled bulk Email sending remain web-first.

The same web application may also be installed on a phone or tablet home
screen as a Progressive Web App. Installation changes how the CRM is
launched and presented. It does not change functionality, permissions,
data access or workspace isolation. Progressive Web App behaviour is
defined in the following section.

## 179.1 Progressive Web App Behaviour

The CRM is delivered as a single web application that can also be
installed on a phone or tablet home screen as a Progressive Web App.

Installation changes only how the application is launched and presented.
It does not change functionality, permissions, data access, workspace
isolation or the V1 scope boundary.

The application must continue to work as a normal website when it has
not been installed. Installation is optional and must never be required
to use the CRM.

**V1 supports**

- installing the CRM on a supported phone or tablet home screen
- launching the CRM from an application icon
- standalone display without normal browser chrome
- application name, short name and Limenzy CRM application icons
- light and dark theme colours matching the application themes
- correct safe-area behaviour on devices with rounded corners, notches
  or home indicators
- guidance explaining how to install on Android and on iPhone
- a branded offline message when the device has no connection
- a controlled update path when a new application version is deployed

**V1 does not include**

- offline creation or editing of CRM records
- offline queuing of changes
- background synchronization
- conflict resolution
- offline access to customer, lead, renewal, document, email or report
  data
- Web Push notifications
- scheduled background notifications
- distribution through an application store
- a separate mobile application codebase

**Installed presentation**

An installed CRM uses the same responsive layouts, the same mobile
bottom navigation and the same drawer navigation defined elsewhere in
this specification. No separate installed-only screens are introduced.

Where the application is running in standalone display mode, the
interface may account for the absence of browser chrome, for example by
respecting device safe areas. It must not present different navigation,
different permissions or different functionality.

**Start URL and scope**

The application start URL and scope are origin-relative:

- start_url: "/"
- scope: "/"

The root route directs the user through the normal server-side
authentication, onboarding and workspace-selection flow. The installed
application must not start at a workspace-specific or permission-
specific address, because no session exists at the time of installation.

**Authentication in an installed application**

An installed CRM follows the same authentication and session policy as
the browser application. Users sign in normally and remain signed in
according to that policy.

Depending on the browser, operating-system version and installation
flow, the installed application may inherit the existing cookie session
or may require the user to sign in. Both paths must be tested and
handled correctly. Being asked to sign in once after installing is
expected platform behaviour and must be explained rather than treated as
an error.

**Offline behaviour**

When the device has no connection, the CRM shows a clear branded offline
message stating that a connection is required and offering to retry.

The offline experience must not display customer data, lead data,
renewal data, email content, reports, documents or any other workspace
content. It must not imply that work performed offline will be saved.

**Calling from an installed application**

An installed PWA may initiate a normal cellular call through the native
phone interface, using the click-to-call behaviour defined in Sections
27.1–27.5.

- The PWA should preserve CRM context so the salesperson can return and
  record the outcome.
- Standalone PWA display does not mean that the cellular conversation
  itself remains inside the PWA. The phone's native call interface
  temporarily takes over.
- Click-to-call requires network access to load or update CRM data. The
  cellular call itself is handled by the device and the mobile carrier.
- V1 does not include offline call-outcome synchronization unless
  already explicitly approved elsewhere in this specification.

**Data and caching restrictions**

The CRM contains sensitive customer and financial information.

Authentication responses, tokens, cookies and session values must never
be written to Cache Storage or intentionally cached by the service
worker. Normal secure browser cookie storage may be used according to
the approved authentication and session policy.

The following must never be retained for offline use:

- authenticated application responses
- customer, lead, renewal, product or service records
- email content, templates or recipient data
- documents and attachments
- reports and report exports
- any workspace-specific content

Only non-sensitive static application assets may be retained, to support
launching the application and displaying the offline message.

**Installation requirements**

Installation depends on the application being served over HTTPS, a valid
application manifest and valid application icons. These must be
validated independently of one another.

A service worker is not treated as a universal installation requirement.
In this product a service worker exists only to provide the restricted
offline fallback described above.

Automated tooling may be used as a supporting check, but the acceptance
test is actual installation and launch on supported Android and iPhone
devices.

**Application updates**

When a new application version is deployed, an installed CRM must be
able to obtain it. A user must not be left on an outdated version
indefinitely, and an update must never be applied in a way that loses
work in progress.

**Application icons**

Application icons are derived from the approved Limenzy chevron symbol.

- the original approved logo assets are preserved and must not be edited
  or redrawn
- the full wordmark must not be placed inside a square application icon
- separate normal and maskable icons are provided
- maskable icons respect the platform safe-zone padding so the symbol is
  not cropped on rounded or circular launcher shapes

**Workspace branding**

V1 installs the CRM under the Limenzy CRM product identity. The
manifest, application icons and offline message must not contain the
name, logo or branding of any individual business using the product.

Workspace-specific installed branding is not part of V1.

**180. V1 Scope Boundary**

Wireframes should include only the V1 functionality defined in this
specification.

Do not introduce:

> • complex workflow builders
>
> • advanced automation sequences
>
> • custom report builders
>
> • omnichannel inbox
>
> • ticketing/helpdesk
>
> • chatbot
>
> • multiple WhatsApp numbers per workspace
>
> • marketing campaign management
>
> • advanced analytics
>
> • subscription/billing management
>
> • custom role builders
>
> • departments, organizational hierarchies or team structures beyond
> the Sales Teams used for Lead assignment in Section 163
>
> • automatic Lead routing other than the team-scoped strict round robin
> in Section 163, specifically excluding workload-based, capacity-based,
> weighted, performance-based and AI or predictive routing
>
> • scheduled or automatic return from Paused Lead-assignment
> eligibility (Section 163.5)
>
> • creating, submitting or approving a WhatsApp template inside the CRM
> (Sections 81.1 and 91)
>
> • permanent deletion of a Customer Document without an approved
> retention policy (Sections 176.1 and 180.1)
>
> • shared Email inbox
>
> • Gmail or Outlook mailbox synchronization
>
> • incoming Email synchronization
>
> • automated Email sales sequences
>
> • general Email marketing campaigns
>
> • Email open and click tracking
>
> • drag-and-drop Email template builder
>
> • offline creation or editing of CRM records
>
> • offline mutation queues
>
> • background synchronization
>
> • offline conflict resolution
>
> • Web Push notifications
>
> • scheduled background notifications
>
> • application-store distribution
>
> • a separate mobile application codebase
>
> • workspace-specific installed application branding

The V1 call exclusions defined in Section 27.5 also apply. In summary,
do not introduce in-app VoIP or WebRTC calling, telephone-number
provisioning, call recording or transcription, automatic call-duration
detection, automatic detection of answered, missed or failed calls,
access to the phone's operating-system call history, automatic
synchronization with cellular call logs, call-centre, PBX or
telephony-provider integration, automatic outbound calling, or
predictive or power dialling. Section 27.5 is the authoritative list.

If a feature is not defined in the specification, it should not be
assumed to exist.

## 180.1 Deployment Decisions Requiring CTO Approval

The following are **deployment and operational decisions**, marked
`CTO approval required`. They are deliberately separate from the five
client product decisions in Section 163.18, and must never be counted as
open client decisions or presented to a workspace as configuration.

> • WhatsApp provider
>
> • Email provider
>
> • private object-storage provider
>
> • backup retention
>
> • monitoring and alerting platform
>
> • on-call and incident process
>
> • support SLA
>
> • recovery time objective (RTO)
>
> • recovery point objective (RPO)
>
> • legal data-retention and deletion policy
>
> • final production import limits, after load testing (Section 119.1)
>
> • final WhatsApp bulk limit, after load testing and provider-policy
> review (Section 81.1)
>
> • final Email bulk limit, after load testing (Section 116.19)
>
> • provider-specific webhook and retry configuration, where provider
> policy requires an adjustment to the defaults in Sections 81.1 and
> 116.19

The specification itself remains **provider-agnostic**. Until a provider
is approved, work proceeds against the documented adapter contract,
using local or test doubles, and no provider-specific assumption is
placed in domain logic.

The V1 defaults stated elsewhere in this specification apply until a CTO
decision changes them, and a configured value must never exceed a safe
deployment limit.
