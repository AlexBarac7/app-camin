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
- **Status:** superseded-by D-021
- **Rule:** Grant and revoke equipment management per administrator or admin account
  from the terminal. Scheduled inspection blocks bookings immediately and lets
  only the original usage cycle finish. Keep equipment under inspection until
  an operator marks it broken or working. Confirming a defect ends ongoing
  and future blocks with the recorded reason. Manual restoration preserves
  uncancelled bookings and historical cancellations.
- **Why:** Operators can handle laundry faults independently of access to
  service diagnostics and reservation history.
- **Evidence:** Owner approved the issue #9 implementation plan.

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

## D-017 · Deliver pilot equipment notifications in the app and through opt-in Web Push
- **Status:** approved
- **Rule:** Publish shutdown, inspection and restoration notices to the affected
  resident's authenticated notifications page. Also send a generic Web Push
  alert to each device that explicitly opted in. Start any restoration hold
  when its in-app notice is published. The resident answers in the app.
- **Why:** Residents can see notices even if they decline browser permission,
  and opted-in devices can alert them when the app is closed.
- **Evidence:** The owner chose in-app delivery and browser alerts and requested
  implementation of the issue #9 plan.
- **Confirmed:** 2026-11-25

## D-018 · Keep resident notices unread until acknowledged
- **Status:** approved
- **Rule:** A notice remains unread until its recipient selects **OK** on that
  notice. The resident navigation displays the account's unread count when
  positive. Reading leaves the notice in the inbox and preserves any offer.
  Existing notices with no recorded acknowledgement begin unread.
- **Why:** Residents can see which messages still need their attention and can
  acknowledge each one individually.
- **Evidence:** The owner approved the unread count and acknowledgement plan.
- **Confirmed:** 2026-11-25

## D-019 · Pilot digital reports for laundry equipment
- **Status:** approved
- **Rule:** Any authenticated resident may report a washer or dryer from the
  published inventory by providing a description, regardless of whether they
  have a Reservation. Using the reception notebook is optional. Reports are
  visible to their author and operators with equipment management permission.
  Submitting a report alone does not change availability or Reservations.
- **Workflow:** An operator takes and resolves the report. Resolution closes it.
  The operator explicitly confirms that the equipment works and can return it
  to service in the same action, including equipment with an unconfirmed
  technical status. Existing fault and restoration rules apply. The author may
  verify the repair after resolution. Verification leaves booking rights
  unchanged. Show a green repair verification mark for up to 48 hours after
  the author's confirmation. Remove it when a new issue is reported or the
  equipment is taken out of service or put under inspection. Keep the
  verification in report history.
- **Notifications:** Operators receive an in-app notice and opt-in Web Push
  when a report is submitted. The author receives an in-app notice when the
  operator takes the report and both an in-app notice and opt-in Web Push when
  it is resolved. Read acknowledgement follows D-018.
- **Scope:** Photos, priority and email fallback are deferred pilot work.
- **Why:** Give residents a way to inform the administration about equipment
  faults and check the outcome using the existing inventory and operator tools.
- **Evidence:** The owner confirmed the workflow, optional verification,
  48-hour mark, notification channels and the pilot implementation.
- **Confirmed:** 2026-11-25

## D-020 · Extend maintenance reports to rooms and shared spaces
- **Status:** approved
- **Rule:** Authenticated residents may report laundry equipment, rooms and
  shared spaces. Equipment reports obtain category and location from the
  selected inventory item. Other reports require a description, a category
  and a room number or shared-space name. The resident may provide a floor.
  Categories are laundry equipment, plumbing, electrical and lighting,
  furniture and fixtures, cleanliness, and other.
- **Triage:** Operators with equipment management permission see and take
  all maintenance reports. They assign Low, Normal or Urgent priority when
  taking a report. A new report has no given priority. The existing resolution,
  optional author verification and notice workflow applies. Equipment actions
  and the temporary verification mark apply to inventory equipment only.
- **Photos:** A resident can include one optional photo from the camera or
  gallery. The backend validates and resizes it, strips metadata and stores
  the result in a private S3-compatible bucket. Keep the photo in report
  history after resolution. The author and currently authorized operators
  can access it through the application.
- **Why:** Residents can report room and shared-space problems and attach
  evidence. Operators can triage all reports through the same workflow.
- **Evidence:** The project owner approved the full issue #16 implementation
  plan, including the categories, priority, access and photo retention.
- **Confirmed:** 2026-11-25

## D-024 · Offer same-day laundry openings through Live-queue
- **Status:** approved
- **Rule:** Each washer and dryer has a Live-queue for the current operating day.
  A resident may have one active entry and chooses the cycle duration on joining.
  The residence administrator specified no minimum duration. Existing operating
  hours, handover, the three-hour washer and four-hour dryer limits, and the
  D-013 closing exception apply. Entries still waiting at 20:00 expire.
- **Priority:** Confirmed Reservations and pending D-016 restoration offers
  keep their intervals. When an opening appears, select the earliest entrant
  whose cycle and applicable handover fit. Keep the positions of entrants who
  do not fit. Protect the offered interval for at most five minutes. Shorten
  the claim window when needed for the cycle to fit. Decline or expiry ends the
  entry without a strike. Other free intervals remain bookable through the calendar.
- **Actions:** Start an immediate cycle from the offer, or book an offered
  future opening today. The owner may end any ongoing Reservation early,
  including a standard calendar Reservation. Respect handover and the original
  block end, then offer the released time to Live-queue. The resident takes
  the key from reception and may record actual use in the notebook.
- **Faults:** Pause the queue and keep positions during inspection. Include
  entrants in the editable optional inspection notice. Resume the queue for
  eligible openings when the equipment is declared functional. On confirmed
  defect, close active entries with “Echipament defect” and notify the affected
  residents once. D-016 continues to protect future cancelled Reservations
  shorter than 60 minutes and governs recovery after their start.
- **Why:** Residents can use same-day openings caused by cancellations or early
  finishes while people with existing Reservations can keep their schedule.
- **Evidence:** The owner approved the final Issue #10 plan, including duration
  at entry, one offer at a time per resident, and early finish for ordinary
  Reservations. See [Q-009](../OPEN-QUESTIONS.md#q-009--how-do-reservations-and-live-queue-interact-with-the-notebook).
- **Confirmed:** 2026-11-27


## D-028 · Confirm laundry attendance and apply temporary booking suspensions
- **Status:** superseded-by D-031
- **Rule:** In the laundry pilot, send a reminder ten minutes before a Reservation
  starts and an alert at its scheduled start. The resident can confirm from the
  start until just before the ten-minute deadline, using the server clock.
  Publish the notices in the app and deliver them through opt-in Web Push.
  At the deadline, release the remaining block for an eligible unconfirmed
  Reservation and record exactly one strike. A usage period shorter than ten
  minutes is exempt and keeps its original end time. Apply attendance tracking
  to Reservations created after rollout.
- **Live-queue and restoration:** Starting an immediate Live-queue cycle or
  accepting a restoration offer for immediate use confirms attendance. Future
  Reservations created through offers follow the calendar confirmation rule.
  An unused offer does not create a strike.
- **Suspension:** Three uncorrected strikes in the previous seven days suspend
  booking for 48 hours. The strikes used to trigger a suspension remain in
  history and cannot trigger another suspension. Existing Reservations can
  still be used. Reject attempts to create a new Reservation while suspended
  and show the resident the reason and end date.
- **Administration:** Admin and Administrator can edit the accumulation period
  and suspension duration in the app. Policy edits apply to new sanctions.
  They can correct a strike with a recorded reason. Correcting one of the
  three strikes that triggered an active suspension lifts that suspension.
- **Why:** Give residents time to prepare while returning unused blocks to
  other residents and letting operators correct unfair strikes.
- **Evidence:** The owner proposed the two alerts, seven-day window, 48-hour
  suspension and short-use exception, then approved the revised plan for
  [Issue #13](https://github.com/AlexBarac7/app-camin/issues/13).

## D-029 · Notify operators when a laundry strike is issued
- **Status:** approved
- **Rule:** For each new laundry strike, add one in-app notice per authorized
  Admin and Administrator. Write the notices in the transaction that records
  the strike. Send no Web Push for these notices. The notice links to the
  specific Reservation in the protected history so the recipient can review
  and correct the strike there.
- **Why:** Operators can find the relevant Reservation even after it leaves
  the first page of the history.
- **Evidence:** The owner requested this notification and approved the proposed
  [Issue #13](https://github.com/AlexBarac7/app-camin/issues/13) follow-up.
- **Confirmed:** 2026-11-27

## D-030 · Notify the reservation holder when a laundry strike is issued
- **Status:** approved
- **Rule:** Write one in-app notice for the reservation holder in the
  transaction that issues each new laundry strike. Display “Ai primit un
  strike” with the no-show reason and a link to the cancelled Reservation in
  the calendar. The notice is in-app only and applies to strikes issued after
  rollout.
- **Why:** The holder can find the strike in the inbox and open the affected
  Reservation directly.
- **Evidence:** The owner requested the notice after testing the no-show flow
  and approved the proposal on 2026-11-28.
- **Confirmed:** 2026-11-28

## D-031 · Confirm laundry attendance and cancel future reservations on suspension
- **Status:** superseded-by D-032
- **Rule:** In the laundry pilot, send a reminder ten minutes before a Reservation
  starts and an alert at its scheduled start. The resident can confirm from the
  start until just before the ten-minute deadline, using the server clock.
  Publish the notices in the app and deliver them through opt-in Web Push.
  At the deadline, release the remaining block for an eligible unconfirmed
  Reservation and record exactly one strike. A usage period shorter than ten
  minutes is exempt and keeps its original end time. Apply attendance tracking
  to Reservations created after rollout.
- **Live-queue and restoration:** Starting an immediate Live-queue cycle or
  accepting a restoration offer for immediate use confirms attendance. Future
  Reservations created through offers follow the calendar confirmation rule.
  An unused offer does not create a strike.
- **Suspension:** Three uncorrected strikes in the previous seven days suspend
  access for 48 hours. Keep the strikes that triggered a suspension in history
  and exclude them from subsequent suspensions. In the transaction that activates
  a suspension, cancel every Reservation for that resident whose scheduled start
  is still in the future, including starts after the suspension would expire.
  Release those intervals and retain the reason “Suspendare pentru neprezentare”
  in the calendar and history. These cancellations generate no strikes. The
  resident can finish usage that has already started. Reject new Reservations
  during suspension and show the resident the reason and end date.
- **Administration:** Admin and Administrator can edit the accumulation period
  and suspension duration in the app. Policy edits apply to new sanctions.
  They can correct a strike with a recorded reason. Correcting one of the
  three strikes that triggered an active suspension lifts that suspension.
  Lifting or expiring a suspension allows new Reservations and leaves the
  cancellations in history.
- **Why:** Give residents time to prepare while returning unused blocks to
  other residents and letting operators correct unfair strikes.
- **Evidence:** The owner proposed the two alerts, seven-day window, 48-hour
  suspension and short-use exception, then approved the revised plan for
  [Issue #13](https://github.com/AlexBarac7/app-camin/issues/13).
  On 2026-11-28 the owner also approved cancelling all future Reservations,
  finishing usage that has already started and leaving the cancellations in
  history after a correction.

## D-032 · Cancel only reservations starting during a laundry suspension
- **Status:** approved
- **Rule:** In the laundry pilot, send a reminder ten minutes before a Reservation
  starts and an alert at its scheduled start. The resident can confirm from the
  start until just before the ten-minute deadline, using the server clock.
  Publish the notices in the app and deliver them through opt-in Web Push.
  At the deadline, release the remaining block for an eligible unconfirmed
  Reservation and record exactly one strike. A usage period shorter than ten
  minutes is exempt and keeps its original end time. Apply attendance tracking
  to Reservations created after rollout.
- **Live-queue and restoration:** Starting an immediate Live-queue cycle or
  accepting a restoration offer for immediate use confirms attendance. Future
  Reservations created through offers follow the calendar confirmation rule.
  An unused offer does not create a strike.
- **Suspension:** Three uncorrected strikes in the previous seven days suspend
  access for 48 hours. Keep the strikes that triggered a suspension in history
  and exclude them from subsequent suspensions. In the transaction that activates
  a suspension, cancel future Reservations for that resident whose scheduled
  start is earlier than the stored suspension expiry. Keep Reservations starting
  at the expiry or later. The expiry uses the duration configured when the
  suspension was issued.
  Release those intervals and retain the reason “Suspendare pentru neprezentare”
  in the calendar and history. These cancellations generate no strikes. The
  resident can finish usage that has already started. Reject new Reservations
  during suspension and show the resident the reason and end date.
- **Administration:** Admin and Administrator can edit the accumulation period
  and suspension duration in the app. Policy edits apply to new sanctions.
  They can correct a strike with a recorded reason. Correcting one of the
  three strikes that triggered an active suspension lifts that suspension.
  Lifting or expiring a suspension allows new Reservations and leaves the
  cancellations in history.
- **Why:** Give residents time to prepare while returning unused blocks to
  other residents and letting operators correct unfair strikes.
- **Evidence:** The owner proposed the two alerts, seven-day window, 48-hour
  suspension and short-use exception, then approved the revised plan for
  [Issue #13](https://github.com/AlexBarac7/app-camin/issues/13).
  On 2026-11-28 the owner approved cancelling future Reservations only within
  the actual suspension window, finishing usage that has already started and
  leaving the cancellations in history after a correction.
- **Confirmed:** 2026-11-28

## D-033 · Show each resident their strike count and notify them of corrections
- **Status:** approved
- **Rule:** Show the signed-in resident the current count of strikes that can
  trigger a suspension and how many more would trigger it in Notificări. Use
  the same configured window and eligibility as D-032. While a suspension is
  active, show its end time. Save the remaining count at the time of each new
  strike in the resident's notice, or state that a suspension is active or
  has started. When an operator corrects a strike, write one in-app notice to
  its holder in the correction transaction. Include the remaining count
  after correction, or indicate that a suspension is still active.
- **Why:** Residents can see how close they are to suspension and know when
  an operator has corrected a strike.
- **Evidence:** The owner approved the inbox counter, notice wording and
  one in-app notice per correction on 2026-11-28.
- **Confirmed:** 2026-11-28

## D-034 · Show authorized operators whose reservation received a strike
- **Status:** approved
- **Rule:** Show the holder's account email on the operator strike notice and
  on the Reservation history row associated with the strike. Authorize both
  views using the current Admin or Administrator role. Resolve the email
  from the linked account when reading the views.
- **Why:** Operators can verify whose strike they are reviewing or correcting.
- **Evidence:** The owner approved showing the holder's email in both views
  on 2026-11-28.
- **Confirmed:** 2026-11-28

## D-035 · Remind residents 15 minutes before laundry use ends
- **Status:** approved
- **Rule:** Send one in-app reminder to the Reservation holder 15 minutes
  before use ends and deliver it through Web Push to opted-in devices. Use the
  end of use before handover, or 20:00 for a closing block without handover.
  The Reservation must be in its usage interval on equipment available for
  that cycle. Exclude cancelled Reservations, early finishes, cycles shorter
  than 15 minutes, and Reservations created after the reminder was due.
  After a worker restart, process an unsent reminder while use is still in
  progress. Stop pending push delivery when use ends. Remove expired push
  subscriptions through the existing delivery flow. Email fallback is a
  separate step.
- **Why:** Residents have time to collect their laundry and free the equipment.
- **Evidence:** The owner requested the 15-minute Web Push reminder in
  [Issue #14](https://github.com/AlexBarac7/app-camin/issues/14) and approved
  implementing push and the in-app notice first.
- **Confirmed:** 2026-11-28

## D-036 · Send the end-of-use reminder by email without a registered push device
- **Status:** approved
- **Rule:** When scheduling the D-035 reminder, select email if the
  Reservation holder has zero registered Web Push subscriptions. Send the
  same reminder to the account's email address through configured SMTP.
  The notice remains available in the app. Remove expired subscriptions
  through the existing Web Push flow. Their removal affects future reminders.
  Stop pending email delivery when use ends, including on cancellation or
  early finish. Retry an explicit temporary SMTP rejection while use continues.
- **Why:** Residents without Web Push can receive the end-of-use reminder.
- **Evidence:** The owner confirmed email only when no push subscription is
  registered at the time of the reminder for
  [Issue #14](https://github.com/AlexBarac7/app-camin/issues/14).
- **Confirmed:** 2026-11-28

## D-038 · Limit daily and simultaneous laundry reservations
- **Status:** approved
- **Rule:** For the pilot, start with a configurable limit of two Reservations
  per resident per local day of use, across washers and dryers combined. A
  resident may reserve at most one washer and one dryer for overlapping
  intervals. Apply the checks to calendar bookings and Live-queue claims,
  including concurrent requests for different machines.
- **Counting:** A cancellation before use starts frees a daily slot. A no-show
  consumes a daily slot and contributes zero usage minutes. A replacement
  accepted under D-016 and its original Reservation count as one.
- **Statistics:** Rank residents by confirmed usage minutes. The named ranking
  is visible to Administrator and Admin only.
- **Why:** Preserve access to laundry equipment by limiting how many slots a
  resident can hold in one day and preventing them from holding two machines
  of the same type at the same time.
- **Evidence:** The owner proposed and approved the daily and simultaneous
  limits. The separate rolling seven-day quota is tracked in
  [Issue #15](https://github.com/AlexBarac7/app-camin/issues/15).
- **Confirmed:** 2026-11-28
