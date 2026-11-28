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
- D-005 · Apply versioned PostgreSQL migrations explicitly
- D-007 · Require resident authentication to read the laundry catalog
- D-009 · Notify only residents waiting to use defective equipment
- D-010 · Cancel affected reservations and Live-queue entries when equipment is defective
- D-011 · Use the application calendar for pilot laundry reservations · _proposed_ · [Laundry decisions](decisions/laundry-decisions.md)
- D-013 · Allow extended laundry use for blocks ending at 20:00 · [Laundry decisions](decisions/laundry-decisions.md)
- D-015 · Notify affected residents when equipment returns to service in time · [Laundry decisions](decisions/laundry-decisions.md)
- D-016 · Offer a five-minute hold when laundry service resumes · [Laundry decisions](decisions/laundry-decisions.md)
- D-017 · Deliver pilot equipment notifications in the app and through opt-in Web Push · [Laundry decisions](decisions/laundry-decisions.md)
- D-018 · Keep resident notices unread until acknowledged · [Laundry decisions](decisions/laundry-decisions.md)
- D-019 · Pilot digital reports for laundry equipment · [Laundry decisions](decisions/laundry-decisions.md)
- D-020 · Extend maintenance reports to rooms and shared spaces · [Laundry decisions](decisions/laundry-decisions.md)
- D-022 · Send approved invitations by email and let residents choose an eight-character password · [Admin data](decisions/admin-data.md)
- D-023 · Let account holders reset their password by email · [Admin data](decisions/admin-data.md)
- D-024 · Offer same-day laundry openings through Live-queue · [Laundry decisions](decisions/laundry-decisions.md)
- D-025 · Welcome newly activated accounts at first sign-in · [Admin data](decisions/admin-data.md)
- D-026 · Distinguish duplicate access requests and allow invitation replacement · [Admin data](decisions/admin-data.md)
- D-027 · Reject pending access requests and notify the applicant · [Admin data](decisions/admin-data.md)
- D-029 · Notify operators when a laundry strike is issued · [Laundry decisions](decisions/laundry-decisions.md)
- D-030 · Notify the reservation holder when a laundry strike is issued · [Laundry decisions](decisions/laundry-decisions.md)
- D-032 · Cancel only reservations starting during a laundry suspension · [Laundry decisions](decisions/laundry-decisions.md)
- D-033 · Show each resident their strike count and notify them of corrections · [Laundry decisions](decisions/laundry-decisions.md)
- D-034 · Show authorized operators whose reservation received a strike · [Laundry decisions](decisions/laundry-decisions.md)
- D-035 · Remind residents 15 minutes before laundry use ends · [Laundry decisions](decisions/laundry-decisions.md)
- D-036 · Send the end-of-use reminder by email without a registered push device · [Laundry decisions](decisions/laundry-decisions.md)
- D-037 · Alert Admin by Web Push and email about access requests · [Admin data](decisions/admin-data.md)
- D-038 · Limit daily and simultaneous laundry reservations · [Laundry decisions](decisions/laundry-decisions.md)

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
- **Confirmed:** 2026-11-27

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

## D-005 · Apply versioned PostgreSQL migrations explicitly
- **Status:** approved
- **Rule:** Keep PostgreSQL schema changes in numbered SQL files. Apply them
  with the explicit backend migration command. Correct a successfully applied
  migration with a new file.
- **Why:** The local PostgreSQL volume persists between runs, so changes need
  to apply in order without rebuilding the database.
- **Evidence:** The project owner approved the migration plan after selecting
  manual Compose execution and forward corrections.
- **Confirmed:** 2026-11-27

## D-007 · Require resident authentication to read the laundry catalog
- **Status:** approved
- **Rule:** In the first version, residents need a valid session to view the
  laundry catalog. Resident access is read-only and includes machine names and
  locations.
- **Why:** The catalog gives signed-in residents a way to identify and locate
  laundry machines while catalog management permissions are being decided.
- **Evidence:** The owner approved the read-only catalog plan, verified the
  browser flow and confirmed recording the access rule as a decision.
- **Confirmed:** 2026-11-22

## D-009 · Notify only residents waiting to use defective equipment
- **Status:** approved
- **Rule:** When equipment is marked defective, notify residents with an upcoming
  reservation or a Live-queue entry for that equipment and ask them to reserve
  another machine. A machine marked defective while available triggers no
  notification when nobody is waiting to use it. Do not broadcast the change to
  other residents.
- **Why:** Residents whose plans are affected need time to find another machine.
  Targeted notifications avoid unnecessary alerts.
- **Example notification:** „Mașina de spălat {număr} din {încăpere} este defectă.
  Te rugăm să rezervi altă mașină.”
- **Evidence:** The owner explicitly confirmed the notification rule and requested
  that it be recorded in the decision ledger.
- **Confirmed:** 2026-11-23

## D-010 · Cancel affected reservations and Live-queue entries when equipment is defective
- **Status:** approved
- **Rule:** When a defect is confirmed, cancel upcoming reservations for the
  affected equipment with the reason “Echipament defect”. Keep them in
  reservation history. Remove affected entries from the active Live-queue and
  retain the reason they ended. A serious defect that requires immediate
  shutdown also ends the reservation in progress immediately.
- **Why:** Residents can see why their reservations were cancelled and choose another machine.
- **Evidence:** The owner confirmed [Q-011](OPEN-QUESTIONS.md#q-011--what-happens-to-reservations-when-equipment-is-marked-defective). [GitHub issue #9](https://github.com/AlexBarac7/app-camin/issues/9) tracks implementation.
- **Confirmed:** 2026-11-23

## Where to find other decisions

The [index](#index) lists decisions in numeric order. For decisions stored in
topic files under `docs/agents/decisions/`, follow the link on the corresponding
index line to read the full text.
