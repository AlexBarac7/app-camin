# Contracts — app-camin

<!-- graffino-agentic:begin v1 -->
> Promises across a boundary. **Provided:** this repo owns the contract; the text
> lives here only. **Consumed:** a link to the provider's entry plus the fields this
> repo relies on. **External:** what we rely on from a third-party service.
> Changing a provided contract is a PROPOSAL (AGENTS.md → The gate) and the plan
> lists the consumers' files too. Status: `approved` · `proposed` · `superseded-by`.
<!-- graffino-agentic:end -->

## Index
- C-001 · Technical health API · provided

## Provided

### C-001 · Technical health API
- **Status:** approved
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
- **Confirmed:** 2026-11-12

## Consumed

None yet.

## External

None yet.
