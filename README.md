# Căminul Meu

A shared resource management application for a student residence, co-working hub,
or residential building. The pilot covers the two laundry rooms and the drying
room in the residence.

The application includes resident access by invitation, the laundry inventory
and Reservation calendar, equipment fault management, maintenance reports for
equipment, rooms and shared spaces, and in-app and opt-in Web Push notifications.

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
| `APP_ORIGIN` | Exact app origin for invitations, password resets and write requests. Defaults to `http://localhost:5173`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | SMTP server, port and sender for approved resident invitations and password resets. |
| `SMTP_SECURITY`, `SMTP_USER`, `SMTP_PASSWORD` | Use `starttls` (default) or `tls` and provide SMTP credentials in the environment. |
| `CAMIN_LOCAL_TEST_ACCOUNTS` | Optional local test setting. Set to `true` in the shell to enable the two reserved test accounts in development. |
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

The browser status page lives at `/admin/stare-servicii` and requires Admin.
Set up the single owner account as described under [Local resident access](#local-resident-access).
To verify PostgreSQL from the terminal, run:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'
```

The endpoint and readiness contract is owned by [C-003](docs/agents/CONTRACTS.md#c-003--admin-service-status-and-internal-readiness).

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

After [First run](#first-run), create the owner account. Enter the owner's
address at the prompt and choose a password of 15–128 characters.

```bash
read -rsp "Admin password: " CAMIN_SETUP_PASSWORD
export CAMIN_SETUP_PASSWORD
echo
docker compose exec -e CAMIN_SETUP_PASSWORD backend npm run admin:setup
unset CAMIN_SETUP_PASSWORD
```

If the owner already has an activated account, run
`docker compose exec backend npm run service-status:access -- grant` and enter
that address. To transfer the single owner slot from an existing account, use
`revoke` with the previous address before granting it to the owner.

Residents choose **Solicită acces** on the welcome page and enter their email.
Admin opens the new in-app notice or selects **Cereri de acces și roluri** from
**Contul meu** and selects **Aprobă și trimite invitația**. The application
sends the activation link to the address from the request. If the email
server rejects the message, **Reîncearcă trimiterea** issues a new link and
invalidates the previous one. The one-time link expires in 48 hours.

The form shows whether the address already has an account, a pending request,
or an invitation. For a lost or expired link, choose **Nu ai activat contul?
Solicită o altă invitație** and enter the same address. Admin approves the
replacement before the old link is invalidated and a new link is sent.

Use **Respinge cererea** in **Cereri de acces** to close a pending request and
send a rejection email. If the request was for a replacement, the previous link
is revoked immediately. If the email fails, retry it from the rejected request.
The public form shows that a rejected request is closed.

The resident opens the link, chooses a password of 8–128 characters and signs
in from the welcome page or `/autentificare`. On the first successful sign-in
after a new invitation activation, the app offers **Consultă ghidul** and
**Mergi la resurse**. Later sign-ins open **Resurse** or the notification
from a direct link. Apply migration 017 before running the updated backend.

The phone navigation uses icons and labels across the bottom. On desktop it
appears on the left. Open **Ghid de utilizare** at `/ghid-de-utilizare` with
the **?** control in the portal. Contextual help opens the relevant guide
section. **Înapoi** restores the source page, including the selected equipment
and day when coming from a calendar.

Choose **Resurse** for links to both laundry rooms and the drying room.
Select an equipment card to see its technical condition, operating hours and
Reservation calendar. The washers and dryers follow the same weekday schedule,
08:00–20:00.
Open **Contul meu** at `/cont` to see the email and role or select **Deconectare**.
A session lasts 24 hours.

Invitation links use `http://localhost:5173` by default.
The API accepts that origin and `http://127.0.0.1:5173` in local development.
When serving the app at a different origin, set `APP_ORIGIN` to its exact
scheme, host and port, with no trailing slash, and recreate the backend.
The backend uses that origin in links and for write requests.
In development, setting `APP_ORIGIN` also keeps the two local origins enabled.

### Test invitation email locally

In the same shell as the database configuration, start the private test mailbox:

```bash
export SMTP_HOST=mailpit SMTP_PORT=1025 SMTP_SECURITY=local SMTP_FROM=invitatii@example.test
docker compose --profile mail up --build -d --wait
docker compose exec backend npm run migrate
```

Approve a test request in the app and open [the local mailbox](http://localhost:8025/)
to read the email and click **Activează contul**. Mailpit captures local messages.
If using the photo storage profile as well, include `--profile photos`.

For real delivery, set the SMTP host, port, authenticated credentials and
the verified sender address in the backend environment. Set `APP_ORIGIN`
to the HTTPS address recipients can open. Keep SMTP credentials in the shell
or deployment environment.

### Reset a password locally

Start Mailpit and apply migration 015 with the commands in
[Test invitation email locally](#test-invitation-email-locally). Select
**Am uitat parola** on the welcome or sign-in page and submit the email of an
activated account. The page shows the same confirmation for any valid address.
Open the message in [Mailpit](http://localhost:8025/) and select **Alege o parolă
nouă**. The latest link is valid for 30 minutes and can be used once.

Enter and confirm a password of 8–128 characters. When **Parola ta a fost
schimbată** appears, select **Înapoi la autentificare** and sign in with the
new password. The reset ends the account's previous sessions. You can request
another link from the sign-in page.

### Local test roles

Export `CAMIN_LOCAL_TEST_ACCOUNTS=true` in the same shell as the database
password and recreate the local backend with `docker compose up -d backend`.
Run the Admin setup command above with `admin@example.test` to create the local
Admin. For `rezident@example.test`, use the usual request, approval and
activation flow. Then use `docker compose exec backend npm run equipment:access -- grant`
or `revoke` and enter `rezident@example.test` to switch between Administrator
and Rezident. These test accounts sign in only with local test mode enabled.
Use a disposable or dedicated local database for tests involving these accounts.

### Inspect reservations and database tables

Admin and Administrator can filter reservation history at `/admin/rezervari`
and correct strikes. Each new strike adds an in-app notice for both roles.
Select **Mergi la rezervare** from the notice to open the exact Reservation.
Under **Limită zilnică**, either role can set the number of laundry Reservations
each resident can make for a local day of use. Migration 028 adds the setting
with an initial value of two. Saving a new limit affects future booking actions
and preserves existing Reservations.
Admin can browse the read-only equipment, reservations and migrations tables
at `/admin/baza-de-date`.

### Clean up expired sessions

With the backend running, clean up expired sessions from the repository root.

```bash
docker compose exec backend npm run sessions:cleanup
```

For a backend running locally, set the same `PG*` variables and run
`npm --prefix backend run sessions:cleanup`. The command deletes only expired
sessions and prints the number deleted. Active sessions remain usable.

### Managing laundry equipment faults

From **Cereri de acces și roluri**, Admin can set an activated account to
**Administrator** or return it to **Rezident**. The backend checks the account's
current role on every equipment management request.

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

**Notificări** groups messages by day and shows the available equipment,
interval, and offer status in each card. Select **OK** to mark a notice as read.
Open **Setări pentru alertele pe dispozitiv** in the inbox to enable alerts.
For a phone test, use a private test origin accessible over HTTPS and set the backend's `APP_ORIGIN`
to that exact origin. In the same shell, set
`__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` to the test origin's hostname before
starting Compose. On iPhone, add the web app to the home screen and open it
there before enabling alerts. Use test accounts to verify that an alert arrives
with the app closed and opens the matching notice.

On iPhone and iPad with iOS or iPadOS 16.4 or later, the installed app icon can
show the account's unread count when alerts and badges are enabled. Open the
installed app once to pick up the updated service worker. Trigger an existing
Web Push alert while the app is closed, then compare the icon count with
**Notificări**. Select **OK** on a notice to lower the count and clear it when
the last notice is read. Android launchers handle their own indicator, typically
a dot. [WebKit badging](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/)
· [Chrome badging](https://developer.chrome.com/docs/capabilities/web-apis/badging-api)

### Maintenance reports

In **Resurse**, open a washer or dryer and select **Semnalează o defecțiune**.
The application takes the equipment and location from the inventory. For a
room or shared space, select **Sesizare nouă** in **Sesizările mele** and
enter the category, location and description. The floor and one photo are optional.

Residents submit maintenance reports and can view them in **Sesizările mele**.
Admin and Administrator open **Sesizări de întreținere** from **Sesizări** in the
main navigation or from **Contul meu**. Operators manage reports submitted by
residents. New reports appear in the operator's
inbox and trigger Web Push on subscribed devices. The operator chooses
**Scăzută**, **Normală** or **Urgentă** when taking a report, which notifies
its author in the app. Resolving it notifies the author in the app and on
subscribed devices. When necessary,
**Rezolvă și repune în serviciu** closes the report and returns the equipment
to the reservation calendar through the existing restoration workflow.

After resolution the author can optionally confirm the repair. Equipment
reports can display a checkmark on the machine for up to 48 hours, until
another report or a technical condition change. The confirmation and photo
stay in the report history.

#### Add and view a photo

Select **Încarcă o poză** in either report form. On a phone, the device picker
offers the camera or gallery where supported. After selecting an image, use
**Elimină poza** to remove it or select another image to replace it before
submitting the report. The browser can resize large photos before upload.
If the connection drops during submission, check **Sesizările mele** before
sending again.

The report shows the attached photo as a thumbnail. Tap it to open the
full-screen viewer. Pinch or use **+** and **−** to zoom, then drag the
enlarged photo to see details. Tap the zoom percentage to fit the image to
the screen again. Tap **×** in the top-right corner or press **Escape** to
return to the same report.

### Local photo storage

The optional Compose profile `photos` starts SeaweedFS and creates the
private `camin-report-photos` bucket. To enable the camera and gallery upload
flow, provide credentials in the same shell as the PostgreSQL password.

```bash
read -rp "Photo storage access key: " PHOTO_S3_ACCESS_KEY
read -rsp "Photo storage secret key: " PHOTO_S3_SECRET_KEY
export PHOTO_S3_ACCESS_KEY PHOTO_S3_SECRET_KEY
echo
docker compose --profile photos up --build -d --wait
docker compose exec backend npm run migrate
```

Choose local credentials on the first run and reuse them with the existing
photo volume. The bucket stays inside the Compose network. The backend
accepts images up to 10 MiB and 32 megapixels and stores a JPEG copy with a
maximum edge of 1,600 pixels. It strips photo metadata and serves the image
only to its author and operators with current permission. With the profile
disabled, residents can submit reports without a photo. To stop the app and
photo storage while preserving their volumes, run `docker compose --profile photos stop`.

Maintenance scope and acceptance are tracked in
[issue #16](https://github.com/AlexBarac7/app-camin/issues/16).

### Live-queue and early finish

Apply migration 016, then open the calendar of a washer or dryer. Available
intervals can be booked directly. When today's schedule is full, choose
**Intră în Live-queue** or **Vezi următoarea zi disponibilă**. To join, enter the
duration you need. The calendar shows your position and updates while it is open.

When an interval opens, the first entrant whose cycle and handover fit gets
an in-app offer and, if enabled, Web Push. Accept within the displayed time
using **Începe** or **Rezervă intervalul**, depending on when it starts.
During a confirmed or exempt ongoing Reservation the holder can select
**Încheie**, which releases the remaining time after handover. A resident can leave the queue at any time.
Entries expire at closing. During an inspection, entries keep their positions.
A confirmed fault closes affected entries with the recorded reason.

For acceptance, sign in with two resident sessions and subscribe a phone under
**Notificări**. Join the same equipment with different durations and cancel a
future Reservation or end an active one early. Check the position changes in
both calendars and confirm that the first eligible resident receives the offer
with the app closed. [Issue #10](https://github.com/AlexBarac7/app-camin/issues/10)

### Daily and simultaneous laundry Reservation limits

The daily limit is shared by washers and dryers. A resident can hold at most
one washer and one dryer in overlapping Reservation blocks, including handover.
The same rules apply in the calendar, when accepting a Live-queue offer and
when resuming a Reservation after a fault. Cancelling before the scheduled
start frees a daily slot. A no-show consumes one slot. A resumed Reservation
and its original count together as one. If a pre-start cancellation freed a
slot and the resident has already filled it, the app can refuse the return offer.

## Laundry attendance

New calendar Reservations get an in-app reminder ten minutes before start
and a start alert at the reserved time. Devices subscribed under **Notificări**
also receive Web Push. Confirm in the calendar within ten minutes of the
reserved start. **Începe** already confirms an immediate Live-queue cycle.
A missed confirmation releases the block and records a strike. Usage shorter
than ten minutes is exempt. If an inspection prevents confirmation through
the deadline, the Reservation is kept and no strike is recorded. If service
resumes before the deadline, the resident can confirm in the time remaining.
The resident sees **Ai primit un strike** in **Notificări** and can open the
cancelled Reservation from there. Three strikes in seven days suspend access
for 48 hours by default and cancel future Reservations scheduled to start before
the suspension expires. Reservations starting at or after expiration remain
valid. Usage already started can finish. Admin and Administrator can change the two periods or
correct a strike with a reason under **Rezervări**. A correction that lifts
the suspension allows new Reservations. The cancellations stay in history.
[Issue #13](https://github.com/AlexBarac7/app-camin/issues/13)

## End-of-use reminder

An eligible Reservation receives a notice 15 minutes before use ends.
Devices subscribed under **Notificări** also receive Web Push. When the account
has no registered device, the backend sends the same reminder by email if SMTP
is configured. The usual 10-minute handover starts after use ends. A closing
block without handover ends at 20:00 and the reminder is due at 19:45. Apply
migrations 024 and 025 before running the updated backend.

For the phone check, follow [Web Push](#web-push), book an eligible test
Reservation, confirm its start, and close the app. Check that the reminder
arrives once and opens the Reservation in the calendar.
[Issue #14](https://github.com/AlexBarac7/app-camin/issues/14)

For an email check, use [Mailpit](#test-invitation-email-locally) with a test
account that has no registered push devices and check for one matching email
and one in-app notice.

## Roadmap
- Define rolling fair-use quotas and configurable resource rules, including
  quiet hours and approved exceptions. Test the quota window, cancellations
  and concurrent requests. [Issue #15](https://github.com/AlexBarac7/app-camin/issues/15)
- Add administrator announcements with optional read acknowledgement and
  usage and maintenance statistics. [Project brief](CONTEXT.md)
- Prepare production configuration and a release procedure for Railway,
  including the production object store for photos.
  Verify the live app and demonstrate at least 10 resident accounts and 20
  real Reservations. [Issue #17](https://github.com/AlexBarac7/app-camin/issues/17)
