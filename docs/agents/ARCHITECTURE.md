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
| Local runtime | `compose.yaml` | Three services, loopback ports, persistent volume | Docker |

## Data flow
Browser :5173 → Vite /api proxy → backend :3000 → PostgreSQL db:5432.
Service status and readiness behavior is owned by [C-002](CONTRACTS.md#c-002--authorized-service-status-and-internal-readiness). Compose checks readiness on backend loopback port 3001. This port is unpublished.
The operator authorized under D-008 can inspect reservation history and
paginated equipment, reservation and migration data. The admin module checks
permission on every data request and selects explicit columns from fixed queries.

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
Live-queue, quotas, no-show policies, maintenance tickets, photo storage and
push integrations remain outside the current implementation. No Railway deployment
configuration or authorization exists yet.
