# Architecture — app-camin

<!-- graffino-agentic:begin v1 -->
> How this repo is built, generated from the code at backfill and kept current by
> whoever changes the structure. The code wins: when this page is wrong, fix it.
<!-- graffino-agentic:end -->

## Overview
Local technical foundation: React/Vite/Tailwind frontend, modular Express backend
and PostgreSQL using pg, coordinated by Docker Compose. The first product flow
activates resident accounts by invitation and gives signed-in residents a laundry inventory by room with per-equipment reservation calendars.

## Parts
| Part | Path | Responsibility | Talks to |
|---|---|---|---|
| Working rules | `AGENTS.md`, `CLAUDE.md` | Agent workflow | Knowledge ledger |
| Knowledge ledger | `docs/agents/` | Decisions, patterns, contracts, and questions | Working rules |
| Workflow skills | `.claude/skills/` | Planning and implementation instructions | Agent definitions |
| Agent definitions | `.claude/agents/` | Planner and builder roles | Workflow skills |
| Frontend | `frontend/` | Romanian welcome and resident screens, plus protected service status, reservation history and database views | REST API through Vite proxy |
| Backend | `backend/src/` | Configuration, database pool, health and auth modules, and authenticated laundry inventory, reservations, and administrative reads | PostgreSQL |
| Local runtime | `compose.yaml` | App and PostgreSQL with loopback ports, plus optional private object storage under the `photos` profile | Docker |

## Data flow
Browser :5173 → Vite /api proxy → backend :3000 → PostgreSQL db:5432.
Service status and readiness behavior is owned by [C-003](CONTRACTS.md#c-003--admin-service-status-and-internal-readiness). Compose checks readiness on backend loopback port 3001. This port is unpublished.
Admin and Administrator can inspect reservation history. Admin can also
inspect paginated equipment, reservation and migration data. The admin module
checks permission on every request and selects explicit columns from fixed queries.

Migration 013 adds access requests and their in-app notices. Request creation
and approval serialize per normalized email with account activation. Admin
receives the activation URL at approval, and PostgreSQL keeps its token hash.
Each authenticated request resolves the account role from the current user
record and local test configuration. Migration 014 tracks SMTP delivery on
the access request. The server commits the invitation hash before sending.
The approving request reports SMTP acceptance or the option to retry. A
retry invalidates the previous invitation and creates a new one.

Migration 015 stores the digest and expiry of the current password reset link
per account. The public request uses the invitation SMTP transport and returns
before delivery completes. Reset completion locks the account, consumes the
link, changes the password and deletes the account's sessions in one transaction.
Login locks the same row when creating a session and checks the verified hash
again before inserting it.

## State and storage
PostgreSQL 17 stores data in the named postgres_data volume, mounted at
/var/lib/postgresql/data. Explicit backend commands inspect and apply numbered PostgreSQL migrations. The resident access migration adds users, invitations, and sessions. The laundry inventory migration records the 30 pieces of equipment listed in [INTERVIEW.md](../../INTERVIEW.md).
Migration 005 links reservation blocks to equipment and resident accounts.
Creation locks the equipment row before checking overlaps. Cancellation records
a timestamp while keeping the reservation in history.

## Configuration
.env.example documents fixed local ports 5173/3000/5432 and demonstrative database
identifiers. Local .env is ignored. Passwords are supplied through the shell
environment and never written to configuration files. No credentials reach React.
Database connection/query limits and the total readiness deadline are 4 seconds.

## Build, deploy, runtime
See README.md for verified local commands. Compose uses development servers;
frontend npm run build produces static assets. Railway is a future target only.

## Boundaries
Live-queue, quotas, no-show policies and the email fallback remain
outside the current implementation. No Railway deployment configuration or
authorization exists yet.

Migration 006 adds the independent equipment permission, the reservation linked
to a pending inspection and the cancellation reason. Equipment changes lock
the same machine row as booking creation and commit cancellations with the
technical status. The resident calendar returns fault cancellations to their
owner. The equipment management page checks its dedicated permission.

Migration 008 adds resident notifications, restoration offers and Web Push
subscriptions and delivery jobs. Equipment changes create notices and offers
under the same row lock used by booking creation. The calendar includes active
offers without account information. The backend sends browser alerts after
commit. A service worker opens the authenticated notifications page.

Migration 011 adds laundry equipment reports and their links to notifications.
Reports use the existing equipment management permission for operators and
owner-only access for residents. Equipment changes and report transitions
serialize on the equipment row. The inventory shows the 48-hour repair
verification mark while its expiry is active. A new report or technical
condition change clears the mark while retaining confirmation in report history.

Migration 012 extends reports to rooms and shared spaces and stores category,
location, priority and a private photo reference. The backend re-encodes
uploaded images and reads them from S3-compatible storage after checking the
current account's permission. Compose runs SeaweedFS on the internal network
and keeps photo objects in the `report_photos` volume.
