# AI work log — app-camin

This journal records the owner's requests, the assistant's work, and the checks performed.
It adapts the Graffino session journal to the project's base setup.
Add new entries at the top, in reverse chronological order.

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
