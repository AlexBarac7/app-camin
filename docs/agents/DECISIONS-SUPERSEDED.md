# Decisions superseded — app-camin

<!-- graffino-agentic:begin v1 -->
> Decisions that no longer apply. **Never obeyed**; read only to explain old code or a
> past choice. Each points to the entry that replaced it. `ledger-lint.py --fix`
> keeps this file in sync: superseded entries move here from `DECISIONS.md`, and
> their index lines move here from its index.
<!-- graffino-agentic:end -->

## Index
- D-006 · Activate local resident accounts by invitation · _superseded-by D-021_
- D-008 · Limit browser access to service status to one explicitly authorized account · _superseded-by D-021_

### [Admin data](decisions/admin-data.md)
- D-012 · Restrict administrative data views to the authorized operator · _superseded-by D-021_
- D-021 · Approve access requests and delegate residence operations · _superseded-by D-022_

### [Laundry decisions](decisions/laundry-decisions.md)
- D-014 · Authorize equipment operations separately and restore service manually · _superseded-by D-021_

---

## D-006 · Activate local resident accounts by invitation
- **Status:** superseded-by D-021
- **Rule:** Activate local resident accounts through single-use invitations
  issued from the terminal and valid for 48 hours. Authenticate with email and
  password and use sessions valid for 24 hours.
- **Why:** Demonstrate resident access before the shared resource inventory and
  operating rules are available.
- **Evidence:** The owner requested implementation of the approved resident
  invitation plan.

## D-008 · Limit browser access to service status to one explicitly authorized account
- **Status:** superseded-by D-021
- **Rule:** Service status in the browser requires a valid session for the one
  existing account that can be authorized through the local terminal command.
  The permission is absent by default and is checked on every request. Revoke
  the current permission before granting it to a different account.
- **Why:** Service diagnostics are restricted to the operator selected locally.
- **Evidence:** Owner requested implementation of the approved welcome and service
  status plan.
