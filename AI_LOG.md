# AI work log — app-camin

This journal records the owner's requests, the assistant's work, and the checks performed.
It adapts the Graffino session journal to the project's base setup.
Add new entries at the top, in reverse chronological order.

## 2026-11-23 · Resident resources and laundry inventory

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

The [2026-11-16 verification record](README.md#verification-record--2026-11-16)
reports that both `npm ci` runs, all five backend tests, the frontend build,
the ledger check, and `git diff --check` passed locally.
The record also reports manual recovery after correcting the local database password.

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

The [2026-11-12 verification record](README.md#verification-record--2026-11-12)
reports five passing backend tests, a passing frontend build and ledger check, and successful local Docker, HTTP, and SQL checks.

### Next steps

The roadmap puts interviews and confirmation of business rules before product implementation.
