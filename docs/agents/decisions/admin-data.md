# Administrative data views

## D-012 · Restrict administrative data views to the authorized operator
- **Status:** approved
- **Rule:** The single account authorized under D-008 can consult the reservation
  history and the equipment, reservation and migration views. Each data request
  checks the current permission. The views are read-only and use fixed queries
  that expose only approved columns. Account credentials, sessions and invitations
  are excluded.
- **Why:** The operator needs to inspect bookings, cancellations and database
  state during pilot testing.
- **Evidence:** The owner approved both pages, the existing authorization and the
  initial table list.
- **Confirmed:** 2026-11-23
