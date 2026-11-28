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
- Q-009 · How do reservations and Live-queue interact with the notebook? · _answered_
- Q-010 · How are no-shows confirmed and handled? · _answered_
- Q-011 · What happens to reservations when equipment is marked defective? · _answered_
- Q-012 · When is equipment restored in time to notify a resident? · _answered_

### [Laundry reports](questions/laundry-reports.md)
- Q-013 · How should residents report laundry equipment faults? · _answered_
- Q-014 · How should the maintenance extension handle location, priority and photos? · _answered_

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
- **Blocks:** Rules for other resources, fair-use quotas, and the remaining
  notification events and recipients. The laundry attendance pilot is covered
  by [Q-010](#q-010--how-are-no-shows-confirmed-and-handled).
- **Who answers:** Project owner, after interviews
- **Evidence:** [INTERVIEW.md](../../INTERVIEW.md) documents residence practices. [Q-013 and Q-014](questions/laundry-reports.md) cover the confirmed maintenance workflow.
- **Confirmed scope:** [D-022](decisions/admin-data.md#d-022--send-approved-invitations-by-email-and-let-residents-choose-an-eight-character-password)
  defines access requests and the three roles for the current pilot. The owner
  confirmed same-day Live-queue for washers and dryers, the duration and
  eligibility rules, and early finish for all ongoing Reservations in
  [D-024](decisions/laundry-decisions.md#d-024--offer-same-day-laundry-openings-through-live-queue).
  SSE is the transport approved in the Issue #10 implementation plan.
  [D-038](decisions/laundry-decisions.md#d-038--limit-daily-and-simultaneous-laundry-reservations)
  defines the pilot's daily and simultaneous Reservation limits. The minute
  thresholds for the separate rolling seven-day quota remain open under
  [Issue #15](https://github.com/AlexBarac7/app-camin/issues/15).

## Q-006 · Who manages the laundry catalog and with what permissions?
- **Status:** open
- **Blocks:** Ongoing inventory updates and implementing catalog management.
- **Who answers:** Project owner, after brainstorming and consulting the residence administrator.
- **Owner input:** Both the administrator and admin should be able to change
  equipment status manually. For example, the administrator can mark equipment
  as defective while it is occupied or available.
- **Pilot status changes:** D-022 gives Admin and Administrator equipment
  operations and report management. Under D-019, operators can explicitly
  confirm that a machine with an unconfirmed status works when resolving a report.
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
- **Status:** answered
- **Blocks:** Determining Live-queue priority and how the queue interacts with the notebook.
- **Who answers:** Project owner, after consulting the residence administrator.
- **Answer:** During the pilot, the application calendar has priority for
  confirmed Reservations and outstanding restoration offers. A free interval
  can be booked directly. The first eligible Live-queue entrant can take a
  new opening through an offer of up to five minutes. The chosen cycle and
  handover must fit, and a skipped entrant keeps their position. The key still
  comes from reception and the notebook can record actual use.
- **Evidence:** The owner approved the issue #8 and #10 implementation plans.
  [INTERVIEW.md](../../INTERVIEW.md) describes the physical workflow.
- **Confirmed:** 2026-11-27
- **Tracking:** [Reservation calendar](https://github.com/AlexBarac7/app-camin/issues/8)
  and [Live-queue priority](https://github.com/AlexBarac7/app-camin/issues/10).

## Q-010 · How are no-shows confirmed and handled?
- **Status:** answered
- **Answer:** For the laundry pilot, remind the resident ten minutes before
  start and ask for confirmation at start. The confirmation window ends at
  the tenth minute. Usage periods shorter than ten minutes are exempt from
  strikes. Three strikes in seven days trigger a 48-hour suspension and cancel
  future Reservations that start before the suspension expires. The resident
  can finish usage already started and keep Reservations starting at or after
  expiration. See [D-032](decisions/laundry-decisions.md#d-032--cancel-only-reservations-starting-during-a-laundry-suspension).
- **Evidence:** The project owner confirmed the application pilot policy for
  [Issue #13](https://github.com/AlexBarac7/app-camin/issues/13), including the
  cancellation window for future Reservations.
- **Confirmed:** 2026-11-28

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
