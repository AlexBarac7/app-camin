# Contracts — app-camin

<!-- graffino-agentic:begin v1 -->
> Promises across a boundary. **Provided:** this repo owns the contract; the text
> lives here only. **Consumed:** a link to the provider's entry plus the fields this
> repo relies on. **External:** what we rely on from a third-party service.
> Changing a provided contract is a PROPOSAL (AGENTS.md → The gate) and the plan
> lists the consumers' files too. Status: `approved` · `proposed` · `superseded-by`.
<!-- graffino-agentic:end -->

## Index
- C-001 · Technical health API · provided · _superseded-by C-002_
- C-002 · Authorized service status and internal readiness · provided

## Provided

### C-001 · Technical health API
- **Status:** superseded-by C-002
- **Interface:** GET /api/health returns HTTP 200 with
  `{ "status": "ok", "message": "Backend is running." }` without consulting PostgreSQL.
  GET /api/ready executes SELECT 1 and returns HTTP 200 with
  `{ "status": "ok", "database": "connected", "message": "PostgreSQL connection successful." }`.
  On database failure it returns HTTP 503 with
  `{ "status": "error", "database": "unavailable", "message": "PostgreSQL is unavailable. Check the database service and configuration." }`.
  Readiness responses use Cache-Control: no-store. The complete database probe
  has a 4,000 ms deadline, plus normal event-loop and HTTP delivery overhead.
  Database errors and credentials are never included in responses.
- **Consumers:** frontend/src/App.jsx; backend/test/health.test.js; compose.yaml.
- **Evidence:** Owner approved health/ready behavior and the four-second timeout
  in the implementation plan on 2026-11-12. Exact JSON is the initial technical
  contract established by that implementation.

### C-002 · Authorized service status and internal readiness
- **Status:** approved
- **Interface:** GET /api/admin/access returns 204 for the authorized account.
  GET /api/health and GET /api/ready preserve the probe response bodies and
  status codes specified in C-001 after authorization. All three endpoints
  return 401 for missing or expired sessions, 403 for valid sessions without
  permission, and Cache-Control: no-store on all responses. If session or
  permission lookup fails, the backend returns a generic server error.
  Compose uses GET /ready on the backend container's loopback listener. This
  listener is enabled by Compose, is unpublished, and uses the same readiness
  probe (including the 4,000 ms deadline) without a session lookup.
- **Consumers:** frontend/src/App.jsx; backend/test/health.test.js; compose.yaml.
- **Evidence:** Owner requested implementation of the approved welcome and service
  status plan, which supersedes C-001.
- **Confirmed:** 2026-11-23

## Consumed

None yet.

## External

None yet.
