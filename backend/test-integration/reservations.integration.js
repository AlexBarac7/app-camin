import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadDatabaseConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { newToken, tokenHash } from '../src/modules/auth/credentials.js';

test('authenticated laundry reservations on disposable PostgreSQL', async t => {
  assert.equal(process.env.PGDATABASE, 'app_camin_reservations_test');
  const db = createDatabase(loadDatabaseConfig());
  t.after(() => db.close());
  await runMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)), 'apply');
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { rows: users } = await db.query(
    "INSERT INTO users (email, password_hash) VALUES ('first@example.test', 'fixture'), ('second@example.test', 'fixture') RETURNING id");
  const cookies = [];
  for (const user of users) {
    const token = newToken();
    await db.query('INSERT INTO sessions (user_id, token_hash) VALUES ($1, $2)', [user.id, tokenHash(token)]);
    cookies.push('camin_session=' + token);
  }
  const { rows: [fixture] } = await db.query(`
    SELECT (SELECT id FROM laundry_machines WHERE technical_status = 'working' AND type = 'washer' LIMIT 1) AS machine,
           (SELECT id FROM laundry_machines WHERE technical_status = 'working' AND type = 'dryer' LIMIT 1) AS dryer,
           (SELECT id FROM laundry_machines WHERE technical_status = 'broken' LIMIT 1) AS broken,
           (SELECT id FROM laundry_machines WHERE technical_status = 'unspecified' LIMIT 1) AS unspecified,
           to_char(day, 'YYYY-MM-DD') AS day,
           ((day + time '10:00') AT TIME ZONE 'Europe/Bucharest') AS start
    FROM (SELECT (now() AT TIME ZONE 'Europe/Bucharest')::date + offset_day AS day
          FROM generate_series(1, 3) offset_day) days
    WHERE extract(isodow FROM day) <= 5 ORDER BY day LIMIT 1`);
  const path = '/api/laundry-machines/' + fixture.machine;
  const at = minutes => new Date(+fixture.start + minutes * 60_000).toISOString();
  const request = (path, method = 'GET', resident = 0, body) => fetch(
    'http://127.0.0.1:' + server.address().port + path, {
      method,
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json',
        ...(cookies[resident] && { cookie: cookies[resident] }) },
      body: JSON.stringify(body),
    });
  const book = (resident, from, to, machine = fixture.machine) => request(
    '/api/laundry-machines/' + machine + '/reservations', 'POST', resident,
    { startsAt: at(from), endsAt: at(to) });
  const calendar = resident => request(path + '/calendar?day=' + fixture.day, 'GET', resident);
  assert.equal((await calendar(2)).status, 401);
  assert.equal((await book(0, 0, 60, fixture.broken)).status, 409);
  assert.equal((await book(0, 0, 60, fixture.unspecified)).status, 409);

  const results = await Promise.all([book(0, 0, 60), book(1, 0, 60)]);
  assert.deepEqual(results.map(response => response.status).sort(), [201, 409]);
  const winner = results.findIndex(response => response.status === 201);
  const other = 1 - winner;
  const { id } = await results[winner].json();
  assert.equal((await results[other].json()).message, 'Intervalul tocmai a fost rezervat. Alege altul.');
  assert.deepEqual((await (await calendar(other)).json()).reservations, [{ startsAt: at(0), endsAt: at(60) }]);
  assert.equal((await (await calendar(winner)).json()).reservations[0].useEndsAt, at(50));
  const inventory = await (await request('/api/laundry-machines?availability=1')).json();
  const machine = inventory.find(machine => machine.id === fixture.machine);
  assert.equal(machine.status, 'available');
  assert.deepEqual(machine.nextReservation, { startsAt: at(0), endsAt: at(60) });
  assert.equal((await book(other, 55, 80)).status, 409);
  assert.equal((await book(other, 60, 90)).status, 201);

  const cancel = resident => request(path + '/reservations/' + id, 'DELETE', resident);
  assert.equal((await cancel(other)).status, 404);
  assert.equal((await cancel(winner)).status, 204);
  assert.equal((await cancel(winner)).status, 204);
  const replacement = await book(other, 0, 60);
  assert.equal(replacement.status, 201);
  const { id: replacementId } = await replacement.json();
  const historical = await db.query('SELECT cancelled_at FROM laundry_reservations WHERE id = $1', [id]);
  assert.ok(historical.rows[0].cancelled_at);
  await db.query(`UPDATE laundry_reservations SET starts_at = now() - interval '5 minutes',
    use_ends_at = now() + interval '30 minutes', ends_at = now() + interval '40 minutes' WHERE id = $1`, [replacementId]);
  assert.equal((await request(path + '/reservations/' + replacementId, 'DELETE', other)).status, 409);

  const adminReservations = '/api/admin/reservations';
  const adminTables = '/api/admin/database';
  for (const endpoint of [adminReservations, adminTables + '/equipment']) {
    assert.equal((await request(endpoint, 'GET', 2)).status, 401);
    assert.equal((await request(endpoint, 'GET', 1)).status, 403);
  }
  await db.query('UPDATE users SET can_view_service_status = true WHERE id = $1', [users[0].id]);
  const get = async endpoint => {
    const response = await request(endpoint);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  };
  const filtered = await get(adminReservations + '?machineId=' + fixture.machine + '&day=' + fixture.day + '&status=cancelled');
  assert.deepEqual(filtered.items.map(row => row.id), [id]);
  assert.equal(filtered.items[0].use_ends_at, at(50));
  assert.ok(filtered.items[0].cancelled_at);
  const active = await get(adminReservations + '?machineId=' + fixture.machine + '&day=' + fixture.day + '&status=active');
  assert.equal(active.items.length, 1);
  assert.equal(active.items[0].starts_at, at(60));
  assert.equal((await request(adminReservations + '?day=2026-02-30')).status, 400);
  assert.equal((await request(adminReservations + '?status=unknown')).status, 400);
  const first = await get(adminTables + '/equipment?page=1');
  const second = await get(adminTables + '/equipment?page=2');
  assert.equal(first.rows.length, 25);
  assert.equal(first.hasNext, true);
  assert.equal(second.rows.length, 5);
  assert.equal(second.hasNext, false);
  assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 30);
  assert.ok(first.columns.some(column => column.name === 'technical_status'));
  const reservations = await get(adminTables + '/reservations');
  assert.deepEqual(new Set(reservations.rows.map(row => row.id)), new Set([id, replacementId, active.items[0].id]));
  const migrations = await get(adminTables + '/migrations');
  assert.equal(migrations.rows.at(-1).filename, '005_laundry_reservations.sql');
  for (const table of ['users', 'sessions', 'invitations', 'schema_migrations']) {
    assert.equal((await request(adminTables + '/' + table)).status, 404);
  }
  assert.equal((await request(adminTables + '/equipment?page=0')).status, 400);
  assert.equal((await request(adminTables + '/equipment', 'POST', 0, {})).status, 404);
  await db.query('UPDATE users SET can_view_service_status = false WHERE id = $1', [users[0].id]);
  assert.equal((await request(adminReservations)).status, 403);

  for (const [machineId, threshold] of [[fixture.machine, 405], [fixture.dryer, 345]]) {
    assert.equal((await book(0, threshold - 5, 600, machineId)).status, 400);
    const closing = await book(0, threshold, 600, machineId);
    assert.equal(closing.status, 201);
    const entry = await closing.json();
    assert.equal(entry.useEndsAt, at(600));
    assert.equal(entry.endsAt, at(600));
  }
});
