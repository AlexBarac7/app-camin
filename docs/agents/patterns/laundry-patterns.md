# Laundry patterns

## PATTERN-016 · Rebuild the live queue view from committed state
- **Status:** candidate
- **How:** Publish the resident's current position and offer from PostgreSQL over
  a bounded authenticated SSE stream. On reconnect, read fresh state. Advance and
  expire offers on the server under the equipment lock, independently of connected
  browsers and Web Push.
- **Example:** backend/src/modules/laundry/live-queue.routes.js;
  backend/src/modules/laundry/live-queue.js.
