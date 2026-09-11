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
> • assign/reassign records where permitted
>
> • view permitted Follow-ups
>
> • send individual Emails
>
> • send manual and controlled bulk Email reminders where permitted
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
> • send WhatsApp messages
>
> • manage assigned WhatsApp conversations
>
> • process renewals/reminders
>
> • add notes and activities

Should not have access to organization-wide configuration by default.

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

Communication module containing inbox, message history and templates
where permitted.

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

**Mark Complete**

**Reschedule**

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

Visible to authorized roles only.

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
Record Owner, but they can be reassigned by authorized users.

**27. Global Activity Timeline**

Lead and Customer screens should use a common activity pattern.

Activity types:

> • record created
>
> • note
>
> • call
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
> • remain searchable under archived filter
>
> • retain history
>
> • can be restored by authorized users

This reduces accidental data loss.

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

Provide a searchable and filterable view of all leads the user is
permitted to access.

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

Quick filters:

**All \| My Leads \| Follow-up Due \| No Follow-up**

For Staff users, **My Leads** should be the default view unless their
permissions allow broader access.

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
> • Record Owner defaults according to the workspace's lead assignment
> rules.
>
> • If no automatic assignment rule is configured, the creator may
> assign a user manually where permitted

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

Before saving, the system should check for an existing Lead or Customer
with the same phone number or email.

If a possible duplicate exists:

> A Lead or Customer with this contact information already exists.

Show the matching record(s) and allow the user to:

**View Existing Record**

or, where permitted:

**Create Anyway**

The system should warn about duplicates rather than silently creating
them.

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

**WhatsApp**

**Email**

**Add Follow-up**

**Edit**

**More**

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

**Call completed by Arun**

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

A **WhatsApp Follow-up** is a task reminding the assigned user to
contact the Lead/Customer through WhatsApp. Scheduling the Follow-up
does not automatically send a message.

An **Email Follow-up** is a task reminding the assigned user to contact
the Lead/Customer by email. Scheduling the Follow-up does not
automatically send an email.

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

**41. Completing a Follow-up**

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

**42. Reschedule Follow-up**

Selecting **Reschedule** allows the user to change:

> • Date
>
> • Time
>
> • Assigned To, where permitted

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

Staff users should primarily see follow-ups assigned to them unless
broader permissions are granted.

**Actions**

From the Follow-ups screen:

> • Mark Complete
>
> • Reschedule
>
> • Open Record

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

The system should not automatically mark an overdue Follow-up as
completed or cancelled.

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

**After Conversion**

The system should:

> • Create a Customer using the Lead's information.
>
> • Retain the Lead's historical activity.
>
> • Link the original Lead and resulting Customer.
>
> • Carry forward incomplete future follow-ups.
>
> • Retain the Record Owner unless deliberately changed.
>
> • Mark the Lead as **Converted**.
>
> • Converted Leads are removed from active Pipeline/List views and
> remain accessible through a Converted filter/history.
>
> • Prevent the same Lead from being converted a second time.
>
> • Open the newly created Customer Profile.

The original Lead should **not be deleted**.

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

Authorized users may link the Lead to the existing Customer.

The Lead is then marked **Converted** and its history remains available.

Incomplete Follow-ups belonging to the Lead are transferred to the
existing Customer, while historical Lead activities remain associated
with the original Lead and accessible through the linked Customer
history.

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
> are cancelled and retained in history. Reopening the Lead does not
> automatically restore cancelled Follow-ups; a new Follow-up may be
> scheduled.

A Lost Lead may later be reopened by an authorized user.

Reopening returns the Lead to an active pipeline stage selected by the
user.

**49. Lead Assignment**

A Lead should receive a Record Owner according to the workspace's
assignment rules. If assignment cannot be completed, the Lead may remain
**Unassigned** until an authorized user assigns it.

V1 supports manual assignment and round-robin assignment of the Record
Owner.

Owner/Admin can configure the default assignment method in Settings.

Managers may reassign Leads where permitted.

Staff users should not normally reassign Leads to other users unless
specifically permitted.

Every reassignment should appear in Activity History.

**50. Lead Archive**

Authorized users may archive a Lead.

Archived Leads:

> • disappear from normal Leads views
>
> • do not appear in the active Pipeline
>
> • retain activity and follow-up history
>
> • can be viewed using an Archived filter
>
> • can be restored

Archive always requires confirmation. If incomplete Follow-ups exist,
the confirmation additionally warns that they will be removed from
active work views and retained in history.

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

Selecting the card opens Lead Detail.

**Lead Detail**

Keep primary actions easily accessible:

**Call \| WhatsApp \| Email \| Follow-up \| More**

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

Provide a searchable and filterable view of all Customers the user is
permitted to access.

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

Before creating a Customer, check for an existing Lead or Customer with
the same phone number or email.

If a possible duplicate exists:

> **A Lead or Customer with this contact information already exists.**

Show the matching record(s).

Actions:

**View Existing Record**

**Create Anyway** — where permitted

If the match is an existing Lead, the system should allow the user to
open that Lead and decide whether it should be converted instead of
creating a separate Customer.

The system should warn about possible duplicates but should not
automatically merge records.

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

**WhatsApp**

**Email**

**Add Follow-up**

**Add Product/Service**

**Edit**

**More**

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
reminders, and retains its details, renewal history and activity.
Authorized users may restore it.

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

Authorized users may reassign it.

Example:

**Customer**

**Record Owner: Arun**

**Health Insurance Renewal**

**Assigned To: Sneha**

Changing the Renewal action's Assigned To does not change the Customer's
Record Owner.

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

**68. Reminder Status**

Where applicable, show a simple reminder status such as:

> • Not Scheduled
>
> • Scheduled
>
> • Sent
>
> • Failed
>
> • Cancelled

For multiple reminders, the Product/Service detail may show the
individual reminder history.

Example:

**30 days before Sent 27 Aug**

**7 days before Scheduled 19 Sep**

**1 day before Scheduled 25 Sep**

**69. Send Reminder Manually**

From Renewals & Reminders, authorized users may send a reminder
manually.

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
reminder configuration.

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

**View / Download**

**Delete / Archive** — according to permissions

Detailed document-storage configuration is not required for V1
wireframes.

**78. Customer Archive**

Authorized users may archive a Customer.

Archived Customers:

> • disappear from normal Customer views
>
> • remain accessible through an Archived filter
>
> • retain Products/Services, activities and documents
>
> • can be restored

Archive always requires confirmation.

If the Customer has:

> • incomplete Follow-ups
>
> • active Renewal actions
>
> • scheduled reminders

the confirmation must warn that these active actions will be removed
from normal work views/cancelled where applicable while their history is
retained.

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

The WhatsApp module allows authorized users to communicate with Leads
and Customers from the CRM and manage incoming customer replies.

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

Staff users should not automatically have access to all workspace
conversations.

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

An authorized user may later reassign the conversation.

Example:

**Conversation Assigned To: Sneha**

This does **not** change:

**Customer Record Owner: Arun**

Every conversation reassignment should be recorded in activity/history.

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

A new incoming message to a Closed conversation automatically:

> • reopens the same conversation
>
> • marks it unread
>
> • retains its previous message history

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

Where template creation, approval or platform-level editing must occur
through the connected WhatsApp provider/platform, the CRM should direct
the administrator appropriately rather than pretending the action
occurred locally.

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
> • assign the conversation according to the normal assignment rule

Creating a Lead/Customer should **not start a new conversation thread**.

**96. Multiple CRM Record Match**

If a phone number genuinely matches multiple unrelated active CRM
records, the system must not silently select one.

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
> • do not incorrectly add message activity to one of the possible CRM
> records

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

If a conversation is associated with the wrong CRM record, an authorized
user may correct the association.

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

If a condition fails, display the reason before or after the send
attempt as appropriate.

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
> • allow retry where appropriate
>
> • retain the failed attempt in message history

Retrying should create a new send attempt rather than rewriting the
historical failed attempt as successful.

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
successful retry/send occurs.

**103. Manual Renewal Reminder**

From Renewals & Reminders, an authorized user may select:

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
campaign builder.

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

The user should be able to identify the affected records.

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

Authorized users can mark a Lead or Customer as **WhatsApp Opted Out**
from the relevant record/contact communication settings. The state may
also be updated from the WhatsApp integration where supported.

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

Users should not be shown actions they cannot perform.

The detailed role matrix will be defined in the Settings &
Administration section.

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

The Email module allows authorized users to send business emails from CRM Lead, Customer and Renewal records.

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

Validation should include:

- permitted file type
- configured file-size limit
- safe file name
- successful upload
- file availability
- user access to the related document

Executable or otherwise prohibited file types must not be accepted.

When an attachment is selected from Customer Documents, the original document remains part of the Customer record.

An attachment uploaded while emailing a Lead may be retained with the email activity entry but does not create a general Lead Documents module.

Email activity should retain attachment names and references where permitted.

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

An authorized user may update the preference. The change should be recorded in CRM Activity with the user and date.

The system must not automatically remove an opt-out without an authorized user action.

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
- store the available failure reason
- allow a permitted user to retry
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

The provider reported that the recipient address did not accept the email.

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
- allow an authorized user to retry or use another permitted action

The system must prevent the same reminder instance from being sent twice because of a retry, refresh or repeated background-job execution.

## 116.13 Manual Email Renewal Reminder

From Renewals & Reminders, an authorized user may select:

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

Bulk Email requires explicit confirmation.

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

Email actions must follow the role and permission rules defined under Settings → Roles & Permissions.

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

**117. Data Import & Export**

The CRM should allow authorized users to import existing Lead and
Customer data and export permitted CRM data when required.

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

Import functionality should be available only to authorized users.

**119. Supported Import File**

V1 should support:

> • CSV
>
> • XLSX / Excel

The upload screen should clearly state the accepted formats.

Example:

**Import Customers**

Upload a CSV or Excel file containing your customer data.

**\[ Choose File \]**

**\[ Download Sample File \]**

The sample file should contain the standard CRM fields expected for that
record type.

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

If the file cannot be read:

> **Unable to read this file. Please upload a valid CSV or Excel file.**

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
> • leave those records Unassigned, where permitted
>
> • use a default Record Owner

The import process must not automatically create new users from
spreadsheet values.

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

Validation should classify rows as:

> **• Ready**
>
> **• Needs Attention**
>
> **• Duplicate**
>
> **• Cannot Import**

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

Duplicate detection should use the same basic rules used when manually
creating Leads or Customers.

Check for matching:

> • phone number
>
> • email

Where a possible duplicate exists, classify the row as:

**Possible Duplicate**

The CRM should not silently overwrite the existing record.

**131. Duplicate Handling Options**

Before import, authorized users may choose how possible duplicates are
handled.

V1 options:

**Skip Duplicates**

or

**Import as New Records**

where permitted.

V1 should **not automatically merge or update existing CRM records
during a normal import**.

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

The error report should include:

> • original row number
>
> • relevant identifying information
>
> • reason the row failed

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

**135. Import Result**

On completion:

**Import Complete**

Example:

**390 Imported**

**18 Skipped as Duplicates**

**12 Failed**

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

Selecting an entry shows the import summary.

V1 does not require detailed audit analytics for every imported cell.

**137. Export**

Authorized users may export permitted Lead or Customer data.

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

The exported file should use clear column headings corresponding to CRM
field names.

**140. Export Confirmation / Sensitive Data**

Normal exports do not need repeated confirmation dialogs unless they
contain a large volume of sensitive or restricted data.

However:

> • only authorized roles may export
>
> • users may export only records and fields they are permitted to
> access

The detailed export permission will be defined under **Roles &
Permissions**.

**141. Import / Export Permission Behaviour**

The detailed permission matrix will be defined later under:

Settings → Users → Roles & Permissions

At minimum:

**Owner/Admin**

> • import Leads
>
> • import Customers
>
> • export permitted/all CRM data

**Manager**

> • import/export only if explicitly permitted

**Staff**

> • no import/export access by default

Import/export controls should be hidden where the user does not have
permission.

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

The Reports module provides Owner/Admin and authorized Managers with a
simple view of CRM performance and pending business activity.

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
> • user permissions

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

Reports are primarily a web/management feature, but authorized users may
access a simplified report view on mobile.

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

Settings & Administration allows authorized users to configure the CRM
for their workspace.

Navigation:

Sidebar → Settings

Settings should include:

> • Business Settings
>
> • Users
>
> • Roles & Permissions
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
Follow-ups and automated reminders.

Changing the workspace Time Zone does not change date-only values such
as Renewal or Expiry Dates and does not silently reschedule existing
scheduled actions.

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
user before deactivation is completed. Users deactivated while
participating in Round Robin are automatically removed from future Lead
assignment. The last active Owner/Admin cannot be deactivated.

Historical activity should continue to show the original user's name.

Reactivating the user does not automatically restore previously
reassigned work.

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

Manager record visibility can be configured as:

> **• All Records**
>
> **• Own Records**

V1 does not include a separate Teams/Departments structure.

**163. Lead Assignment**

Navigation:

Settings → Lead Assignment

Controls how new Leads receive a Record Owner.

Supported V1 modes:

**Manual**

Authorized user selects the Record Owner.

**Round Robin**

New Leads are assigned to selected active users in a repeating sequence.

Owner/Admin can configure a **Batch Size**, which defines how many
consecutive Leads are assigned to one user before the system moves to
the next user.

Example with **Batch Size = 10**:

Leads 1–10 → Arun

Leads 11–20 → Sneha

Leads 21–30 → Joseph

Leads 31–40 → Arun

If **Batch Size = 1**, Leads are assigned one at a time:

Lead 1 → Arun

Lead 2 → Sneha

Lead 3 → Joseph

Lead 4 → Arun

Configuration:

> • Eligible Users
>
> • Batch Size

Only active eligible users participate in the rotation.

Changes to eligible users or Batch Size apply only to future Lead
assignments and do not alter existing Lead ownership. Inactive or
ineligible users do not participate in future assignments.

If no eligible active user is available, the Lead remains
**Unassigned**.

Unassigned Leads are visible to Owner/Admin and Managers with
appropriate visibility.

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

These defaults apply when new reminder schedules are created.

Authorized users may override them for an individual Customer
Product/Service.

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
existing conversation history.

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

V1 template management means **viewing/syncing available templates and
using them inside the CRM**. It does not reproduce the complete WhatsApp
template creation and approval system.

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

Email service credentials and secrets must never be exposed to client-side code.

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
not delete existing data.

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

If the module is re-enabled later, retained data should become
accessible again according to user permissions.

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

> • Upload
>
> • View
>
> • Download
>
> • Delete / Archive, based on permission

Documents should remain available when a Customer or Product/Service is
archived.

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

**Deactivation / Disabling**

When a User, Pipeline Stage, Product/Service, Custom Field or Module is
deactivated or disabled:

> • future use is restricted as defined in the relevant section
>
> • existing data is retained
>
> • historical activity is not deleted or rewritten

**Permissions**

Users should only see records and actions they are permitted to access.

Permissions must be enforced by the system, not only by hiding UI
controls.

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
> • Teams/Departments management
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

If a feature is not defined in the specification, it should not be
assumed to exist.
