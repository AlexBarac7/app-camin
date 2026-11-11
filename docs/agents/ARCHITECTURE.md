# Architecture — app-camin

<!-- graffino-agentic:begin v1 -->
> How this repo is built, generated from the code at backfill and kept current by
> whoever changes the structure. The code wins: when this page is wrong, fix it.
<!-- graffino-agentic:end -->

## Overview
The repository contains agent instructions only. No application code exists yet.
Product scope, stack, runtime, and integrations remain open questions.

## Parts
| Part | Path | Responsibility | Talks to |
|---|---|---|---|
| Working rules | `AGENTS.md`, `CLAUDE.md` | Agent workflow | Knowledge ledger |
| Knowledge ledger | `docs/agents/` | Decisions, patterns, contracts, and questions | Working rules |
| Workflow skills | `.claude/skills/` | Planning and implementation instructions | Agent definitions |
| Agent definitions | `.claude/agents/` | Planner and builder roles | Workflow skills |

## Data flow
No application data flow exists yet.

## State and storage
No application storage has been selected.

## Configuration
No application configuration exists.

## Build, deploy, runtime
Not configured. See `AGENTS.md` sections 2 and 5.

## Boundaries
No application contracts or integrations exist yet.
