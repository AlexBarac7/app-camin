# Patterns — app-camin

<!-- graffino-agentic:begin v1 -->
> How we build things here. Copy only `approved` entries. `candidate` = seen once or
> not yet confirmed; agents add these freely. Promotion needs the user's OK.
<!-- graffino-agentic:end -->

## Index
- PATTERN-001 · Separate app composition from process startup · candidate
- PATTERN-002 · Verify the technical foundation in GitHub Actions · candidate

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


