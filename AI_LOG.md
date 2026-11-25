# AI work log — app-camin

This journal records the owner's requests, the assistant's work, and the checks performed.
It adapts the Graffino session journal to the project's base setup.
Add new entries at the top, in reverse chronological order.

## 2026-11-25 · Issue #9 delivery checks

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

The resident navigation shows the number of unread notifications. Selecting
**OK** acknowledges one notice and keeps it in the inbox. Migration 009
persists the read timestamp. Existing notices start unread, as approved in D-018.

The new PostgreSQL assertions first failed because the inbox lacked
`readAt`. The reservation suite then passed, including account isolation
and idempotent acknowledgement. All 13 backend tests, the frontend build
and the ledger check passed. Chromium with a simulated server verified
the count changing from 0 to 2 to 1 to 0, with notices kept after reloading.

## 2026-11-25 · Laundry notifications and restoration offers

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

The resident calendar shows cancellations for the current fault. Restoration
clears the notices while keeping cancelled bookings and their reason in history.
Migration 007 tracks the shutdown timestamp. For machines already broken at
upgrade, it uses the most recent recorded fault cancellation if one exists.

## 2026-11-24 · Explain retained bookings during equipment inspection

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
