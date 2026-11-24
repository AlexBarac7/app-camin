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
- Q-007 · What are the drying room's operating hours? · _answered_
- Q-008 · What establishes whether equipment is occupied? · _answered_
- Q-009 · How do reservations and Live-queue interact with the notebook? · _investigating_
- Q-010 · How are no-shows confirmed and handled?
- Q-011 · What happens to reservations when equipment is marked defective? · _answered_
- Q-012 · When is equipment restored in time to notify a resident? · _answered_

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
- **Owner input:** Both the administrator and admin should be able to change
  equipment status manually. For example, the administrator can mark equipment
  as defective while it is occupied or available.
- **Pilot status changes:** D-014 grants equipment management explicitly per account from the terminal. Operators change equipment status in the application.
- **To clarify:** Who confirms and publishes inventory updates, who can add, edit or
  retire machines, what autonomy the residence administrator has, and whether
  changes happen through the terminal or the application. See also
  [Q-005](#q-005--which-business-rules-and-users-should-the-product-support)
  for broader roles and product rules.

## Q-007 · What are the drying room's operating hours?
- **Status:** answered
- **Blocks:** Displaying an operating schedule for the drying room.
- **Who answers:** Project owner
- **Answer:** The drying room and dryers follow the same hours as the washing
  machines, Monday through Friday, 08:00–20:00.
- **Confirmed:** 2026-11-23

## Q-008 · What establishes whether equipment is occupied?
- **Status:** answered
- **Blocks:** Showing Available or Occupied for each piece of equipment.
- **Who answers:** Project owner
- **Answer:** The backend marks a washing machine occupied when the reserved
  interval begins and makes it available when the interval ends, provided it
  remains operational. A future reservation leaves the machine available now.
  Show the upcoming occupied interval alongside the equipment card or nearby,
  and show reservations on a calendar. A resident can reserve the machine for
  immediate use if that reservation fits before the next reserved interval.
- **Confirmed:** 2026-11-23
- **Tracking:** [Reservation calendar](https://github.com/AlexBarac7/app-camin/issues/8).

## Q-009 · How do reservations and Live-queue interact with the notebook?
- **Status:** investigating
- **Blocks:** Determining Live-queue priority and how the queue interacts with the notebook.
- **Who answers:** Project owner, after consulting the residence administrator.
- **Answer (calendar and notebook):** During the pilot, the application calendar
  has priority for reservations. The notebook may still record actual use.
- **Evidence:** The owner approved the issue #8 implementation plan.
  [INTERVIEW.md](../../INTERVIEW.md) describes the previous notebook workflow.
- **Tracking:** [Reservation calendar](https://github.com/AlexBarac7/app-camin/issues/8)
  and [Live-queue priority](https://github.com/AlexBarac7/app-camin/issues/10).

## Q-010 · How are no-shows confirmed and handled?
- **Status:** open
- **Blocks:** Implementing the attendance confirmation window and any strike policy.
- **Who answers:** Project owner, after consulting the residence administrator.
- **Evidence:** [INTERVIEW.md](../../INTERVIEW.md) documents the practice for clothes left in equipment after the recorded interval. A no-show rule remains unconfirmed.

## Q-011 · What happens to reservations when equipment is marked defective?
- **Status:** answered
- **Blocks:** Finalizing changes to future reservations and Live-queue records after a defect.
- **Who answers:** Project owner
- **Owner input:** A serious defect immediately ends the current reservation and
  triggers automatic notices to affected residents, including the person using
  the equipment. An inspection can be planned for after the current cycle.
  While the cycle finishes, block new bookings and let the operator optionally
  send an editable notice. On confirmation of a defect, affected residents with
  upcoming reservations or Live-queue entries receive the automatic notice.
- **Answer:** Cancel upcoming reservations with the reason
  “Echipament defect” and keep them in reservation history. Remove the affected
  entries from the active Live-queue and retain the reason they ended. Residents
  choose another machine.
- **Confirmed:** 2026-11-23
- **Evidence:** [D-009](DECISIONS.md#d-009--notify-only-residents-waiting-to-use-defective-equipment)
  defines targeted notifications. [GitHub issue #9](https://github.com/AlexBarac7/app-camin/issues/9)
  tracks implementation of the fault workflows.

## Q-012 · When is equipment restored in time to notify a resident?
- **Status:** answered
- **Blocks:** Selecting recipients for the restoration notification in D-015.
- **Who answers:** Project owner
- **Answer:** Before the original start, offer the slot regardless of duration.
  After the slot begins, use the remaining usage time at restoration (excluding
  handover). At least 60 minutes qualifies for a five-minute hold. With less
  time, the notification offers another slot. Declining or letting the hold
  expire releases the interval for other residents. See [D-016](decisions/laundry-decisions.md#d-016--offer-a-five-minute-hold-when-laundry-service-resumes).
- **Confirmed:** 2026-11-24
