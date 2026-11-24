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
  const filenames = migrations.rows.map(row => row.filename);
  const base = filenames.indexOf('005_laundry_reservations.sql');
  assert.ok(base >= 0);
  assert.equal(filenames[base + 1], '006_equipment_faults.sql');
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

  const offsetTimestamp = minutes => new Date(+new Date(at(minutes)) + 16 * 3600_000)
    .toISOString().replace('Z', '+16:00');
  const normalized = await request(path + '/reservations', 'POST', 0, {
    startsAt: offsetTimestamp(120), endsAt: offsetTimestamp(150),
  });
  assert.equal(normalized.status, 201);
  const entry = await normalized.json();
  assert.equal(entry.startsAt, at(120));
  assert.equal(entry.endsAt, at(150));

  const readMachine = async () => (await get('/api/laundry-machines?availability=1'))
    .find(machine => machine.id === fixture.machine);
  const occupied = await readMachine();
  assert.equal(occupied.status, 'occupied');
  assert.ok(occupied.observedAt < occupied.nextStatusAt);
  const { rows: [handover] } = await db.query(`
    UPDATE laundry_reservations
    SET starts_at = now() - interval '20 minutes', use_ends_at = now() - interval '5 minutes',
        ends_at = now() + interval '5 minutes'
    WHERE id = $1 RETURNING ends_at`, [replacementId]);
  const duringHandover = await readMachine();
  assert.equal(duringHandover.status, 'handover');
  assert.equal(duringHandover.nextStatusAt, handover.ends_at.toISOString());
  await db.query(`
    UPDATE laundry_reservations
    SET starts_at = now() - interval '30 minutes', use_ends_at = now() - interval '15 minutes',
        ends_at = now() - interval '5 minutes'
    WHERE id = $1`, [replacementId]);
  const available = await readMachine();
  assert.equal(available.status, 'available');
  assert.equal(available.nextStatusAt, at(60));
  const change = action => request(path + '/condition', 'POST', 0, { action });
  assert.equal((await change('stop')).status, 403);
  await db.query('UPDATE users SET can_manage_equipment = true WHERE id = $1', [users[0].id]);
  assert.equal((await change('inspect')).status, 409);
  for (const selected of [fixture.machine, fixture.dryer]) {
    const endpoint = '/api/laundry-machines/' + selected + '/condition';
    const operate = action => request(endpoint, 'POST', 0, { action });
    const { rows: [cycle] } = await db.query(`
      INSERT INTO laundry_reservations (machine_id,user_id,starts_at,use_ends_at,ends_at)
      VALUES ($1,$2,now()-interval '4 minutes',now()+interval '6 minutes',now()+interval '16 minutes')
      RETURNING id`, [selected, users[0].id]);
    const state = async () => (await get('/api/laundry-machines?availability=1')).find(item => item.id === selected);
    assert.equal((await operate('inspect')).status, 204);
    assert.equal((await state()).status, 'occupied');
    assert.equal((await book(1, 250, 280, selected)).status, 409);
    await db.query(`UPDATE laundry_reservations SET starts_at=now()-interval '40 minutes',
      use_ends_at=now()-interval '20 minutes', ends_at=now()-interval '10 minutes' WHERE id=$1`, [cycle.id]);
    const { rows: [next] } = await db.query(`
      INSERT INTO laundry_reservations (machine_id,user_id,starts_at,use_ends_at,ends_at)
      VALUES ($1,$2,now()-interval '2 minutes',now()+interval '8 minutes',now()+interval '18 minutes')
      RETURNING id`, [selected, users[1].id]);
    assert.equal((await state()).status, 'inspection');
    if (selected === fixture.dryer) {
      assert.equal((await operate('stop')).status, 204);
      const readCancellation = async () => (await db.query(
        'SELECT cancelled_at,cancellation_reason FROM laundry_reservations WHERE id=$1', [next.id])).rows[0];
      const first = await readCancellation();
      assert.ok(first.cancelled_at);
      assert.equal(first.cancellation_reason, 'Echipament defect');
      assert.equal((await operate('stop')).status, 204);
      assert.deepEqual(await readCancellation(), first);
    }
    assert.equal((await operate('restore')).status, 204);
    assert.equal((await state()).status, selected === fixture.machine ? 'occupied' : 'available');
  }

  // Force the second write to fail after the cancellation update.
  await db.query(`CREATE FUNCTION reject_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture'; END $$;
    CREATE TRIGGER reject_fault BEFORE UPDATE ON laundry_machines
    FOR EACH ROW EXECUTE FUNCTION reject_fault()`);
  assert.equal((await change('stop')).status, 500);
  assert.equal((await readMachine()).status, 'occupied');
  assert.ok((await (await calendar(other)).json()).reservations.length);
  await db.query('DROP TRIGGER reject_fault ON laundry_machines');
  const [raced, stopped] = await Promise.all([book(1, 200, 250), change('stop')]);
  assert.ok([201, 409].includes(raced.status));
  assert.equal(stopped.status, 204);
  assert.equal((await change('stop')).status, 204);
  assert.equal((await readMachine()).status, 'broken');
  const mine = await (await calendar(other)).json();
  assert.ok(mine.cancellations.some(row => row.startsAt === at(60)));
  assert.ok(!(await (await calendar(winner)).json()).cancellations.some(row => row.startsAt === at(60)));
  assert.equal(mine.reservations.length, 0);
  assert.equal((await change('restore')).status, 204);
  assert.equal((await readMachine()).status, 'available');
  assert.deepEqual((await (await calendar(other)).json()).cancellations, []);
  assert.equal((await change('stop')).status, 204);
  assert.deepEqual((await (await calendar(other)).json()).cancellations, []);
  assert.equal((await change('restore')).status, 204);
  assert.equal((await book(1, 60, 90)).status, 201);
  await db.query('UPDATE users SET can_manage_equipment = false WHERE id = $1', [users[0].id]);
  assert.equal((await change('stop')).status, 403);
});
