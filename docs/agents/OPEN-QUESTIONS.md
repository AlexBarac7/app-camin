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
- Q-006 · Who manages the laundry catalog and with what permissions?
- Q-007 · What are the drying room's operating hours?
- Q-008 · What establishes whether equipment is occupied?
- Q-009 · How do reservations and Live-queue interact with the notebook?
- Q-010 · How are no-shows confirmed and handled?

---

## Q-001 · What does app-camin do, and who uses it?
- **Status:** investigating
- **Blocks:** Product scope and domain vocabulary.
- **Who answers:** Project owner
- **Answer:** The owner described shared resource management for a student residence,
  co-working hub or residential building: reservations, live queue, fair-use quotas,
  no-show handling, maintenance tickets with photos and push notifications.
  Exact users, roles and rules remain under investigation. See [INTERVIEW.md](../../INTERVIEW.md) for the documented residence practices.

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
- **Answer:** Railway is the owner-selected future deployment target. A remote and
  upstream now exist (fetch/pull succeed), but the release process and deployment
  configuration are not approved. The owner authorized a foundation commit and
  GitHub branch push, with no merge into main. Deployment is not authorized.

## Q-005 · Which business rules and users should the product support?
- **Status:** open
- **Blocks:** Roles, reservation availability and duration, live queue ordering and
  transport, fair-use quotas, no-show definitions and consequences, maintenance
  workflow and photo storage, notification events and recipients.
- **Who answers:** Project owner, after interviews
- **Evidence:** [INTERVIEW.md](../../INTERVIEW.md) documents current residence practices and identifies details still to clarify.

## Q-006 · Who manages the laundry catalog and with what permissions?
- **Status:** open
- **Blocks:** Ongoing inventory updates and implementing catalog management.
- **Who answers:** Project owner, after brainstorming and consulting the residence administrator.
- **To clarify:** Who confirms and publishes inventory updates, who can add, edit or
  retire machines, what autonomy the residence administrator has, and whether
  changes happen through the terminal or the application. See also
  [Q-005](#q-005--which-business-rules-and-users-should-the-product-support)
  for broader roles and product rules.

## Q-007 · What are the drying room's operating hours?
- **Status:** open
- **Blocks:** Displaying an operating schedule for the drying room.
- **Who answers:** Project owner, after consulting the residence administrator.
- **Evidence:** [INTERVIEW.md](../../INTERVIEW.md) records the laundry rooms' schedule. The drying room's schedule remains unconfirmed.

## Q-008 · What establishes whether equipment is occupied?
- **Status:** open
- **Blocks:** Showing Available or Occupied for each piece of equipment.
- **Who answers:** Project owner, after consulting the residence administrator.
- **To clarify:** What source records when use starts and ends, and who updates it.

## Q-009 · How do reservations and Live-queue interact with the notebook?
- **Status:** open
- **Blocks:** Implementing the reservation calendar and Live-queue.
- **Who answers:** Project owner, after consulting the residence administrator.
- **Evidence:** [INTERVIEW.md](../../INTERVIEW.md) describes the notebook workflow. Reservation duration, advance booking, cancellation, quotas and Live-queue order remain open.

## Q-010 · How are no-shows confirmed and handled?
- **Status:** open
- **Blocks:** Implementing the attendance confirmation window and any strike policy.
- **Who answers:** Project owner, after consulting the residence administrator.
- **Evidence:** [INTERVIEW.md](../../INTERVIEW.md) documents the practice for clothes left in equipment after the recorded interval. A no-show rule remains unconfirmed.
