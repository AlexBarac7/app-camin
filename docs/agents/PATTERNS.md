# Patterns — app-camin

<!-- graffino-agentic:begin v1 -->
> How we build things here. Copy only `approved` entries. `candidate` = seen once or
> not yet confirmed; agents add these freely. Promotion needs the user's OK.
<!-- graffino-agentic:end -->

## Index
- PATTERN-001 · Separate app composition from process startup · candidate
- PATTERN-002 · Verify the technical foundation in GitHub Actions · candidate
- PATTERN-003 · Apply SQL and record migration history in one transaction · candidate
- PATTERN-004 · Serialize invitation changes for each email · candidate
- PATTERN-005 · Run integration suites on separate disposable databases · candidate
- PATTERN-006 · Reuse session verification on resident endpoints · candidate

---

## PATTERN-001 · Separate app composition from process startup
- **Status:** candidate
- **How:** Keep Express composition injectable and route modules under src/modules;
  isolate environment loading, the PostgreSQL pool and listening in separate files.
  Route tests can supply a database check without a real database server.
- **Example:** backend/src/app.js; backend/src/server.js;
  backend/src/modules/health/health.routes.js; backend/test/health.test.js.

## PATTERN-002 · Verify the technical foundation in GitHub Actions
- **Status:** candidate
- **How:** Run lockfile-based dependency installation, existing backend tests,
  frontend build, and read-only ledger validation in a temporary Linux environment
  on pushes and pull requests to main. Use read-only repository permissions and
  no business data, PostgreSQL service, or credentials.
- **Example:** .github/workflows/ci.yml; README.md (Continuous integration).



## PATTERN-003 · Apply SQL and record migration history in one transaction
- **Status:** candidate
- **How:** Acquire an advisory lock before checking migration history. For each
  pending file, commit its SQL and history entry together so a failed file stays
  pending while earlier successful files remain applied.
- **Example:** backend/src/migrations.js.

## PATTERN-004 · Serialize invitation changes for each email
- **Status:** candidate
- **How:** Lock the normalized email for issuance, revocation, and activation.
  Recheck invitation validity inside the transaction and consume the invitation
  together with account creation. Hash the password before acquiring the lock.
- **Example:** backend/src/modules/auth/invitations.js;
  backend/test-integration/auth.integration.js.

## PATTERN-005 · Run integration suites on separate disposable databases
- **Status:** candidate
- **How:** Start PostgreSQL for the integration job and create a fresh database
  for each suite so migration history and authentication fixtures stay isolated.
- **Example:** .github/workflows/ci.yml.

## PATTERN-006 · Reuse session verification on resident endpoints
- **Status:** candidate
- **How:** Use the same session middleware for account details and protected
  resident reads. Reject missing or expired sessions before querying the
  protected data, and set Cache-Control to no-store.
- **Example:** backend/src/modules/auth/auth.routes.js; backend/src/app.js.
