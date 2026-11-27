# AI work log — app-camin

This journal records the owner's requests, the assistant's work, and the checks performed.
It adapts the Graffino session journal to the project's base setup.
Add new entries at the top, in reverse chronological order.

## 2026-11-27 · Live-queue and early finish

The owner approved D-024 for washers and dryers. Residents enter a same-day
Live-queue with their cycle duration. The first entrant whose cycle and
handover fit receives an offer of up to five minutes. A holder can finish
any ongoing Reservation early. Inspection pauses the queue and confirmed
faults close affected entries. Q-009 is answered and Q-005 records the pilot
rules alongside its remaining questions.

Migration 016 adds entries, offers and early-finish timestamps. PostgreSQL
serializes queue and calendar writes on the equipment row. An automated job
advances the queue and an authenticated SSE stream refreshes the calendar.
The existing in-app and Web Push delivery paths handle offers.

The initial queue rule tests failed because the rule module was absent.
A later integration run returned `404` instead of `200` for an existing
photo test because the new fixture changed the operator role. Restoring
the role after the fixture fixed the failure with existing assertions intact.
The 17 backend tests, three PostgreSQL 17 suites, frontend build and ledger
check passed. A disposable Compose project applied migration 016 and passed
HTTP and SQL checks. Chromium exercised the full-day panel, two simultaneous
resident views, early finish, offer acceptance and the inbox at desktop and
phone widths.

The owner confirmed that the manual Issue #10 checklist passed on the local
app, including the edge cases, Web Push with the app closed on a physical
phone, and reconnection with both a valid offer and an expired one.

## 2026-11-26 · Notification count on the installed app icon

**Model:** GPT-6.2-Sol (Codex).

The owner requested the unread count on the phone's Home Screen icon. Web Push
now includes the recipient's unread total at delivery. The service worker updates
the icon through the Badging API where available and still shows the push alert.
It uses the authenticated count when available, with the push total as a fallback
if the session or network is unavailable. The open app keeps the icon and its
navigation count in sync when the resident selects **OK**. The icon clears at
zero, when local alerts are disabled, or on sign-out.

The new sender test initially found a payload containing only the notification
ID. The worker simulation initially recorded no badge update. After the change,
the sender, PostgreSQL dispatch and worker simulations passed. Chromium verified
the count moving from 2 to 1 to 0 with a simulated platform badge. Updated the
worker served by the running local frontend and verified that it matched the
source. The owner tested the installed app on a physical phone and confirmed
that the unread count appeared on its Home Screen icon. The README includes
the test procedure and the Android launcher limitation.

## 2026-11-26 · Cămin 3 resident portal design and report navigation

**Model:** GPT-6.2-Sol (Codex).

The owner chose the building-and-tree logo reference and a layout that uses the
laptop width. Recorded the approved tokens and the screen registry in
[DESIGN.md](docs/design/DESIGN.md) and [registry.yaml](docs/design/registry.yaml).
The [DS-008 draft](docs/design/mocks/ds-008-rezervare.html) demonstrates booking
with empty, loading, error, success and long-text states. The initial draft
covered light and dark themes. The owner subsequently chose a light-only portal
with a pale sage sidebar and a cream background. Arial now applies throughout
the application. **Bun venit** and **Autentificare** share a generated illustration
of a campus residence at dusk behind their existing forms.

On laptops, Resurse uses a multi-column layout and the booking calendar places
availability beside the form. On phones, the two panels stack and navigation is
at the bottom. Date selection keeps keyboard focus. The redesign keeps the
existing start and end rules and displays usage and handover separately.
**Contul meu** is the shortcut at the bottom of the desktop sidebar.

The owner asked for **Sesizări** in the navigation for Admin and Administrator.
It opens the existing maintenance queue. Rezident keeps **Sesizările mele** and
the submission and repair confirmation actions. Operators retain report pickup
and resolution. The API rejects new report submissions from operator accounts.
An old personal report URL redirects operators to the maintenance view while
preserving its report anchor. The new integration assertion first received
`201` instead of `403` for an operator submission, and the first browser test
found no **Sesizări** link. Both passed after the change.

The local administrator setup transferred the single owner slot to the address
provided by the owner and left the previous account in the database. Created
the reserved test Admin in local test mode. Verified sign-in and admin access
for both accounts. Password setup messages went to local Mailpit. The database
stores password hashes.

The existing access work was merged into `main` in
[PR #21](https://github.com/AlexBarac7/app-camin/pull/21) after its checks passed.
The explanatory guide remains in the locally ignored `explicatii/` directory.

Before committing `feat/resident-portal-design`, all 15 backend unit tests,
the three PostgreSQL integration suites, the frontend build, Compose validation
and the ledger check passed. Chromium verified the portal and DS-008 at 320,
390, 1280 and 1440 pixels, the access page artwork, navigation for all three
roles, reservation and report actions with mocked API responses, and badge
updates. The running local database reported migrations through 015 applied.

## 2026-11-26 · Password reset by email

**Model:** GPT-6.2-Sol (Codex).

The owner approved D-023. **Am uitat parola** accepts an email address and
gives the same confirmation for any valid address. SMTP sends a link for an
existing account. Migration 015 stores the latest link's hash and its 30-minute
expiry. Completing the reset consumes the link, changes the password and
deletes existing sessions atomically. Login checks the verified password hash
again under an account lock before creating a session. PATTERN-015 records that
practice as a candidate.

The new unit and PostgreSQL authentication tests initially received `404`
instead of `400` and `202` respectively, because the reset routes were absent.
After implementation, all 14 backend unit tests, all three PostgreSQL suites,
the frontend build and the Compose configuration check passed. The PostgreSQL
test checked expiration, concurrent submissions, reuse, a second reset and a
login that had already read the old hash when the reset completed. Chromium
with a private Mailpit and a disposable database verified the generic message,
captured SMTP email, form validation, session revocation, sign-in with the new
password, reuse rejection and a second reset. The ledger check initially
flagged the missing `Why` field in D-023 and passed after it was added.

The migration and mail checks ran on temporary services. The existing Compose
services and their volumes were preserved. No external email was sent.

The existing local backend subsequently returned `500` on a reset request.
Its container still listed migrations only through 014. Copied migration 015
into the running backend and applied it through `npm run migrate`. The local
frontend proxy then returned the expected `202` with an empty body for an
unknown demonstration address. Mailpit returned `200`. The services stayed
running throughout the fix.

## 2026-11-26 · Invitation email and resident activation password

**Model:** GPT-6.2-Sol (Codex).

The owner approved SMTP delivery from **Aprobă și trimite invitația** and an
eight-character minimum on the resident activation screen. The email contains
Romanian plain-text and HTML versions, a button for the activation link and the
48-hour expiry. Migration 014 records the delivery attempt. When SMTP fails,
the request can be retried and replaces the earlier one-time link.

Before implementation the new password assertion found the old message
`Parola trebuie să aibă între 15 și 128 de caractere.` Backend tests, the
three PostgreSQL suites, the frontend build and the knowledge ledger passed
after the change. Integration covered concurrent approval and retry and a
simulated SMTP rejection. Chromium and a disposable Mailpit mailbox exercised
the complete flow from a request through a captured email, rejected seven
characters, and accepted eight characters for activation and sign-in.

Rebuilt the local Compose stack with Mailpit on loopback port 8025, applied
migration 014, and kept the local test mailbox available for the owner.

## 2026-11-26 · Welcome, access requests and account roles

**Model:** GPT-6.2-Sol (Codex).

The owner approved a public email request, Admin approval and manual delivery
of the copied invitation link. The Romanian welcome page places the message
beside the sign-in form on desktop and above it on phones. Migration 013,
D-021 and C-003 record the access flow, current account roles and the local
test exceptions. Admin and Administrator share equipment, report and
reservation-history access. Admin manages invitations and account roles and
can view the technical pages.

The first PostgreSQL run returned 500 for new access requests. The prior
notification constraint required an equipment or report reference. Migration
013 now recognizes access requests as a distinct kind with neither reference.
The auth integration suite passed, including concurrent requests and
approvals, session role changes, test account isolation and Docker-compatible
grant and revoke behavior. Existing unit, migration and reservation checks,
the frontend build, Compose configuration and ledger validation passed.

Chromium verified the welcome layout at 1440, 390 and 320 pixels, the Admin
notice, copying and using the link, and the role change in Contul meu. The
first browser run timed out on the role selector's label. An explicit label
association corrected it and the complete browser flow passed.

## 2026-11-25 · Phone acceptance of optimized photo uploads

**Model:** GPT-6.2-Sol (Codex).

The project owner confirmed that a report with a large photo submitted
quickly from a physical phone. The attachment opened from its thumbnail,
zoom worked, and the close button returned to the report.

## 2026-11-25 · Slower phone report uploads

**Model:** GPT-6.2-Sol (Codex).

The project owner reported an intermittent `Load failed` after submitting
from the phone. The desktop HTTPS route returned in about 40 ms, while
Tailscale pings to the connected iOS device ranged from 703 to 1,429 ms.
The local database had one recent report with a photo. That observation
did not identify which submission produced it.

The form now reads the selected photo before clearing the device picker
and resizes large images before uploading when the browser can decode them.
The server still validates and normalizes every attachment. A synthetic
12-megapixel JPEG fell from 6,198 KiB to 491 KiB in the browser upload test.
The backend runs HEIC decoding in a worker so other requests can progress.
For the test HEIC, a 100 ms timer fired after 1,729 ms before the change
and 100 ms afterwards. Simulated connection loss verified that the form
keeps the draft and asks the resident to check report history before retrying.
The subsequent physical phone check is recorded above.

## 2026-11-25 · Full-screen report photo viewer

**Model:** GPT-6.2-Sol (Codex).

The project owner reported that opening an attachment in a separate tab
made it hard to return on the phone. The report now shows an inline thumbnail.
Tapping it opens a full-screen viewer with zoom controls, pinch and drag
gestures, and a close button. The zoom percentage resets the image to fit
the screen. The close button and Escape return focus to the thumbnail in
the same report. The README describes these controls.

Chromium verified the resident and operator views at 390 and 1280 pixels,
including simulated pinch, panning, closing and focus restoration. The
first desktop check timed out because its test fixture missed the operator
list URL. The corrected browser check, frontend build and ledger check passed.

## 2026-11-25 · Single report photo control

**Model:** GPT-6.2-Sol (Codex).

The project owner found that the phone's upload picker offers both the
camera and gallery. Equipment and general reports now share one
**Încarcă o poză** control. Chromium verified file selection in both forms.

## 2026-11-25 · Maintenance reports and private photos

**Model:** GPT-6.2-Sol (Codex).

**What I asked for** — Complete the approved issue #16 scope. Extend reports
to rooms and shared spaces, assign priority at pickup, and support one
optional camera or gallery photo that stays in the report history.

**What I got** — Migration 012 extends the existing report and notification
tables, keeping the equipment path and the four report states. The room
and shared-space form captures category, location and optional floor.
Operators use the same permission for all reports and choose priority at
pickup. The backend bounds image uploads, re-encodes them as JPEG and strips
metadata. It checks the report author's or operator's current permission
before downloading from private S3-compatible storage. The local Compose
`photos` profile uses SeaweedFS. D-020 and Q-014 record the approved
behaviour and PATTERN-012 records the attachment access practice.

**Checks** — The new integration test first returned `400` instead of
`201` because the pilot only accepted equipment reports. The 13 backend
tests, all three PostgreSQL suites, frontend build and ledger validation
passed after implementation. The existing equipment test fixture now
supplies a pickup priority and keeps its original assertions. Applying
migration 012 to a pilot test database preserved its four equipment reports.

A disposable Compose stack verified upload and download against SeaweedFS.
Chromium at 390 and 1280 pixels exercised gallery upload with a synthetic
HEIC image, the equipment photo field, operator priority, photo retention
after verification and access denial for another resident. The image was
still readable through the signed storage client after restarting SeaweedFS.
A direct anonymous request for the stored object returned `403`. The
camera input was exercised with a file fixture. Native camera capture on a
physical phone remains a manual acceptance check.

## 2026-11-25 · Manual acceptance of laundry reports

**Model:** GPT-6.2-Sol (Codex).

The project owner confirmed that all cases in the manual checklist behaved
as expected. The checklist covered report submission, access permissions,
concurrent actions, restoration and Reservations, optional verification and
checkmark removal, and Web Push with the app closed. The owner did not
specify device models or browser versions.

## 2026-11-25 · Laundry equipment reports

**Model:** GPT-6.2-Sol (Codex).

**What I asked for** — Implement the approved laundry reporting pilot. Any
invited resident can report a washer or dryer. An authorized operator takes
and resolves the report, and the author can optionally verify the repair
after it closes. The equipment mark lasts 48 hours or until a new fault is
reported. Use Web Push for operators on new reports and for the author on
resolution. Defer photos, priority and email fallback.

**What I got** — Migration 011 adds reports, notification links and the
temporary equipment mark. The report form uses the inventory. Residents can
follow their own reports, and operators can take, resolve and explicitly
return equipment to service. The existing restoration offers still apply.
The report author can confirm the repair without changing reservation rights.
D-019 records the approved behaviour in English. PATTERN-011 describes the
equipment revision check as a candidate. Migration 010 separately records
the confirmed condition of dryers 1A and 2A in Laundry Room 2.

**Checks** — The new integration test first returned `404` instead of
`401` because the report route was missing. All 13 backend tests, the three
disposable PostgreSQL suites, the frontend build, ledger validation and the
whitespace check passed. The reservation suite checked report permissions,
concurrent transitions, notification recipients, restoration of equipment
with an unconfirmed status and the verification expiry. Chromium exercised
both roles across 390 and 1280 pixel viewports, including the inbox links and
the equipment mark appearing and clearing. Its first launch failed with
`libnspr4.so: cannot open shared object file`; temporary libraries allowed
the rerun.

Migration 011 was applied to the local Compose database. The first Compose
status command lacked the shell password. The backend watcher also returned
`ERR_MODULE_NOT_FOUND` while the new route was being written. After a
restart, the backend and database were healthy, and the signed-out API
returned `401` through the frontend. The automated tests verified queued
Web Push deliveries. The owner's manual device check is recorded above.

## 2026-11-25 · Issue #9 delivery checks

**Model:** GPT-6.2-Sol (Codex).

The owner confirmed Web Push delivery with the desktop tab closed and verified
that clicking the alert opens the unread notice in the resident account. The
owner also confirmed the flow on iPhone through the installed web app. The
iPhone test first received `403 BadJwtToken` from Apple. Using the test HTTPS
origin as the VAPID subject with the same key pair returned `201`. Development
requests from localhost and the configured HTTPS origin both pass the origin
check for logout. Live-queue requirements are tracked in issue #10.

The 13 backend tests, all three disposable PostgreSQL suites, the frontend
build, ledger validation, and diff whitespace check passed before publication.
Web Push delivery and navigation on a physical Android device remain pending.

## 2026-11-25 · Unread count and acknowledgement

**Model:** GPT-6.2-Sol (Codex).

The resident navigation shows the number of unread notifications. Selecting
**OK** acknowledges one notice and keeps it in the inbox. Migration 009
persists the read timestamp. Existing notices start unread, as approved in D-018.

The new PostgreSQL assertions first failed because the inbox lacked
`readAt`. The reservation suite then passed, including account isolation
and idempotent acknowledgement. All 13 backend tests, the frontend build
and the ledger check passed. Chromium with a simulated server verified
the count changing from 0 to 2 to 1 to 0, with notices kept after reloading.

## 2026-11-25 · Laundry notifications and restoration offers

**Model:** GPT-6.2-Sol (Codex).

Implemented the three reservation notification flows in issue #9. Equipment
shutdown publishes targeted notices. An authorized operator can send one
editable notice per inspection. On restoration, eligible reservations get
five-minute offers that block competing bookings until response or expiry.
Accepted offers create new reservations and preserve the cancelled originals.
Migration 008 adds the inbox, offers and pending Web Push deliveries. D-017
records opt-in Web Push for the pilot. PATTERN-010 records the delivery
transaction as a candidate. Live-queue integration remains open.

All 13 backend tests, the PostgreSQL migrations, authentication and
reservations suites, the frontend build, and the ledger check passed.
The first reservations run exposed an untyped PostgreSQL parameter
(`column "machine_id" is of type integer but expression is of type text`).
The query now types parameters explicitly. The disposable Compose project
applied all eight migrations and verified the tables, frontend assets and
HTTP 401 on the unauthenticated notifications API. Chromium exercised
inspection, shutdown, restoration, acceptance and a simulated service-worker
alert at 390 and 1280 CSS pixels. The upgrade test preserved a preexisting
cancellation and created an offer only after restoration. The temporary
Chromium profile returned `AbortError: Registration failed - permission denied`
and the isolated persistent profile could not complete subscription, so real
desktop delivery was not verified. Android and iPhone verification requires
test devices and a private HTTPS test origin.

## 2026-11-24 · Clear calendar notices after equipment restoration

**Model:** GPT-6.2-Astra (Codex).

The resident calendar shows cancellations for the current fault. Restoration
clears the notices while keeping cancelled bookings and their reason in history.
Migration 007 tracks the shutdown timestamp. For machines already broken at
upgrade, it uses the most recent recorded fault cancellation if one exists.

## 2026-11-24 · Explain retained bookings during equipment inspection

**Model:** GPT-6.2-Astra (Codex).

The resident calendar now explains that a booking affected by inspection is
kept and the equipment can be used after restoration within the reserved usage
time. Chromium checks with simulated reservations at 390 and 1280 pixels
verified the notice on the resident's upcoming booking, its absence on the
original cycle and another resident's booking, and its removal after restoration.
The frontend build passed.

## 2026-11-24 · Local preview of equipment management

**Model:** GPT-6.2-Astra (Codex).

At the owner's request, rebuilt and started the local frontend and backend
against the existing PostgreSQL volume on the equipment-faults branch. Applied
migration 006 after verifying that 001–005 were already applied. Compose
reported healthy backend and database services. The frontend equipment page
returned HTTP 200 and the protected equipment-access API returned HTTP 401
without a session. The services were left running for manual review. At startup
zero accounts held the new equipment permission. Its grant command prompts for
the intended operator's email.

## 2026-11-24 · Laundry equipment faults and manual restoration

**Model:** GPT-6.2-Astra (Codex).

The owner approved the operational part of issue #9, separate equipment
permissions, and updating the migration-history assertion to check 005 followed
by 006. Operators can schedule inspection, stop equipment or restore service.
Fault cancellations keep planned times and the reason. The calendar exposes
these cancellations only to their owner. D-014 records the pilot rules.

The new status test initially reported inspection instead of occupied during the
original cycle. The migration-order test initially found no 006. All ten backend
tests and all three disposable PostgreSQL suites subsequently passed, including
concurrent booking, rollback and repeated shutdown. Compose applied all six
migrations. Chromium exercised navigation, shutdown, resident equipment status
and restoration at 390 and 1280 CSS pixels. Push notifications and Live-queue
remain follow-up work in issue #9.

## 2026-11-23 · Addressed the PR review findings

**Model:** GPT-6 (Codex).

**What I asked for** — Review PR #12 with three read-only specialists and
address the confirmed findings before merge.

**What I got** — Equipment cards refresh at the next known status transition,
on return to the tab and periodically for changes by other residents. The
calendar advances from the server time reported in the response instead of
counting request latency as clock skew. Booking queries receive parsed
timestamps. The two admin pages have distinct document titles, and calendar
navigation announces the selected date through a polite live region.

**Verification** — The new PostgreSQL regression reproduced HTTP 500 before the
fix and passed after it. All backend and PostgreSQL suites, the frontend build
and ledger validation passed. Chromium verified status transitions, refreshing
when the tab becomes visible, cancellation with a delayed response, distinct
admin titles and the calendar live region.

## 2026-11-23 · Laundry reservations and administrative data views

**Model:** GPT-6 (Codex).

**What I asked for** — Implement the approved reservation plan for issue #8,
add read-only administrative views for reservations and database tables, and
extend the closing-time exception so a washer can be used from 16:45 and a
dryer from 15:45 until 20:00 without handover.

**What I got** — Migration `005` adds reservation history. The backend
locks the equipment row before checking overlapping blocks, including handover.
Residents can browse a daily calendar, preview usage and handover, book working
equipment, and cancel their own reservations before they start. A conflict
refreshes the calendar. Other residents see only the occupied interval.
Equipment cards show current occupancy and list the next reservation separately.

The existing service-status authorization also protects `/admin/rezervari`
and `/admin/baza-de-date`. The first page filters reservation history by
equipment, day and status. The second shows paginated equipment, reservation
and migration records with column names and types. Both are read-only.

Q-009 records the pilot calendar and notebook rules. D-011 remains proposed.
D-012 records access to the administrative views, and D-013 records the approved
closing-time thresholds. The decision index regenerates in numeric order. Future
decisions should be grouped by subject in an existing topic file whenever one
applies. Laundry decisions use [laundry-decisions.md](docs/agents/decisions/laundry-decisions.md)
and administrative data decisions use [admin-data.md](docs/agents/decisions/admin-data.md).

**Verification** — Nine backend tests, the migrations, authentication and
reservations suites on disposable PostgreSQL databases, the frontend build,
ledger validation and `git diff --check` passed during implementation. A
disposable Compose stack applied migration `005` and rejected an unauthenticated
calendar request. Chromium at 390 px verified booking, privacy, cancellation,
conflict refresh, closing-time previews, admin filters, keyboard pagination and
resident access denial. PostgreSQL checks covered simultaneous requests,
the handover boundary, cancellation and both closing-time thresholds.
The occupancy transitions were verified through the API using simulated
reservation times. The owner confirmed administrative access denial for the
test resident and reported that the manual checks passed except for the
closing-time case, which led to the approved change. Real-time occupancy
transitions on the card remained untested manually after closing.

**Follow-up** — The push reminder is separate work. The branch changes were
local and uncommitted when this entry was added.

## 2026-11-23 · Laundry reservations, equipment faults, and follow-up issues

**Model:** GPT-6.2-Sol.

**What I asked for** — Record the confirmed drying room schedule, reservation
occupancy and fault handling. Create GitHub issues for later implementation
and complete the model field in every journal entry.

**What I got** — Q-007 records the Monday–Friday, 08:00–20:00 drying schedule.
Q-008 records occupancy at the start of the reserved interval and the need
for a calendar. D-009 records targeted notifications. D-010 and Q-011 record
cancellations, reservation history and removal from the active Live-queue
after a confirmed defect. The implementation and remaining questions are
tracked in [#8](https://github.com/AlexBarac7/app-camin/issues/8),
[#9](https://github.com/AlexBarac7/app-camin/issues/9) and
[#10](https://github.com/AlexBarac7/app-camin/issues/10).

**Verification** — Checked the model fields against Codex session history.
The ledger checker and `git diff --check` passed.

## 2026-11-23 · Resident welcome and protected service status

**Model:** GPT-6.2-Sol.

**What I asked for** — Implement the approved welcome and service status plan on
the inventory branch after the manual inventory review and commit.

**What I got** — The welcome page checks for an existing session and offers
sign-in. The admin status page checks permission before loading the cards.
Migration `004` limits the permission to one account. The local
`service-status:access` command grants or revokes it. Compose uses the same
four-second PostgreSQL probe through an unpublished backend loopback listener.
D-008 and C-002 record the approved behavior.

**Verification** — Seven backend tests, both PostgreSQL integration suites, the
frontend build and the ledger passed. In a disposable Compose stack, the
internal probe returned 503 in 4.05 seconds with PostgreSQL paused and returned
200 after unpause. Chromium at 390 × 844 verified welcome navigation, admin
authorization, access failure while PostgreSQL was stopped, and recovery.
The owner confirmed the expected behavior during manual testing.

## 2026-11-23 · Resident resources and laundry inventory

**Model:** GPT-6.2-Sol.

**Workflow** — Graffino `/build` from the approved plan.

**What I asked for** — Let residents find laundry equipment by its physical
label on a phone and check its location, technical condition and operating hours where known.

**What I got** — Migration `003` adds the 30 pieces of equipment from
[INTERVIEW.md](INTERVIEW.md). Residents land on **Resurse** and can open a room
or **Contul meu**. Room cards keep **Defectă** or **Ocupare necunoscută** visible
and expand to show the technical condition and operating hours where known. Q-007–Q-010
record the operating questions that remain open.

**Verification** — Six backend tests, both PostgreSQL integration suites, the
frontend build and ledger validation passed. The migration was verified on a
fresh database and against existing records. Compose started successfully,
and the health, readiness and unauthorized catalog checks passed. The local
migration was applied and exactly two confirmed demonstrative rows were
removed. The local inventory contains 30 pieces of equipment. Chromium at
390 px verified sign-in, direct links, room navigation, closed card status,
touch and keyboard expansion, and sign-out.

## 2026-11-23 · Residence administrator input and interview summary

**Model:** GPT-6.2-Sol.

**What I asked for** — Review the current implementation and the Graffino
workflow, then summarize the information obtained from discussions with the
residence administrator and the head of the residence.

**What I got** — Added [INTERVIEW.md](INTERVIEW.md) with the laundry inventory,
equipment condition, operating hours, quiet hours, and the current process for
reporting defects. The summary identifies details that remain unspecified.

**What I did with it** — I’ll use the inventory and documented residence rules
to guide the next stages of development.

**Verification** — Backend tests, PostgreSQL integration tests, the frontend
build, and ledger validation passed.
[PR #7](https://github.com/AlexBarac7/app-camin/pull/7) added only
`INTERVIEW.md` and was merged into `main`.

## 2026-11-22 · Read-only laundry catalog

**Model:** GPT-6.2-Sol.

**Workflow** — Graffino `/plan` and `/build`.

**What I asked for** — Build a laundry catalog residents can open from their
account. Record the unresolved management roles and permissions for later
discussion. Document the work and show the changes for review before committing.

**What I got** — On `feat/laundry-catalog`, migration `002` creates an empty
laundry inventory. The protected `GET /api/laundry-machines` endpoint returns
machine names and locations ordered by ID. The Romanian catalog screen links
from the account page and handles loading, an empty list, errors and sign-in
redirection. [D-007](docs/agents/DECISIONS.md#d-007--require-resident-authentication-to-read-the-laundry-catalog)
records resident access. [Q-006](docs/agents/OPEN-QUESTIONS.md#q-006--who-manages-the-laundry-catalog-and-with-what-permissions)
tracks catalog management, and `PATTERN-006` records shared session verification
as a candidate practice.

**What I did with it** — I checked the empty catalog in the browser, then asked
for two demonstrative machines in the local database. I confirmed that the
machines and locations appeared and that opening the page after signing out
redirected to sign-in.

**Verification** — Backend tests, PostgreSQL integration suites, frontend build,
ledger validation and Compose smoke checks passed. Integration covered the empty
catalog, ordering and fields for two machines, and HTTP 401 for absent and expired
sessions. The owner confirmed the manual browser checks.

## 2026-11-21 · Manual cleanup of expired sessions

**Model:** GPT-6.2-Sol.

**Workflow** — Graffino `/build` from the approved cleanup plan.

**What I asked for** — Add and test a manual backend command to remove expired
sessions, then commit, push and verify GitHub Actions before merging.

**What I got** — The `sessions:cleanup` command reuses the PostgreSQL connection
and deletes rows whose expiry is at or before the statement timestamp. It
reports the number deleted, closes the connection and returns a nonzero exit
code on failure. The [README](README.md#clean-up-expired-sessions) documents local
and Compose usage.

**What I did with it** — I opened PR #5 after the branch was pushed and merged
it after checking the PR and its CI results.

**Verification** — A disposable PostgreSQL database confirmed that the first
run deletes one expired session, the second deletes zero, and the active session
still authenticates. Backend tests, frontend build, ledger validation and the
Compose smoke check passed. Compose also confirmed exit code 1 on a database
error. Both [GitHub Actions jobs for PR #5](https://github.com/AlexBarac7/app-camin/actions/runs/44950511812)
passed.

## 2026-11-21 · Local resident access by invitation

**Model:** GPT-6.2-Sol.

**Workflow** — Graffino `/build` from the approved invitation plan.

**What I asked for** — Implement and demonstrate local resident access from
a separate branch based on the updated main branch. Document the session
and keep a local explanation before committing.

**What I got** — On `feat/resident-invitations`, the first product migration
adds users, invitations and sessions. The backend can issue and revoke
invitations from the terminal, and the Romanian screens let a resident
activate an account, sign in, see their email and sign out. Invitations
are single-use and expire after 48 hours. Account creation and invitation
consumption share one transaction. Sessions expire after 24 hours.
PostgreSQL stores token digests and scrypt password hashes. The
[README](README.md#local-resident-access) records the commands and
[D-006](docs/agents/DECISIONS.md#d-006--activate-local-resident-accounts-by-invitation)
records the approved access rules.

**What I did with it** — I ran the flow myself in a separate Compose preview
and confirmed that the observed behavior matched expectations. I asked to
inspect the PostgreSQL tables and authorized a local commit after documentation
and final checks.

**Verification** — Backend tests, frontend build, ledger validation and
`git diff --check` passed. The PostgreSQL 17 integration tests covered the
migration runner, invitation lifecycle, concurrent activation and session
expiry and invalidation. The isolated Compose preview passed the CLI and
API smoke checks. Chrome passed the full flow using the keyboard at 390 px,
including session persistence after reload and redirection after logout.
PostgreSQL listed `users`, `invitations`, `sessions` and `schema_migrations`.

## 2026-11-21 · P20 project brief and PostgreSQL migrations

**Model:** GPT-6.2-Sol.

**Workflow** — Graffino `/plan` and `/build`.

**What I asked for** — Save the original P20 brief in [CONTEXT.md](CONTEXT.md)
and prepare PostgreSQL migrations while waiting for the administrator's inventory
and rules. Plan the migration workflow through a questionnaire and keep the work
on a separate branch from the resident dashboard.

**What I got** — The full P20 brief and a migration runner on
`chore/postgres-migrations`. The runner uses the existing Node.js PostgreSQL
driver. It applies numbered SQL files in order and records the filename and
SHA-256 checksum of each applied migration. Each file and its history entry
commit together. A PostgreSQL advisory lock prevents concurrent applications,
and a separate status command reads the history without changing the database.
The [README](README.md#postgresql-migrations) documents the Compose commands
and shows how to recover from a failed migration.

**What I did with it** — I chose manual execution through Docker Compose,
one transaction per file, a new migration to correct an already-applied
change, and separate local integration tests. I asked to bring the P20 brief
and migration work together on the same branch. The migration directory is
ready for the first product schema once the pilot rules are confirmed.

**Verification** — The PostgreSQL 17 integration tests passed on a disposable
database, covering read-only status, rollback and retry, checksum mismatch,
and concurrent runs. The five existing backend tests, frontend build, ledger
check, and `git diff --check` passed. Compose services became healthy, both API
health endpoints responded successfully, and `SELECT 1` returned `1`.
A separate preview stack was started for manual testing. Its status command
reported `No migration files.`, as expected with an empty migration directory.

## 2026-11-18 — Project decisions, vocabulary, and local acceptance

**Model:** GPT-6.2-Sol.

### What was asked and done

The owner asked for the approved stack choices and their reasons in Graffino's decision format.
The assistant added three entries to [DECISIONS.md](docs/agents/DECISIONS.md)
and preserved 2026-11-11 as the date of each decision.

The owner also approved [D-004](docs/agents/DECISIONS.md#d-004--keep-local-environment-values-out-of-git).
Git ignores the local `.env` and tracks `.env.example` as a template without secrets.
The assistant verified both rules with `git check-ignore` and `git ls-files`.

The owner started the project glossary in [CONTEXT.md](CONTEXT.md) with
**Reservation** and **Live-queue**. The assistant drafted and refined the
Live-queue definition and recorded `waiting list` as a term to avoid.

### Tests and manual checks

The ledger check, frontend build, and all five backend tests passed.
The owner later confirmed that the local Compose, API, SQL, and browser checks behaved as expected.
This included the database status changing to unavailable after a stop and recovering after restart.

## 2026-11-16 — GitHub Actions workflow

**Model:** GPT-6.2-Sol (default).

### What was asked

Add a GitHub Actions workflow to check the application after every push.

### What was done

1. Added [ci.yml](.github/workflows/ci.yml) in commit `0d2aff2`.
   It runs on every push, on pull requests targeting `main`, and on manual dispatch.
2. Configured a Linux runner with Node.js 22 and Python 3. The job installs both applications
   from their lockfiles, runs the backend tests, builds the frontend, and validates the ledger.
3. Documented the workflow in the [README](README.md#continuous-integration)
   and recorded the CI approach as a candidate in [PATTERNS.md](docs/agents/PATTERNS.md).

### How and why

The workflow reuses the local checks and needs only read access to repository contents.
The backend tests use controlled substitutes for database behavior and a local TCP server.
The frontend check compiles production assets. Compose integration, real PostgreSQL connectivity,
and browser behavior are covered by separate local checks.

### Commands and outcomes

Both `npm ci` runs, all five backend tests, the Vite 7.3.8 production build,
the ledger checker (including `--fix`), and `git diff --check` passed locally.
The initial sandbox runs reported `EAI_AGAIN registry.npmjs.org` during
dependency installation and `ERR_TEST_FAILURE` during backend tests.
The reruns passed with network and local socket access.

PostgreSQL was healthy while the backend was unhealthy. The database logs
showed a password authentication failure, and manual verification confirmed
recovery after the password was corrected. The API, SQL, and full acceptance
checks were skipped in this run. A supplied screenshot showed the status page
during the outage. Automated browser, keyboard, and viewport checks were skipped.

### GitHub Actions results

All CI checks passed on GitHub Actions.

## 2026-11-11 — Project setup and implementation proposal

**Model:** GPT-6.2-Sol (default).

### What was asked

Initialize the project, choose the stack with the owner, and provide an implementation proposal.

### What was done

1. Set up the base Graffino workflow and knowledge ledger.
2. Selected React, Tailwind CSS, and Vite for the frontend. Selected Node.js,
   Express, REST, and PostgreSQL for the backend. Selected Docker and Compose for local development.
3. Delivered an implementation proposal covering the technical foundation and the order of future product work.
   The [README roadmap](README.md#indicative-roadmap) records the project's staged approach.
4. Implemented the foundation with separate frontend and backend directories, a status page, liveness
   and readiness endpoints, and a local PostgreSQL service. Git dates the foundation commit
   `a63130c` to 2026-11-12.

### Why and files touched

The owner chose approachable frontend tools and wanted to learn the recommended backend technologies.
Docker and Compose came from the project requirements.
The approved stack decisions use the owner's date of 2026-11-11 in
[DECISIONS.md](docs/agents/DECISIONS.md). The implementation lives in
[frontend/](frontend/), [backend/](backend/), and [compose.yaml](compose.yaml).
The [health API contract](docs/agents/CONTRACTS.md#c-001--technical-health-api) records the approved behavior.

### Tests and manual checks

On 2026-11-12, all five backend tests passed, including the silent TCP peer
test at approximately 4.01 seconds. The Vite 7.3.8 production build, ledger
check, and `git diff --check` passed. Existing test assertions were preserved.

Both Docker images built with `npm ci`, and all three services started in an
isolated `app-camin-qa` project with a temporary in-memory PostgreSQL database
and a process-local password. The containers and network were removed after
the run. The development database was left intact. The frontend served
compiled JSX, the backend liveness endpoint responded, and the Vite API
proxy worked. `SELECT 1` returned one row. Readiness returned 503 in 4.01
seconds with PostgreSQL paused and recovered after unpause and restart.

Initial sandbox checks reported `getaddrinfo EAI_AGAIN registry.npmjs.org`
and `ERR_TEST_FAILURE`. Dependency installation and tests passed on rerun
with network and local socket access. A diagnostic command reported
`node: bad option: --test-isolation=none`. Compose validation reported
`required variable POSTGRES_PASSWORD is missing a value` before the shell
password was supplied and passed afterward.

The initial run skipped browser rendering, keyboard, viewport, and screenshot
checks because browser automation was unavailable. The owner later confirmed
that the manual acceptance checks passed.

### Next steps

The roadmap puts interviews and confirmation of business rules before product implementation.
