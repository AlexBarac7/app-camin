# AGENTS.md — app-camin

<!-- graffino-agentic:begin v1 -->
## How we work here

**Before any work:** `git fetch --all --prune`, then `git pull --ff-only`. Stop on a
non-fast-forward or on uncommitted changes you did not make.

**Always load** (indexes; open the entry, or its topic file, before you rely on it):
`docs/agents/DECISIONS.md`, `docs/agents/PATTERNS.md`,
`docs/agents/CONTRACTS.md`, `docs/agents/OPEN-QUESTIONS.md`, `CONTEXT.md`.

**Load on demand:**

| When | Load |
|---|---|
| You rely on an entry | the entry, or its topic file under `docs/agents/<kind>/` |
| Structural work | `docs/agents/ARCHITECTURE.md` |
| Old code or a past decision needs explaining | `docs/agents/DECISIONS-SUPERSEDED.md`, `PATTERNS-SUPERSEDED.md` (never obeyed) |

**Flow:** a change to more than a few lines, or one with a design choice, starts with
`/plan`. The approved plan runs with `/build`. Small fixes go straight to build, with
tests first where tests exist.

### The gate
Ask yourself: **does this change something already approved?**
- **Do, then report:** add a `candidate` pattern; add or answer an open question
  (only with an answer the user gave); write a `Proposed answer` the evidence
  supports (the question stays `investigating` until the user confirms it); fix a
  typo, link or moved path; code that follows the approved entries.
- **Propose and wait:** change, supersede or delete an `approved` pattern or
  decision; promote `candidate → approved`; add a decision; code that contradicts an
  entry. Use this shape, then stop:

```text
PROPOSAL: <add-decision | change | supersede | promote | delete>
- Existing: <ID and what it says, or "none">
- Proposed: <the new rule>
- Why now: <what changed>
- Impact: <files that follow the old rule>
- If approved: <old ID> → superseded-by <new ID> (kept, not deleted)
```
Before you propose, check `docs/agents/REJECTED.md`: never re-propose a rejected item
without new evidence. A rejected proposal is added there with the reason.

### Hard rules
- Build only from `approved` entries. Unanswered means out of scope: record a Q-,
  never invent a value, a requirement or a behaviour.
- Add nothing nobody asked for. Note it as a suggestion instead.
- Build the smallest change that meets the approved criteria, reusing existing code.
  A new abstraction, dependency, configuration option, extension point or broad
  refactor needs a concrete reason today. Never at the cost of tests or error handling.
- Tests first where the repo has tests. Never change what an existing test asserts
  to make code pass; an assertion you think is wrong goes to the user.
- Never write a secret, token, password or personal data into a file, commit or log.
- Never push, tag, release, or deploy without the user's go for that action.
- When you cite past work, label the intent: **replicate** (only for an `approved`
  pattern) or **for awareness only**. History is not a template.
- The code wins over any document. When they disagree, say so and fix the document.
- Report honestly: a failed check is reported with its output; a skipped step is
  named with its reason.

### Ledger rules
- IDs are one sequence per kind in this repo: `D-`, `PATTERN-`, `C-`, `Q-`. Never renumber.
- A provided contract (C-) lives here only; consumers link to it. Changing one is a
  PROPOSAL, and the plan names the consumer files too.
- Superseded entries stay (`status: superseded-by <ID>`) so old code stays explainable.
  Their index lines live in `DECISIONS-SUPERSEDED.md` / `PATTERNS-SUPERSEDED.md`, not
  in the always-loaded indexes; the lint (`--fix`) moves them.
- After any ledger change: `python3 docs/agents/tools/ledger-lint.py --fix` (next free
  ID: `--next D`). It must pass.
- **Confirmed:** when the user confirms an entry in a plan, set `- **Confirmed:** <date>`
  on it. Any edit to an entry removes its Confirmed line.
- A new reusable practice becomes a `candidate` pattern in the same session.
- A settled constraint becomes a decision PROPOSAL in the same session.
<!-- graffino-agentic:end -->

## 1. What this repo is
`app-camin` is a shared resource management application for a student residence,
co-working hub or residential building. Only the technical foundation exists.
No interviews or business policies have been supplied. See
`docs/agents/OPEN-QUESTIONS.md` before implementing product behavior.

## 2. Stack and commands
JavaScript: React + Vite + Tailwind CSS in `frontend/`; Node.js + Express + pg
in `backend/`; PostgreSQL with Docker Compose. Fixed local ports: 5173, 3000, 5432.
Read README.md for shell-only password configuration and startup instructions.

```bash
python3 docs/agents/tools/ledger-lint.py --fix
python3 docs/agents/tools/ledger-lint.py
npm --prefix backend ci
npm --prefix backend test
npm --prefix frontend ci
npm --prefix frontend run build
docker compose up --build -d --wait
```

Backend tests and frontend build run locally; Docker verification is described in
README.md. A browser/screenshot tool is not available in the current environment;
visual acceptance remains manual. Git fetch and fast-forward pull now succeed.
Do not print resolved Compose configuration: it contains the shell-supplied password.

## 3. Layout
- `.claude/skills/`: plan and build workflows.
- `.claude/agents/`: planner and builder instructions.
- `docs/agents/`: knowledge ledger, architecture, guide, and checker.
- `CONTEXT.md`: project vocabulary once defined.
- `frontend/`: technical status page and Vite API proxy.
- `backend/src/modules/`: route modules; only `health/` exists initially.
- `backend/src/config.js`, `db.js`: configuration and PostgreSQL pool.
- `compose.yaml`: development services and persistent database volume.
- `docs/design/DESIGN.md`: minimal status-page guardrails.

## 4. Rules for this repo
- The user selected the base setup without Team, ClickUp, or Slack addons.
- Stack and technical health behavior were approved in conversation on 2026-11-12;
  see Q-002, Q-003 and C-001. DECISIONS.md is deferred to the owner's next review.
- Product terminology and business rules remain unconfirmed; no fabricated evidence.
- Mark temporary product values as demonstrative. Do not seed invented business data.
- PostgreSQL readiness has a total 4-second deadline.
- Follow docs/design/DESIGN.md for the technical page; approve future product designs first.

## 5. Release
The default branch is `main` and has a remote upstream. The deployment platform,
production configuration and release process remain open. See Q-004.
Commits, merges, pushes, tags, releases, and deployments require the user's authorization.

## 6. Definition of done
- The ledger checker passes.
- New documentation has no unresolved template placeholders.
- Backend tests and frontend build pass; Compose/API/SQL checks are reported honestly.
- Visual checks are manual until browser automation is available.
- New practices are candidate patterns; unknown facts are open questions.
