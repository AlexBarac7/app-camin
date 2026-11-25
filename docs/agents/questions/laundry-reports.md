# Laundry equipment reports

## Q-013 · How should residents report laundry equipment faults?
- **Status:** answered
- **Blocks:** The pilot submission form, operator permissions, report
  transitions, verification mark and notification recipients.
- **Who answers:** Project owner
- **Answer:** Any authenticated resident may report a washer or dryer from
  the inventory without a Reservation. A description is required. The
  reception notebook remains optional. Operators with equipment management
  permission can take and resolve a report. Resolution closes it and can
  explicitly return the equipment to service. The author may confirm the
  repair afterwards. The inventory mark lasts until a new report or 48 hours
  after confirmation, whichever comes first.
- **Notifications:** Operators get an in-app notice and opt-in Web Push for
  new reports. The author gets an in-app notice on pickup and an in-app notice
  and opt-in Web Push on resolution.
- **Follow-up:** [Q-014](#q-014--how-should-the-maintenance-extension-handle-location-priority-and-photos)
  records how the completed issue #16 scope extends the original pilot.
  Email fallback is deferred to a later stage.
- **Confirmed:** 2026-11-25
- **Decision:** [D-019](../decisions/laundry-decisions.md#d-019--pilot-digital-reports-for-laundry-equipment).

## Q-014 · How should the maintenance extension handle location, priority and photos?
- **Status:** answered
- **Blocks:** [Issue #16](https://github.com/AlexBarac7/app-camin/issues/16) completion.
- **Who answers:** Project owner
- **Answer:** Support rooms and shared spaces alongside the existing equipment
  reports. Use the approved categories and accept the room number or shared
  space name with an optional floor. Operators assign Low, Normal or Urgent
  at pickup. One photo is optional. The same operator permission applies
  to reports and photos across all locations. Photos remain in report
  history and are visible to the author and authorized operators.
- **Confirmed:** 2026-11-25
- **Decision:** [D-020](../decisions/laundry-decisions.md#d-020--extend-maintenance-reports-to-rooms-and-shared-spaces).
