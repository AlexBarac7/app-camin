# Laundry patterns

## PATTERN-016 · Rebuild the live queue view from committed state
- **Status:** candidate
- **How:** Publish the resident's current position and offer from PostgreSQL over
  a bounded authenticated SSE stream. On reconnect, read fresh state. Advance and
  expire offers on the server under the equipment lock, independently of connected
  browsers and Web Push.
- **Example:** backend/src/modules/laundry/live-queue.routes.js;
  backend/src/modules/laundry/live-queue.js.

## PATTERN-017 · Serialize booking sanctions on the resident account
- **Status:** candidate
- **How:** Lock the resident account when adding or correcting a strike and
  when checking whether a new booking is allowed. If the transaction also
  needs the equipment lock, take that lock first. If it needs multiple
  resident locks, take them in account ID order.
- **Example:** backend/src/modules/laundry/reservation-attendance.js;
  backend/src/modules/laundry/live-queue.js.

## PATTERN-018 · Retry reminder email only after an explicit temporary rejection
- **Status:** candidate
- **How:** Persist a single delivery per notice. Claim it in PostgreSQL
  before contacting SMTP so another worker cannot send it. Requeue an
  explicit temporary rejection only if the reminder will still be useful.
  An unknown SMTP result leaves the claim closed to avoid duplicate email.
- **Example:** backend/src/modules/notifications/end-reminder-email.js.
