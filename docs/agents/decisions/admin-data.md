# Administrative data views

## D-012 · Restrict administrative data views to the authorized operator
- **Status:** superseded-by D-021
- **Rule:** The single account authorized under D-008 can consult the reservation
  history and the equipment, reservation and migration views. Each data request
  checks the current permission. The views are read-only and use fixed queries
  that expose only approved columns. Account credentials, sessions and invitations
  are excluded.
- **Why:** The operator needs to inspect bookings, cancellations and database
  state during pilot testing.
- **Evidence:** The owner approved both pages, the existing authorization and the
  initial table list.

## D-021 · Approve access requests and delegate residence operations
- **Status:** superseded-by D-022
- **Rule:** A prospective resident submits an email address from the welcome
  page. Only Admin can view and approve requests. A new pending request
  creates an in-app notice for each authorized Admin. Approval issues a
  single-use invitation valid for 48 hours. Admin copies the link and sends
  it to the applicant. Residents sign in with email and password and receive
  24-hour sessions. All accounts can see their current role in Contul meu.
- **Permissions:** The owner is the sole production Admin and can grant or
  revoke Administrator for an activated account through the application.
  Admin and Administrator operate equipment, triage and resolve maintenance
  reports, access their photos, receive report notices and read Reservation
  history. Only Admin can use the service-status and database pages.
  Scheduled inspection blocks new bookings and allows the current cycle to
  finish. Confirming a fault ends affected bookings and records the reason.
  Manual restoration preserves uncancelled bookings and cancellation history.
  D-015 through D-020 apply to offers, notices and reports.
- **Local test access:** With local test accounts enabled, the provisioned
  admin@example.test account has Admin access. The Docker equipment-access
  grant and revoke actions target rezident@example.test in local test mode.
  Provision the initial Admin from the terminal. Test accounts require
  explicit local enablement and can sign in only in that environment.
- **Why:** The owner controls admission and delegates residence operations
  while preserving the existing demonstration workflows.
- **Evidence:** The owner approved the revised plan for public access
  requests, copy-link delivery, role delegation and local test accounts.

## D-022 · Send approved invitations by email and let residents choose an eight-character password
- **Status:** approved
- **Rule:** A prospective resident submits an email address from the welcome
  page. Only Admin can view and approve requests. A new pending request creates
  an in-app notice for each authorized Admin. Approval issues a single-use
  invitation valid for 48 hours and sends its activation link to the address
  on the request through configured SMTP. Admin sees the result and can
  retry a failed send. A retry replaces the previous link. Residents choose
  a password of 8–128 characters at activation and receive 24-hour sessions
  when they sign in. Each account can see its role in Contul meu.
- **Permissions:** The owner is the sole production Admin and can grant or
  revoke Administrator for an activated account through the application.
  Admin and Administrator operate equipment, triage and resolve maintenance
  reports, access their photos, receive report notices and read Reservation
  history. Only Admin can use service-status and database pages. Scheduled
  inspection blocks new bookings and lets the current cycle finish. Confirming
  a fault ends affected bookings and records the reason. Manual restoration
  preserves uncancelled bookings and cancellation history. D-015 through
  D-020 apply to offers, notices and reports.
- **Local test access:** With local test accounts enabled, admin@example.test
  has Admin access. The Docker equipment-access grant and revoke actions
  target rezident@example.test in this mode. Provision the initial Admin
  from the terminal. The local test mailbox captures demonstration email.
- **Why:** Direct delivery removes the manual copy step. The activation
  screen tells residents to choose a password and sets the requested minimum.
- **Evidence:** The owner requested automatic invitation delivery and the
  eight-character activation threshold, then approved the plan.
- **Confirmed:** 2026-11-26

## D-023 · Let account holders reset their password by email
- **Status:** approved
- **Rule:** The sign-in form links to **Am uitat parola**, where the user
  submits their email address. Give the same public confirmation for any valid
  address. For an existing account, send a reset link through configured SMTP
  using `APP_ORIGIN`. The link expires after 30 minutes and can be used once.
  A user can request another link after resetting their password.
- **Completion:** Ask for **Parola nouă** and **Confirmă parola nouă**. Require
  matching passwords of 8–128 characters. On success, invalidate all existing
  sessions for that account and show **Parola ta a fost schimbată** with
  **Înapoi la autentificare**.
- **Why:** Account holders can recover access using the mailbox associated
  with their account. Ending previous sessions makes the new password take
  effect across devices.
- **Evidence:** The owner confirmed the D-023 password reset plan and requested
  local Mailpit verification. The owner also confirmed that a login started
  with the old password must be rejected if the reset completes first.
- **Confirmed:** 2026-11-26

## D-025 · Welcome newly activated accounts at first sign-in
- **Status:** approved
- **Rule:** A new account activated through an invitation sees a welcome message
  on its first successful sign-in, with **Consultă ghidul** and **Mergi la resurse**.
  Later sign-ins go directly to the portal. A direct notification link keeps
  its destination on later sign-ins. Existing and directly provisioned accounts
  enter the portal without the welcome message.
- **Why:** Give new residents a choice between orientation and immediate access.
- **Evidence:** The owner approved the navigation, guide and notifications
  implementation plan and its onboarding decision on 2026-11-27.
- **Confirmed:** 2026-11-27

## D-026 · Distinguish duplicate access requests and allow invitation replacement
- **Status:** approved
- **Rule:** A regular access request creates at most one pending request for the
  normalized email address. The public form distinguishes a registered account,
  a pending request, an issued invitation and an expired invitation. Registered
  users can sign in or reset their password.
- **Replacement:** Alongside the regular request, any applicant with an issued
  invitation and no account can explicitly request another invitation for that
  email. Reuse any existing request and notify Admin when it returns to the
  approval queue. An existing pending request or incomplete mail delivery keeps
  its current handling. Admin approval invalidates the previous link and issues
  a new single-use link valid for 48 hours under D-022.
- **Why:** The confirmation should tell applicants which action is available
  and give them a way to recover lost or expired links without duplicate work.
- **Evidence:** The owner reported a misleading acceptance message for an
  existing administrator account and approved the replacement workflow.
- **Confirmed:** 2026-11-27

## D-027 · Reject pending access requests and notify the applicant
- **Status:** approved
- **Rule:** Admin can reject a pending access request and the application sends
  a rejection email to the address on the request. Rejection closes the request
  immediately and revokes any outstanding invitation for that address. The public
  form shows that the request is rejected if the address is submitted again.
- **Delivery:** If sending fails, the request stays closed and Admin can retry
  the rejection email. A request with an already approved invitation and no
  pending replacement cannot be rejected through the pending request list.
- **Why:** Admin can record a decision and inform the applicant immediately.
- **Evidence:** The owner requested and approved the immediate rejection workflow.
- **Confirmed:** 2026-11-27

## D-037 · Alert Admin by Web Push and email about access requests
- **Status:** approved
- **Date:** 2026-11-28
- **Rule:** When an access request enters the approval queue, keep the in-app
  notice defined by D-022. Also queue Web Push for each subscribed device and
  one email to the account address of each authorized Admin. Apply the same
  rule to an explicit invitation replacement that reopens a request under
  D-026. A duplicate submission while the request is pending queues no
  deliveries. The email links to the protected access requests page.
- **Why:** Admin can act on registration requests while away from the app.
- **Evidence:** The owner requested both channels and confirmed the
  implementation proposal.
- **Confirmed:** 2026-11-28
