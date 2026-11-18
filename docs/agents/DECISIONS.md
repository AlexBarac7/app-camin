# Decisions — app-camin

<!-- graffino-agentic:begin v1 -->
> Constraints the code must obey. Status: `approved` (obey) · `proposed` (do not
> build on it) · `superseded-by <ID>` (kept to explain old code).
> Adding or changing an entry needs the user's OK (AGENTS.md → The gate).
<!-- graffino-agentic:end -->

## Index
- D-001 · React, Tailwind CSS, and Vite for the frontend
- D-002 · Node.js, Express, REST, and PostgreSQL for the backend
- D-003 · Docker and Compose for local development
- D-004 · Keep local environment values out of Git

---

## D-001 · React, Tailwind CSS, and Vite for the frontend
- **Status:** approved
- **Date:** 2026-11-11
- **Rule:** Build the frontend with React, style it with Tailwind CSS, and use
  Vite for local development and production builds.
- **Why:** The owner chose these tools because they are approachable. React
  breaks the interface into reusable components with explicit props and state.
  Tailwind CSS uses utility classes to apply consistent spacing and typography
  and to express responsive styles. Vite provides fast feedback through hot
  module replacement and a production build for static assets.
- **Rejected:** No alternatives were recorded.
- **Evidence:** [Q-002](OPEN-QUESTIONS.md#q-002--which-stack-and-runtime-should-the-application-use),
  [frontend/package.json](../../frontend/package.json).
- **Source:** user · confidence medium

## D-002 · Node.js, Express, REST, and PostgreSQL for the backend
- **Status:** approved
- **Date:** 2026-11-11
- **Rule:** Run the backend on Node.js, use Express to expose a REST API, and
  store relational data in PostgreSQL.
- **Why:** The owner had never worked with these technologies and received a
  recommendation to use them for their advantages. Node.js lets the frontend
  and backend share JavaScript and supports asynchronous I/O. Express provides
  routing and middleware for organizing HTTP handlers. REST uses standard HTTP
  methods and status codes, so clients can call the API with standard HTTP
  tooling. PostgreSQL provides transactions, relational constraints that
  enforce data integrity, and indexes that speed up suitable queries.
- **Rejected:** No alternatives were recorded.
- **Evidence:** [Q-002](OPEN-QUESTIONS.md#q-002--which-stack-and-runtime-should-the-application-use),
  [backend/package.json](../../backend/package.json),
  [health.routes.js](../../backend/src/modules/health/health.routes.js),
  [db.js](../../backend/src/db.js).
- **Source:** user · confidence high

## D-003 · Docker and Compose for local development
- **Status:** approved
- **Date:** 2026-11-11
- **Rule:** Use Docker containers and Docker Compose to run the frontend,
  backend, and PostgreSQL together for local development.
- **Why:** The project requirements specified Docker and Compose.
- **Rejected:** No alternatives were recorded.
- **Evidence:** [Q-002](OPEN-QUESTIONS.md#q-002--which-stack-and-runtime-should-the-application-use),
  [compose.yaml](../../compose.yaml).
- **Source:** user · confidence high

## D-004 · Keep local environment values out of Git
- **Status:** approved
- **Date:** 2026-11-18
- **Rule:** Ignore the local `.env` file in Git. Keep `.env.example` tracked
  with non-secret defaults and example values.
- **Why:** Committed credentials can reach anyone with repository access and
  remain in Git history after deletion. The tracked example documents the
  local configuration and makes setup repeatable without exposing secrets.
- **Rejected:** No alternatives were recorded.
- **Evidence:** [.gitignore](../../.gitignore), [.env.example](../../.env.example),
  [README setup instructions](../../README.md#first-run).
- **Source:** user · confidence high
