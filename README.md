# app-camin

A shared resource management application for a student residence, co-working hub,
or residential building. The pilot covers the two laundry rooms and the drying
room in the residence.

The application includes resident access by invitation, the laundry inventory
and Reservation calendar, equipment fault management, laundry reports, and
in-app and opt-in Web Push notifications.

## Stack and layout

- `frontend/` contains the React and Tailwind CSS interface and Vite development server.
- `backend/src/modules/` contains the Express API for authentication, laundry
  inventory, Reservations, equipment faults, reports, notifications, administrative
  data views and service health.
- `backend/migrations/` contains the versioned SQL for PostgreSQL.
- `compose.yaml` runs the frontend, backend and PostgreSQL 17 locally.
- `docs/agents/` contains the architectural documentation and decision ledger.

## Requirements

Use Docker with the Compose plugin and a running daemon. On Windows, run the
commands from the WSL terminal with Docker integration enabled. Host Node.js
22.12+ and npm are required for the host-side commands below.

## First run

Run from the repository root. Keep any existing `.env` configuration.

```bash
cp -n .env.example .env
read -rsp "PostgreSQL password: " POSTGRES_PASSWORD
export POSTGRES_PASSWORD
echo
docker compose up --build -d --wait
docker compose exec backend npm run migrate
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

Open [the local app](http://localhost:5173), then follow
[Local resident access](#local-resident-access) to activate an account.

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
| `APP_ORIGIN` | Exact app origin for invitations and write requests. Defaults to `http://localhost:5173`. |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Optional shell settings for [Web Push](#web-push). |

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

### Verify the internal readiness probe

Compose uses a separate listener inside the backend container. To check it directly, run:

```bash
docker compose exec backend node -e "fetch('http://127.0.0.1:3001/ready', { signal: AbortSignal.timeout(5000) }).then(async r => console.log(r.status, await r.json()))"
```

The internal check should respond within approximately four seconds plus HTTP
overhead. Use a disposable stack to verify that readiness reports a database
outage and recovers after PostgreSQL restarts.

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

Backend tests cover health and readiness, authentication, Reservation rules
and Web Push delivery handling. Some tests open local ports. The frontend
build verifies that Vite can bundle the application.

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
| Backend tests | Run the backend test suite with `npm test`. |
| PostgreSQL integration tests | Run the migration, authentication and Reservation suites against three separate PostgreSQL 17 databases. The Reservation suite also exercises equipment faults, reports and notification persistence. |
| Frontend build | Confirm that the React application compiles successfully for production. |
| Documentation validation | Check knowledge ledger consistency without modifying files. |

Results are available under GitHub **Actions** and on pull requests. The workflow
uses disposable databases and synthetic fixtures. Browser behaviour, device
delivery and the local Compose stack are verified separately.

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

## PostgreSQL migrations

Keep schema changes in numbered files under `backend/migrations/`. Use
transaction-compatible SQL and leave transaction control to the runner.
Correct an applied migration with a new file. The runner checks the SHA-256
checksum of each applied file.

With the normal shell password and Compose configuration in place, start
PostgreSQL and rebuild the backend image so it includes the current SQL files.

```bash
docker compose up -d --wait db
docker compose build backend
docker compose run --rm --no-deps backend npm run migrate:status
docker compose run --rm --no-deps backend npm run migrate
```

### Recover from a failed migration

If a migration fails, PostgreSQL rolls it back and earlier successful files
stay applied. Run `migrate:status` to identify the pending migration. Correct
the pending SQL, rebuild the backend image and run the apply command again.

If status reports a history mismatch, restore the original applied file from
Git. Use a new migration for the desired schema change. If another run is
active, let it finish before retrying. If the command cannot connect, verify
that the database is healthy and the shell has the password used to initialize
its volume.

### Run PostgreSQL integration tests locally

Install backend dependencies and use fresh, disposable PostgreSQL 17 databases.
Set `PGHOST`, `PGPORT`, `PGUSER` and `PGPASSWORD` for that instance in the shell.
Create each database before running its suite.

```bash
PGDATABASE=app_camin_migrations_test npm --prefix backend run test:migrations
PGDATABASE=app_camin_auth_test npm --prefix backend run test:auth
PGDATABASE=app_camin_reservations_test npm --prefix backend run test:reservations
```

Use a fresh database for each run because the suites leave test objects behind.

## Local resident access

After [First run](#first-run), issue an invitation from the backend container.

```bash
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
Select an equipment card to see its technical condition, operating hours and
Reservation calendar. The washers and dryers follow the same weekday schedule,
08:00–20:00.
Open **Contul meu** at `/cont` to see the email and select **Deconectare**.
A session lasts 24 hours.

The invitation command prints links for `http://localhost:5173` by default.
The API accepts that origin and `http://127.0.0.1:5173` in local development.
When serving the app at a different origin, set `APP_ORIGIN` to its exact
scheme, host and port, with no trailing slash, and recreate the backend.
The command uses that origin in links and the API uses it for write requests.
In development, setting `APP_ORIGIN` also keeps the two local origins enabled.

### Inspect reservations and database tables

The account authorized for service status can open `/admin/rezervari` to filter
reservation history or `/admin/baza-de-date` to browse equipment, reservations
and migrations. Both pages are read-only.

### Clean up expired sessions

With the backend running, clean up expired sessions from the repository root.

```bash
docker compose exec backend npm run sessions:cleanup
```

For a backend running locally, set the same `PG*` variables and run
`npm --prefix backend run sessions:cleanup`. The command deletes only expired
sessions and prints the number deleted. Active sessions remain usable.

### Managing laundry equipment faults

To grant equipment management access to an existing account, run
`docker compose exec backend npm run equipment:access -- grant` and enter the
account email at the prompt. Use `revoke` to withdraw access. The backend checks
this permission on every equipment management request.

Open **Resurse → Gestionează echipamentele** and select the machine by room and number.

- **Verifică după ciclu** schedules an inspection after the current cycle. Existing
  reservations stay in the calendar, and the machine is closed to new bookings.
- **Scoate din funcțiune** ends the current reservation and cancels upcoming
  reservations for that machine. Affected residents see the reason in their
  calendar while the fault is active. Operators with access to reservation
  history can still see the reason after service is restored.
- **Repune în serviciu** opens the machine for new bookings. Cancelled reservations
  stay in history. Residents can book an available slot again.

**Notificări** shows shutdown, inspection and restoration notices to the
affected resident. During inspection, an operator can edit and send one
notice. On restoration, eligible residents can accept or decline a
five-minute offer. The cancelled original stays in history.

### Web Push

For browser alerts, export `VAPID_SUBJECT` (an HTTPS origin or a valid contact
`mailto:` URI), `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in the shell and recreate the
backend. Use a persistent VAPID key pair for the environment. With the backend
dependencies installed, the following Bash commands generate a new pair
without displaying the private key. Set the subject separately.

```bash
read -r VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY < <(
  cd backend && node --input-type=module -e 'import {generateVAPIDKeys} from "web-push"; const {publicKey, privateKey} = generateVAPIDKeys(); console.log(publicKey, privateKey)'
)
export VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY
```

Open **Notificări** and enable alerts on the device. For a phone test, use a
private test origin accessible over HTTPS and set the backend's `APP_ORIGIN`
to that exact origin. On iPhone, add the web app to the home screen and open
it there before enabling alerts. Use test accounts to verify an alert arrives
with the app closed and opens the matching notice.

### Reporting a laundry equipment fault

In **Resurse**, open a washer or dryer and select **Semnalează o defecțiune**.
Any authenticated resident can report a problem and follow it in **Sesizările mele**.

An operator with equipment management permission can open **Vezi sesizările**
from the equipment management page. New reports appear in the operator's
inbox and trigger Web Push on subscribed devices. Taking a report notifies
its author in the app. Resolving it notifies the author in the app and on
subscribed devices. When necessary,
**Rezolvă și repune în serviciu** closes the report and returns the equipment
to the reservation calendar through the existing restoration workflow.

After resolution the author can optionally confirm the repair. The checkmark
appears on the equipment for up to 48 hours and clears on a new report or
technical condition change. The confirmation stays in report history.

The laundry pilot covers part of the maintenance workflow tracked in
[issue #16](https://github.com/AlexBarac7/app-camin/issues/16).

## Roadmap

- Define Live-queue priority alongside Reservations and the reception notebook,
  then implement live updates, turn notifications, concurrency tests and
  integration with equipment faults.
  [Issue #10](https://github.com/AlexBarac7/app-camin/issues/10)
- Confirm the residence's no-show rules, including confirmation, strike
  correction and suspension. Implement the approved policy and idempotent jobs.
  [Issue #13](https://github.com/AlexBarac7/app-camin/issues/13)
- Add the reminder 10 minutes before a Reservation starts and the reminder
  15 minutes before use ends. Add email fallback in a later stage.
  [Project brief](CONTEXT.md) · [Issue #14](https://github.com/AlexBarac7/app-camin/issues/14)
- Define rolling fair-use quotas and configurable resource rules, including
  quiet hours and approved exceptions. Test the quota window, cancellations
  and concurrent requests. [Issue #15](https://github.com/AlexBarac7/app-camin/issues/15)
- Extend maintenance tickets beyond the laundry pilot. Define categories,
  locations and priority, then add photos with controlled access, resizing
  and object storage. [Issue #16](https://github.com/AlexBarac7/app-camin/issues/16)
- Add administrator announcements with optional read acknowledgement and
  usage and maintenance statistics. [Project brief](CONTEXT.md)
- Prepare production configuration and a release procedure for Railway.
  Verify the live app and demonstrate at least 10 resident accounts and 20
  real Reservations. [Issue #17](https://github.com/AlexBarac7/app-camin/issues/17)
