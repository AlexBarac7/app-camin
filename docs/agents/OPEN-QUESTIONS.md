# Open questions — app-camin

<!-- graffino-agentic:begin v1 -->
> Unknowns. Work that depends on an open question is out of scope until it is
> answered. Only the user answers; an agent never answers by guessing. An agent may
> write a `Proposed answer` the evidence supports; the question stays
> `investigating` until the user confirms it.
> Answered entries stay, with the answer and date, and usually become a D- or PATTERN-.
<!-- graffino-agentic:end -->

## Index
- Q-001 · What does app-camin do, and who uses it? · _investigating_
- Q-002 · Which stack and runtime should the application use? · _answered_
- Q-003 · Does this project include a visual interface? · _answered_
- Q-004 · What is the repository remote and release process?
- Q-005 · Which business rules and users should the product support?

---

## Q-001 · What does app-camin do, and who uses it?
- **Status:** investigating
- **Blocks:** Product scope and domain vocabulary.
- **Who answers:** Project owner
- **Answer:** The owner described shared resource management for a student residence,
  co-working hub or residential building: reservations, live queue, fair-use quotas,
  no-show handling, maintenance tickets with photos and push notifications.
  Exact users, roles and rules are not yet established. No interviews supplied.

## Q-002 · Which stack and runtime should the application use?
- **Status:** answered
- **Blocks:** Application implementation, install, run, build, test, and lint commands.
- **Who answers:** Project owner
- **Answer:** JavaScript, React, Vite, Tailwind CSS, Node.js, Express, REST,
  PostgreSQL with pg, Docker and Compose; separate frontend and backend folders.
  Fixed local ports: 5173, 3000, 5432. PostgreSQL readiness deadline: 4 seconds.
- **Confirmed:** 2026-11-12

## Q-003 · Does this project include a visual interface?
- **Status:** answered
- **Blocks:** Design guardrails, screen registry, and screenshot procedure.
- **Who answers:** Project owner
- **Answer:** Yes. Initially an English technical status page with clear success
  and failure messages. Product screens remain out of scope for this stage.
- **Confirmed:** 2026-11-12

## Q-004 · What is the repository remote and release process?
- **Status:** open
- **Blocks:** Upstream synchronization, deployment, and release commands.
- **Who answers:** Project owner
- **Answer:** The owner is considering Vercel and Supabase. The deployment platform,
  configuration and release process remain open. A remote and upstream now exist
  (fetch/pull succeed). The owner authorized a foundation commit and
  GitHub branch push, with no merge into main. Deployment is not authorized.

## Q-005 · Which business rules and users should the product support?
- **Status:** open
- **Blocks:** Roles, reservation availability and duration, live queue ordering and
  transport, fair-use quotas, no-show definitions and consequences, maintenance
  workflow and photo storage, notification events and recipients.
- **Who answers:** Project owner, after interviews
- **Evidence:** The owner explicitly said no interviews have been conducted yet.
