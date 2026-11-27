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
- PATTERN-007 · Share the readiness probe with a container-local listener · candidate
- PATTERN-008 · Serialize bookings on the equipment row · candidate
- PATTERN-009 · Serialize equipment faults with booking creation · candidate
- PATTERN-010 · Persist browser alerts with the event that produced them · candidate
- PATTERN-011 · Check the equipment revision before resolving a report · candidate
- PATTERN-012 · Authorize private report attachments through the report · candidate
- PATTERN-013 · Approve an access request and issue its invitation together · candidate
- PATTERN-014 · Record an invitation attempt before handing it to SMTP · candidate
- PATTERN-015 · Serialize credential changes and session creation on the account row · candidate

### [Laundry patterns](patterns/laundry-patterns.md)
- PATTERN-016 · Rebuild the live queue view from committed state · candidate
- PATTERN-017 · Serialize booking sanctions on the resident account · candidate

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

## PATTERN-007 · Share the readiness probe with a container-local listener
- **Status:** candidate
- **How:** Use one bounded database probe for an authorized browser endpoint
  and the container healthcheck. Enable the healthcheck listener in Compose,
  bind it to loopback inside the backend container, and leave its port unpublished.
- **Example:** backend/src/modules/health/health.routes.js; backend/src/server.js;
  compose.yaml.

## PATTERN-008 · Serialize bookings on the equipment row
- **Status:** candidate
- **How:** Lock the equipment row before testing whether a requested block overlaps
  an active reservation. Insert the reservation in the same transaction. Use
  strict boundary comparisons so adjacent blocks can share an endpoint.
- **Example:** backend/src/modules/laundry/reservations.routes.js;
  backend/test-integration/reservations.integration.js.

## PATTERN-009 · Serialize equipment faults with booking creation
- **Status:** candidate
- **How:** Take the same equipment row lock used by bookings, then commit the
  technical status and affected reservation cancellations in one transaction.
- **Example:** backend/src/modules/laundry/condition.routes.js and the
  concurrency and rollback cases in backend/test-integration/reservations.integration.js.

## PATTERN-010 · Persist browser alerts with the event that produced them
- **Status:** candidate
- **How:** Insert the resident notice and pending deliveries in the same
  transaction as the equipment change. Lease pending deliveries after commit
  and retry transient provider errors. Keep the notice readable in the app.
- **Example:** backend/src/modules/notifications/laundry-notifications.js;
  backend/src/modules/notifications/push.js.

## PATTERN-011 · Check the equipment revision before resolving a report
- **Status:** candidate
- **How:** Lock the equipment row before advancing the report. Compare its
  revision with the operator's view before restoring equipment. Record the
  revision at resolution and compare it again before showing a public
  verification mark.
- **Example:** backend/src/modules/laundry/reports.routes.js.

## PATTERN-012 · Authorize private report attachments through the report
- **Status:** candidate
- **How:** Save a re-encoded image under a server-generated object key and
  store the key in the report. Keep the key in the backend. Check the report
  author and current operator permission on every download, and serve the
  image with a private response that disables caching.
- **Example:** backend/src/modules/laundry/report-photos.js and
  backend/src/modules/laundry/reports.routes.js.

## PATTERN-013 · Approve an access request and issue its invitation together
- **Status:** candidate
- **How:** Lock the normalized email before changing the request or its
  invitation. Commit approval and the token hash together. Return the link
  to the approving Admin and persist the notice separately when the
  initial request is created.
- **Example:** backend/src/modules/auth/invitations.js and
  backend/test-integration/auth.integration.js.

## PATTERN-014 · Record an invitation attempt before handing it to SMTP
- **Status:** candidate
- **How:** Commit the invitation hash and attempt state before sending the
  email. Match the attempt hash when recording the result. An explicit retry
  can replace a failed or interrupted attempt without recovering a raw token
  from storage.
- **Example:** backend/src/modules/auth/invitations.js and
  backend/src/modules/admin/admin.routes.js.

## PATTERN-015 · Serialize credential changes and session creation on the account row
- **Status:** candidate
- **How:** Lock the account before changing its password or creating a
  session. Recheck the verified hash under the lock before inserting a
  session. Change the password and remove existing sessions in the same
  transaction.
- **Example:** backend/src/modules/auth/password-resets.js and
  backend/src/modules/auth/auth.routes.js.
