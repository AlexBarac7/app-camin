# app-camin

A shared resource management application for a student residence, co-working hub,
or residential building. Planned capabilities include reservations for shared resources
(washing machines, study rooms, kitchens, gyms), a live queue, fair-use quotas,
no-show handling, maintenance tickets with photos, and push notifications.

**Current implementation:** the technical foundation and local resident access
by invitation. The shared-resource features listed above are planned.
The development database name and user are explicitly demonstrative identifiers.

## Stack and layout

- `frontend/`: JavaScript, React, Vite, Tailwind CSS; technical service status page and resident access screens.
- `backend/`: Node.js, Express, REST API, PostgreSQL driver `pg`.
- `backend/src/modules/health/`: health routes; future business modules can live
  alongside this folder once their requirements are approved.
- `backend/src/modules/auth/`: resident activation, login, session and logout.
- `backend/src/config.js`: server configuration validation.
- `backend/src/db.js`: shared PostgreSQL pool and bounded readiness check.
- `compose.yaml`: local frontend, backend and PostgreSQL services.
- `docs/agents/`: knowledge ledger and architectural documentation.
- `docs/design/DESIGN.md`: guardrails for the technical status page.

Railway is the intended future deployment platform. This Compose setup uses
development servers; it is not a production deployment configuration. Production
build serving, platform environment variables, TLS and deployment remain future work.

## Requirements

Use the WSL terminal with Linux Node.js and npm. For the primary development path,
install Docker with the Compose plugin and ensure its daemon is running and
accessible. Host Node.js 22.12+ and npm are needed only for host-side npm commands;
the application containers include Node.js themselves.

## First run

Run from the repository root. Copy the example only on the first run; do not
overwrite an existing local configuration.

```bash
cp -n .env.example .env
read -rsp "PostgreSQL password: " POSTGRES_PASSWORD
export POSTGRES_PASSWORD
echo
docker compose up --build -d --wait
docker compose ps
```

Choose a nonempty local development password. The prompt hides input and keeps it
out of shell history. The password stays in the shell environment; do not save it
in `.env`, source code or documentation. Docker receives it as a container
environment variable, so users with Docker administrator access can inspect it.
Do not print a resolved `docker compose config`, which would include it.

In each new terminal, repeat the password prompt with the same password before
running Compose commands. Do not generate a different password for an existing
database volume: PostgreSQL initialization variables apply only to an empty volume.

Open **http://localhost:5173**. The page should show **Connected** for both REST API
and PostgreSQL, with explicit success messages. Use **Check again** to refresh.

## Configuration

| Variable | Value / meaning |
| --- | --- |
| `FRONTEND_PORT` | Fixed local port `5173` |
| `BACKEND_PORT` | Fixed local port `3000` |
| `PGPORT` | Fixed PostgreSQL port `5432` |
| `PGHOST` | `db`, the PostgreSQL service inside Compose |
| `POSTGRES_DB` | `app_camin_demo`, demonstrative local database name |
| `POSTGRES_USER` | `app_camin_demo`, demonstrative local database user |
| `POSTGRES_PASSWORD` | Required shell environment value; no committed default |

Compose maps the database name, user and password to `PGDATABASE`, `PGUSER` and
`PGPASSWORD` for the backend, and passes `BACKEND_PORT` as `PORT`.
Frontend code never receives database credentials. Vite forwards `/api` to
`http://backend:3000` inside Compose. No CORS configuration is needed for this path.
All host ports bind to loopback. Keep the approved local ports unchanged.

The `pg` pool has 4,000 ms connection and query timeouts. A separate 4,000 ms
deadline bounds the complete readiness probe, including pool acquisition and SQL.
On deadline expiry, the checked-out connection is discarded. Browser checks have
a 6-second network deadline to allow delivery of the backend's failure response.
These are technical limits, not business policies.

## Verify PostgreSQL and the API

```bash
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/ready
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'
```

- `/api/health`: HTTP 200, `status: "ok"`; backend process is responding.
- `/api/ready`: HTTP 200 and `database: "connected"` after a real `SELECT 1`;
  HTTP 503 and `database: "unavailable"` on failure, without database error details.
- `psql`: one row containing `1`. This checks SQL inside the database container;
  the readiness endpoint separately checks backend-to-database connectivity.

The health API contract is owned by [C-001](docs/agents/CONTRACTS.md#c-001--technical-health-api).

## Manual acceptance checks

1. Run `docker compose ps`: all three services should be running; `db` and
   `backend` should become healthy.
2. Open the frontend and check both success messages. Refresh with the button.
3. Use a narrow viewport and keyboard navigation; the button must remain usable,
   focus must be visible, and statuses must be understandable without color.
4. Run `docker compose stop db`. Click **Check again**: PostgreSQL should show
   **Unavailable**, while REST API remains **Connected**. `/api/ready` must return
   503 promptly, within approximately 4 seconds plus HTTP overhead.
5. Run `docker compose start db`. Wait for database startup, then click
   **Check again**: PostgreSQL should recover without restarting the backend.
6. Run `docker compose stop backend`. Refresh the checks: both should show a
   clear error rather than wait indefinitely. Restore with
   `docker compose start backend` and check again.

To test a stalled database rather than a stopped one, use
`docker compose pause db`, check readiness, and always restore it with
`docker compose unpause db`. The automated backend test also covers a silent peer.

## Development and automated checks

Compose bind-mounts `frontend/src` and `backend/src` read-only into their containers.
Source changes trigger Vite HMR or Node watch mode. Rebuild after dependency,
Dockerfile or Vite configuration changes.

```bash
npm --prefix backend ci
npm --prefix backend test
npm --prefix frontend ci
npm --prefix frontend run build
python3 docs/agents/tools/ledger-lint.py
git diff --check
```

Backend tests cover liveness, readiness success/failure, configuration validation
and a real TCP peer that stalls PostgreSQL negotiation. They require permission
to bind local ports. Frontend production build checks bundling, not browser behavior.

For host-only development against the Compose database, export the same password,
set `PORT=3000`, `PGHOST=127.0.0.1`, `PGPORT=5432`, `PGDATABASE=app_camin_demo`,
`PGUSER=app_camin_demo`, and `PGPASSWORD="$POSTGRES_PASSWORD"` in the backend shell.
Start only `db` through Compose, then run `npm --prefix backend run dev` and
`npm --prefix frontend run dev` in separate terminals. Do not run competing
container and host servers on the same ports.

## Continuous integration

The [GitHub Actions workflow](.github/workflows/ci.yml) checks code changes on
pushes, pull requests targeting `main`, and manual requests. Each run uses a
temporary Linux environment with Node.js 22 and Python 3.

| Check | Purpose |
| --- | --- |
| Dependency installation | Install frontend and backend dependencies from committed lockfiles using `npm ci`. |
| Backend tests | Verify health responses, readiness behavior, configuration validation, and database timeout handling. |
| Frontend build | Confirm that the React application compiles successfully for production. |
| Documentation validation | Check knowledge ledger consistency without modifying files. |

A failed command marks the workflow as failed and prevents subsequent steps from
running. Execution logs are available in GitHub's **Actions** tab, with check
results also displayed on pull requests.

The checks require no real business data, database credentials, or running
PostgreSQL instance. Backend tests use controlled test doubles and a local TCP
server. Workflow permissions are limited to read access to repository contents;
no deployment credentials are configured.

A successful run confirms only that the configured checks passed for that
revision. It does not verify browser rendering or accessibility, Docker service
integration with PostgreSQL, unconfirmed business rules, or production readiness.
Those areas require separate verification. The workflow does not merge changes,
publish releases, or deploy the application. It becomes available on GitHub after
the workflow file is pushed; manual execution requires it on the default branch.

## Stop and troubleshoot

```bash
docker compose logs --tail=50 backend frontend
docker compose down
```

`down` preserves the named PostgreSQL volume. Do not use `down -v` unless you
explicitly intend to delete the database. No database deletion is needed for the
normal startup or test procedure.

- Port already allocated: stop the conflicting service; keep the fixed project ports.
- Missing password: repeat the hidden prompt in the current shell.
- Database authentication failure after changing the password: use the original
  password for the existing volume; do not delete data to fix configuration.
- Database unavailable: check `docker compose ps`, then the database service and
  backend environment settings. Avoid publishing logs with personal data or secrets.
- Docker permission/daemon failure: confirm Docker Desktop WSL integration or
  your Linux Docker daemon access before starting this project.

## Indicative roadmap

1. Technical foundation and local verification (this stage).
2. Interviews: identify real users, roles, resource types and operational constraints.
3. Demonstrate local resident access and confirm remaining authorization requirements.
4. Reservations and live queue after ordering, availability and concurrency rules
   are approved; choose the live transport then.
5. Fair-use quotas and no-show handling after policies and exceptions are confirmed.
6. Maintenance tickets with photos after access and storage requirements are confirmed.
7. Push notifications after events, recipients and consent requirements are confirmed.
8. Railway deployment after production configuration and verification are approved.

No business durations, quotas, penalties, priorities, or interview evidence are
assumed. Any future temporary product values must be explicitly marked
**demonstrative**. No delivery dates are implied by this roadmap.

## Verification record — 2026-11-16

- Backend: all 5 existing tests passed; no test assertions were changed.
- Frontend: production build passed with Vite 7.3.8.
- Dependency installation: `npm ci` completed for both applications.
  Initial sandbox attempts failed with `EAI_AGAIN registry.npmjs.org`;
  authorized reruns succeeded. Backend tests initially reported
  `ERR_TEST_FAILURE` in the sandbox and passed with authorized local socket access.
- Ledger checker (including `--fix`) and `git diff --check` passed.
- All CI checks passed on GitHub Actions.
- Local runtime: container inspection showed PostgreSQL healthy and the backend
  unhealthy. PostgreSQL logs identified password authentication failure.
  Application recovery was confirmed manually after correcting the password.
  API/SQL commands and the full manual acceptance procedure were not repeated
  as part of this verification.
- Browser: a supplied screenshot showed the status page during the
  authentication failure. No automated browser, keyboard, or viewport checks
  were performed.

## Verification record — 2026-11-12

- Backend: 5 tests passed; the silent TCP peer test completed in approximately 4.01 s.
- Frontend: production build passed with Vite 7.3.8.
- Docker: both images built with npm ci; all three services started successfully.
  Validation used a separate `app-camin-qa` project, a temporary in-memory database,
  and a generated password retained only in process memory. Test containers and
  their network were removed afterward; the development database was not initialized.
- HTTP: frontend, compiled JSX delivery, backend liveness and Vite API proxy passed.
- SQL: SELECT 1 returned one row. Readiness succeeded, returned 503 in 4.01 s for
  a paused database, and recovered after unpause and database restart.
- Ledger checker and git diff --check passed. Existing test assertions changed: 0.
- Initial restricted-environment checks failed: npm reported
  `getaddrinfo EAI_AGAIN registry.npmjs.org`; the test subprocess reported
  `ERR_TEST_FAILURE`. Dependency installation and tests passed when rerun with
  authorized network/socket access. A diagnostic attempt reported
  `node: bad option: --test-isolation=none`; that option is not used by this project.
- Compose validation without a password correctly failed with
  `required variable POSTGRES_PASSWORD is missing a value`; validation with a
  shell-supplied password passed.
- Browser rendering, keyboard/viewport checks and screenshots were not performed:
  no browser automation tool or installed browser was available. HTTP/build checks
  do not replace the manual acceptance procedure above.
- Subsequent manual verification confirmed that all acceptance checks passed.
  No automated screenshot was taken.

## PostgreSQL migrations

Keep schema changes in `backend/migrations/`, using numbered filenames such as
`001_create_resources.sql`. Use transaction-compatible SQL and leave transaction
control to the runner. After a migration has been applied, add a new migration
to correct it. The runner checks the SHA-256 checksum of each applied file.

With the normal shell password and Compose configuration in place, start
PostgreSQL and rebuild the backend image so it includes the current SQL files.

```bash
docker compose up -d --wait db
docker compose build backend
docker compose run --rm --no-deps backend npm run migrate:status
docker compose run --rm --no-deps backend npm run migrate
```

### Recover from a failed migration

Suppose `001_create_resources.sql` succeeds and `002_add_location.sql` fails.
The apply command exits with an error naming `002_add_location.sql`. PostgreSQL
rolls back that file, including its history entry. Run `migrate:status` to
confirm that `001` is applied and `002` is pending. Correct the pending SQL,
run `docker compose build backend` again, then rerun the apply command above.
A second status check should show both files as applied.

If status reports a history mismatch, restore the original applied file from
Git. Use a new migration for the desired schema change. If another run is
active, let it finish before retrying. If the command cannot connect, verify
that the database is healthy and the shell has the password used to initialize
its volume.

### Run the migration integration tests

Use a fresh, disposable PostgreSQL 17 instance with a database named
`app_camin_migrations_test`. Install backend dependencies and point the
standard `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` and `PGPASSWORD` environment
variables at that instance. Keep the password in the shell. Then run:

```bash
npm --prefix backend run test:migrations
```

The suite leaves its test objects in the disposable database. Use a fresh
instance for each run.

## Local resident access

With the shell password and Compose configuration from [First run](#first-run),
start the services, apply the migration and issue an invitation from the backend
container.

```bash
docker compose up --build -d --wait
docker compose exec backend npm run migrate
docker compose exec backend npm run invite:create
```

Enter the recipient's email at the prompt. For a demonstration, use an
`@example.test` address. Verify the recipient and share the printed link
privately. It expires after 48 hours and can be used once. Issuing a new
invitation for the same address invalidates the previous one. To revoke an
unused invitation, run `docker compose exec backend npm run invite:revoke`
and enter the same email.

Open the link in a browser, choose a password of 15–128 characters and confirm
it. Sign in at `/autentificare` with the invited email. At `/cont`, verify the
email remains visible after reloading. Select **Deconectare**, then revisit
`/cont` to check that it redirects to sign-in. A session lasts 24 hours.

The invitation command prints links for `http://localhost:5173` by default.
The API accepts that origin and `http://127.0.0.1:5173` in local development.
When serving the app at a different origin, set `APP_ORIGIN` to its exact
scheme, host and port, with no trailing slash, and recreate the backend.
The command uses that origin in links and the API uses it for write requests.

Run the automated access flow on a fresh, disposable PostgreSQL 17 database
named `app_camin_auth_test`. Configure the same `PG*` variables described for
the migration tests, then run `npm --prefix backend run test:auth`.
