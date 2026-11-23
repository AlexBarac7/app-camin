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

Open **http://localhost:5173** to reach the Romanian welcome page. See
[Local resident access](#local-resident-access) for migration and account setup.

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

## Verify PostgreSQL and service status

The browser status page lives at `/admin/stare-servicii`. Apply the migrations,
activate a resident account, and run the following command to grant access.
Enter the existing account's email when prompted.

```bash
docker compose exec backend npm run service-status:access -- grant
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'
```

Use the same command with `revoke` to withdraw access before granting it to
another account. Changes take effect on the next request, including existing sessions.

The endpoint and readiness contract is owned by [C-002](docs/agents/CONTRACTS.md#c-002--authorized-service-status-and-internal-readiness).

## Manual acceptance checks

1. Run `docker compose ps` and verify that the database and backend are healthy.
2. Check the welcome page at a narrow viewport with the keyboard. Sign in and
   confirm that both login and a return to the welcome URL lead to Resurse.
3. Open `/admin/stare-servicii` without a session, as an ordinary resident, and
   as the authorized account. Expect login, **Acces interzis**, and the status cards,
   respectively. Verify the cards refresh with **Check again**.
4. Stop PostgreSQL in the local test stack. Refresh the admin page and check for
   **Verificarea accesului este indisponibilă**. Use the internal probe below
   to check that infrastructure can still report PostgreSQL failure.
5. Start PostgreSQL and retry the access check. Verify that the admin page and
   the internal probe recover without restarting the backend.

```bash
docker compose exec backend node -e "fetch('http://127.0.0.1:3001/ready', { signal: AbortSignal.timeout(5000) }).then(async r => console.log(r.status, await r.json()))"
```

The internal check should respond within approximately four seconds plus HTTP
overhead. A nonresponsive database can be simulated by pausing and then
unpausing the database service in a disposable Compose stack.

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
| PostgreSQL integration tests | Run the migration and resident access suites against separate fresh PostgreSQL 17 databases. |
| Frontend build | Confirm that the React application compiles successfully for production. |
| Documentation validation | Check knowledge ledger consistency without modifying files. |

A failed command marks the workflow as failed and prevents subsequent steps from
running. Execution logs are available in GitHub's **Actions** tab, with check
results also displayed on pull requests.

The workflow uses no real business data or repository secrets. The standard
backend tests use test doubles and a local TCP server. The integration job
starts its own disposable PostgreSQL service and discards both test databases
when the job ends. Workflow permissions are limited to read access to
repository contents.

A successful run confirms that the configured checks passed for that revision.
Browser rendering, accessibility, and the application's Docker Compose stack
require separate verification.
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
start the services, apply the migrations and issue an invitation from the backend
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
it. Sign in at `/autentificare` with the invited email. The app opens
**Resurse** at `/resurse`, with links to both laundry rooms and the drying room.
Select an equipment card to see its technical condition and operating hours where known.
Open **Contul meu** at `/cont` to see the email and select **Deconectare**.
A session lasts 24 hours.

The invitation command prints links for `http://localhost:5173` by default.
The API accepts that origin and `http://127.0.0.1:5173` in local development.
When serving the app at a different origin, set `APP_ORIGIN` to its exact
scheme, host and port, with no trailing slash, and recreate the backend.
The command uses that origin in links and the API uses it for write requests.

Run the automated access flow on a fresh, disposable PostgreSQL 17 database
named `app_camin_auth_test`. Configure the same `PG*` variables described for
the migration tests, then run `npm --prefix backend run test:auth`.

### Inspect reservations and database tables

The account authorized for service status can open `/admin/rezervari` to filter
reservation history or `/admin/baza-de-date` to browse equipment, reservations
and migrations. Both pages are read-only. Apply migration 005 before using
the reservation views.

Run the corresponding integration suite with the same `PG*` configuration as
the migration tests, using a fresh database named `app_camin_reservations_test`:

```bash
npm --prefix backend run test:reservations
```

### Clean up expired sessions

After applying the migration, run this command manually from the repository
root with the current backend image running. Rebuild the backend if you started
it before the command was added (`docker compose up --build -d --wait backend`).

```bash
docker compose exec backend npm run sessions:cleanup
```

For a backend running locally, set the same `PG*` variables and run
`npm --prefix backend run sessions:cleanup`. The command deletes only expired
sessions and prints the number deleted. Active sessions remain usable.
