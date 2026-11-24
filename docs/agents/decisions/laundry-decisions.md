# Laundry reservations

## D-011 · Use the application calendar for pilot laundry reservations
- **Status:** proposed
- **Rule:** The calendar has priority for booking during the pilot. The notebook
  may be used to record actual use. Residents book working equipment on weekdays
  from 08:00 to 20:00 in Europe/Bucharest, using five-minute increments and
  starting up to seven local days ahead. They can cancel their own reservation
  before its start. Maximum use is three hours for a washer and four for a
  dryer. The last ten minutes of a block are for handover. D-013 defines the
  exception for blocks ending at 20:00. The first saved overlapping request wins.
  Other residents see only the occupied block.
- **Why:** Give residents one shared schedule and allow time for handover.
- **Evidence:** Owner-approved implementation plan for issue #8 and
  [Q-009](../OPEN-QUESTIONS.md#q-009--how-do-reservations-and-live-queue-interact-with-the-notebook).


## D-013 · Allow extended laundry use for blocks ending at 20:00
- **Status:** approved
- **Rule:** A block ending at 20:00 has no handover. It can start at 16:45 or
  later for a washer and at 15:45 or later for a dryer. Blocks ending earlier
  retain the usual maximum use of three hours for a washer and four hours for
  a dryer, plus ten minutes for handover.
- **Why:** Give residents more flexibility to use laundry equipment before closing.
- **Evidence:** The owner proposed both start thresholds and approved the rule.
- **Confirmed:** 2026-11-23

## D-014 · Authorize equipment operations separately and restore service manually
- **Status:** approved
- **Rule:** Grant and revoke equipment management per administrator or admin account
  from the terminal. Scheduled inspection blocks bookings immediately and lets
  only the original usage cycle finish. Keep equipment under inspection until
  an operator marks it broken or working. Confirming a defect ends ongoing
  and future blocks with the recorded reason. Manual restoration preserves
  uncancelled bookings and historical cancellations.
- **Why:** Operators can handle laundry faults independently of access to
  service diagnostics and reservation history.
- **Evidence:** Owner approved the issue #9 implementation plan.
- **Confirmed:** 2026-11-24

## D-015 · Notify affected residents when equipment returns to service in time
- **Status:** approved
- **Rule:** During inspection after a cycle, keep existing reservations. If the
  operator takes the machine out of service, cancel affected reservations and
  notify their holders to book another machine, as specified in D-009 and D-010.
  If the machine returns to service in time for an affected resident to use it,
  notify that resident that it is available again and give them the opportunity
  to make a new reservation. The original reservation stays cancelled.
- **Why:** Residents can reconsider their plans when a machine becomes available again.
- **Evidence:** The owner confirmed this behavior after testing shutdown and
  restoration in the local application. Q-012 tracks the timing criterion.
- **Confirmed:** 2026-11-24

## D-016 · Offer a five-minute hold when laundry service resumes
- **Status:** approved
- **Rule:** When service resumes before the original reservation starts, offer
  the affected resident the original slot regardless of its duration. Once the
  slot has started, offer its remainder if at least 60 minutes of usage remain
  at restoration, excluding handover. With less than 60 minutes left, notify
  the resident and offer to choose another slot.
- **Response:** Hold the offered interval for five minutes from the restoration
  notification. “Continuă rezervarea” confirms a new booking for that interval
  with the original end time. Keep the original cancellation in history.
  “Încheie rezervarea” releases the hold immediately. At the five-minute
  deadline, an unanswered offer expires and the interval becomes available
  to other residents, exactly as if the resident had declined.
- **Why:** A resident may already have found another machine. The hold gives
  them time to decide while limiting how long other residents have to wait.
- **Evidence:** The owner confirmed the single remaining-usage threshold, both
  notification actions and the five-minute expiry when answering Q-012.
- **Confirmed:** 2026-11-24
