import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadDatabaseConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { newToken, tokenHash } from '../src/modules/auth/credentials.js';
import { dispatchPushDeliveries } from '../src/modules/notifications/push.js';

test('authenticated laundry reservations on disposable PostgreSQL', async t => {
  assert.equal(process.env.PGDATABASE, 'app_camin_reservations_test');
  const db = createDatabase(loadDatabaseConfig());
  t.after(() => db.close());
  await runMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)), 'apply');
  const server = createApp(db, undefined, 'fixture-public-key').listen(0, '127.0.0.1');
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
  const { rows: [unknownDryer] } = await db.query(`
    INSERT INTO laundry_machines (name, location, room, type, label, technical_status)
    VALUES ('Test dryer', 'Test location', '2', 'dryer', 'TEST', 'unspecified') RETURNING id`);
  const { rows: [fixture] } = await db.query(`
    SELECT (SELECT id FROM laundry_machines WHERE technical_status = 'working' AND type = 'washer' LIMIT 1) AS machine,
           (SELECT id FROM laundry_machines WHERE technical_status = 'working' AND type = 'dryer'
            AND room = 'uscatorie' LIMIT 1) AS dryer,
           (SELECT id FROM laundry_machines WHERE technical_status = 'broken' LIMIT 1) AS broken,
           $1::integer AS unspecified,
           to_char(day, 'YYYY-MM-DD') AS day,
           ((day + time '10:00') AT TIME ZONE 'Europe/Bucharest') AS start
    FROM (SELECT (now() AT TIME ZONE 'Europe/Bucharest')::date + offset_day AS day
          FROM generate_series(1, 3) offset_day) days
    WHERE extract(isodow FROM day) <= 5 ORDER BY day LIMIT 1`, [unknownDryer.id]);
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
  await db.query('DELETE FROM laundry_machines WHERE id = $1', [unknownDryer.id]);

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
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
    keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16).toString('base64url') },
  };
  const pushSubscription = '/api/notifications/push-subscription';
  assert.equal((await request(pushSubscription, 'PUT', 1, subscription)).status, 204);
  assert.equal((await request(pushSubscription, 'PUT', 0, subscription)).status, 409);
  assert.equal((await request(pushSubscription, 'DELETE', 0, subscription)).status, 204);
  const notices = async resident => {
    const response = await request('/api/notifications', 'GET', resident);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return (await response.json()).items;
  };
  assert.equal((await request('/api/notifications', 'GET', 2)).status, 401);
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
    const inspection = {
      action: 'notify-inspection',
      inspectionStartedAt: (await state()).inspectionStartedAt,
      message: 'Mesaj editat pentru verificare.',
    };
    assert.equal((await request(endpoint, 'POST', 1, inspection)).status, 403);
    const sendInspection = () => request(endpoint, 'POST', 0, inspection);
    assert.deepEqual((await Promise.all([sendInspection(), sendInspection()])).map(response => response.status), [204, 204]);
    const inspectionNotices = (await notices(0)).filter(item => item.machineId === selected && item.kind === 'inspection');
    assert.deepEqual(inspectionNotices.map(item => item.message), [inspection.message]);
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
      const shutdown = (await notices(1)).filter(item => item.machineId === selected && item.kind === 'shutdown');
      assert.equal(shutdown.length, 1);
      assert.match(shutdown[0].message, /Rezervarea ta a fost anulată/);
      const operatorNotices = (await notices(0)).filter(item => item.machineId === selected && item.kind === 'shutdown');
      assert.equal(operatorNotices.length, 1);
      assert.match(operatorNotices[0].message, /Rezervarea ta a fost anulată/);
      assert.equal((await db.query('SELECT 1 FROM push_deliveries WHERE notification_id = $1', [shutdown[0].id])).rowCount, 1);
      assert.equal((await operate('stop')).status, 204);
      assert.deepEqual(await readCancellation(), first);
    }
    assert.equal((await operate('restore')).status, 204);
    assert.equal((await state()).status, selected === fixture.machine ? 'occupied' : 'available');
    if (selected === fixture.dryer) {
      const restored = (await notices(1)).find(item => item.machineId === selected && item.kind === 'restored');
      assert.match(restored.message, /^Uscătorul .+ funcționează din nou\. Alege un alt interval din calendar\.$/);
    }
  }

  // Force the second write to fail after the cancellation update.
  await db.query(`CREATE FUNCTION reject_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture'; END $$;
    CREATE TRIGGER reject_fault BEFORE UPDATE ON laundry_machines
    FOR EACH ROW EXECUTE FUNCTION reject_fault()`);
  const beforeRollback = await notices(0);
  assert.equal((await change('stop')).status, 500);
  assert.equal((await readMachine()).status, 'occupied');
  assert.ok((await (await calendar(other)).json()).reservations.length);
  assert.deepEqual(await notices(0), beforeRollback);
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
  const offerFor = async resident => (await notices(resident))
    .find(item => item.offer?.startsAt === at(60) && item.offer.status === 'pending').offer;
  const answer = (offer, resident, action) => request(
    '/api/notifications/offers/' + offer.id, 'POST', resident, { action });
  const firstOffer = await offerFor(other);
  const restorationNotice = (await notices(other)).find(item => item.offer?.id === firstOffer.id);
  assert.match(restorationNotice.message, /^Mașina de spălat .+ funcționează din nou\. Îți păstrăm intervalul timp de cinci minute\. Dacă vrei să-l folosești, apasă „Continuă rezervarea”\.$/);
  assert.equal((await answer(firstOffer, winner, 'accept')).status, 404);
  assert.equal((await book(winner, 60, 90)).status, 409);
  assert.deepEqual((await (await calendar(winner)).json()).holds.find(hold => hold.startsAt === at(60)),
    { startsAt: at(60), endsAt: at(90) });
  assert.equal((await change('stop')).status, 204);
  assert.equal((await answer(firstOffer, other, 'accept')).status, 409);
  assert.deepEqual((await (await calendar(other)).json()).cancellations, []);
  assert.equal((await change('restore')).status, 204);
  const secondOffer = await offerFor(other);
  assert.notEqual(secondOffer.id, firstOffer.id);
  assert.equal((await answer(secondOffer, other, 'decline')).status, 204);
  assert.equal((await book(1, 60, 90)).status, 201);

  const { rows: [spare] } = await db.query(`
    SELECT id FROM laundry_machines WHERE technical_status = 'working' AND type = 'washer'
      AND id <> $1 AND room IS NOT NULL ORDER BY id LIMIT 1`, [fixture.machine]);
  const operateSpare = action => request('/api/laundry-machines/' + spare.id + '/condition', 'POST', 0, { action });
  assert.equal((await operateSpare('stop')).status, 204);
  assert.equal((await operateSpare('restore')).status, 204);
  assert.ok(!(await notices(0)).some(item => item.machineId === spare.id));
  assert.equal((await book(0, 60, 75, spare.id)).status, 201);
  assert.equal((await book(1, 100, 130, spare.id)).status, 201);
  await db.query(`INSERT INTO laundry_reservations (machine_id,user_id,starts_at,use_ends_at,ends_at)
    VALUES ($1,$2,now()-interval '5 minutes',now()+interval '70 minutes',now()+interval '80 minutes')`,
  [spare.id, users[0].id]);
  assert.equal((await operateSpare('stop')).status, 204);
  assert.ok((await notices(0)).some(item => item.machineId === spare.id && item.message.includes('recupera hainele')));
  assert.equal((await operateSpare('restore')).status, 204);
  const offersForSpare = async resident => (await notices(resident))
    .filter(item => item.machineId === spare.id && item.offer?.status === 'pending').map(item => item.offer);
  const future = (await offersForSpare(0)).find(offer => offer.startsAt === at(60));
  const ongoing = (await offersForSpare(0)).find(offer => offer.id !== future.id);
  const [accepted, replayed, blocked] = await Promise.all([
    answer(future, 0, 'accept'), answer(future, 0, 'accept'), book(1, 60, 75, spare.id),
  ]);
  assert.deepEqual([accepted.status, replayed.status].sort(), [200, 201]);
  const [acceptedData, replayedData] = await Promise.all([accepted.json(), replayed.json()]);
  assert.deepEqual(acceptedData, replayedData);
  const resumedResponse = await answer(ongoing, 0, 'accept');
  assert.equal(resumedResponse.status, 201);
  const resumedData = await resumedResponse.json();
  const { rows: [resumed] } = await db.query(`
    SELECT starts_at, use_ends_at, ends_at, (SELECT count(*)::integer FROM laundry_reservations
      WHERE machine_id = $2 AND cancelled_at IS NULL) AS active_count
    FROM laundry_reservations WHERE id = $1`, [resumedData.id, spare.id]);
  assert.ok(resumed.starts_at >= new Date(ongoing.startsAt));
  assert.equal(resumed.ends_at.toISOString(), ongoing.endsAt);
  assert.equal(resumed.ends_at - resumed.use_ends_at, 600_000);
  assert.equal(resumed.active_count, 2);
  assert.equal(blocked.status, 409);
  const [expires] = await offersForSpare(1);
  await db.query("UPDATE laundry_restoration_offers SET expires_at = now() - interval '1 second' WHERE id = $1", [expires.id]);
  assert.equal((await answer(expires, 1, 'accept')).status, 409);
  assert.equal((await book(0, 100, 130, spare.id)).status, 201);
  const { id: expiredNotice } = (await notices(1)).find(item => item.offer?.id === expires.id);
  await db.query("UPDATE push_deliveries SET next_attempt_at = now() - interval '1 minute' WHERE notification_id = $1",
    [expiredNotice]);
  const sent = [];
  await dispatchPushDeliveries(db, async (_subscription, payload) => {
    sent.push(JSON.parse(payload).id);
    throw Object.assign(new Error('fixture'), { statusCode: 503 });
  });
  assert.ok(sent.length > 0);
  assert.ok(!sent.includes(expiredNotice));
  assert.equal((await db.query('SELECT 1 FROM push_deliveries WHERE notification_id = $1', [expiredNotice])).rowCount, 0);
  const retried = await db.query('SELECT 1 FROM push_deliveries WHERE attempts = 1 AND next_attempt_at > now()');
  assert.equal(retried.rowCount, sent.length);
  assert.equal((await request(pushSubscription, 'DELETE', 1, subscription)).status, 204);
  assert.equal((await db.query('SELECT 1 FROM push_deliveries')).rowCount, 0);

  assert.equal((await book(1, 160, 190, spare.id)).status, 201);
  assert.equal((await operateSpare('stop')).status, 204);
  assert.equal((await operateSpare('restore')).status, 204);
  const atRisk = (await offersForSpare(1)).find(offer => offer.startsAt === at(160));
  const [newShutdown, attemptedAcceptance] = await Promise.all([
    operateSpare('stop'), answer(atRisk, 1, 'accept'),
  ]);
  assert.equal(newShutdown.status, 204);
  assert.ok([201, 409].includes(attemptedAcceptance.status));
  const remaining = await db.query(
    'SELECT id FROM laundry_reservations WHERE machine_id = $1 AND cancelled_at IS NULL', [spare.id]);
  assert.equal(remaining.rowCount, 0);

  const unreadCount = async resident => {
    const response = await request('/api/notifications/unread-count', 'GET', resident);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return (await response.json()).unreadCount;
  };
  const markRead = (id, resident) => request('/api/notifications/' + id + '/read', 'PUT', resident);
  const inbox = await notices(0);
  assert.ok(inbox.length >= 2);
  assert.ok(inbox.every(item => item.readAt === null));
  assert.equal(await unreadCount(0), inbox.length);
  assert.equal((await request('/api/notifications/unread-count', 'GET', 2)).status, 401);
  assert.equal((await markRead(inbox[0].id, 1)).status, 404);
  const response = await markRead(inbox[0].id, 0);
  assert.equal(response.status, 200);
  const { readAt } = await response.json();
  assert.ok(readAt);
  assert.deepEqual(await (await markRead(inbox[0].id, 0)).json(), { readAt });
  assert.equal(await unreadCount(0), inbox.length - 1);
  assert.equal((await notices(0)).find(item => item.id === inbox[0].id).readAt, readAt);
  assert.equal((await notices(0)).find(item => item.id === inbox[1].id).readAt, null);
  for (const item of inbox.slice(1)) assert.equal((await markRead(item.id, 0)).status, 200);
  assert.equal(await unreadCount(0), 0);
  assert.equal((await notices(0)).length, inbox.length);
  await db.query('UPDATE users SET can_manage_equipment = false WHERE id = $1', [users[0].id]);
  assert.equal((await change('stop')).status, 403);

  const roomTwoDryers = (await (await request('/api/laundry-machines?availability=1')).json())
    .filter(machine => machine.room === '2' && machine.type === 'dryer');
  assert.deepEqual(roomTwoDryers.map(machine => [machine.label, machine.technicalStatus, machine.status]), [
    ['1A', 'working', 'available'], ['2A', 'working', 'available'],
  ]);
  for (const dryer of roomTwoDryers) {
    assert.equal((await book(0, 0, 60, dryer.id)).status, 201);
  }

  await t.test('laundry reports, targeted notices and temporary verification', async () => {
    const reports = '/api/laundry-reports';
    const dryer = roomTwoDryers[0];
    const draft = { machineId: dryer.id, description: 'Tamburul nu se rotește.' };
    const action = (id, name, resident, body = {}) => request(reports + '/' + id + '/' + name, 'POST', resident, body);
    const list = async (resident, operator = false) =>
      (await (await request(reports + (operator ? '/operator' : ''), 'GET', resident)).json()).items;
    const reportMachine = async () => (await (await request('/api/laundry-machines?availability=1')).json())
      .find(machine => machine.id === dryer.id);

    assert.equal((await request(reports, 'POST', 2, draft)).status, 401);
    assert.equal((await request(reports + '/operator', 'GET', 1)).status, 403);
    assert.equal((await request(reports, 'POST', 1, { ...draft, description: ' ' })).status, 400);
    await db.query('UPDATE users SET can_manage_equipment = true WHERE id = $1', [users[0].id]);
    await db.query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ($1, 'https://fcm.googleapis.com/fcm/send/report-operator', $3, $4),
             ($2, 'https://fcm.googleapis.com/fcm/send/report-resident', $3, $4)`,
    [users[0].id, users[1].id, subscription.keys.p256dh, subscription.keys.auth]);
    const created = await request(reports, 'POST', 1, draft);
    assert.equal(created.status, 201);
    const { id } = await created.json();
    assert.equal((await list(1))[0].status, 'new');
    assert.deepEqual(await list(0), []);
    assert.equal((await reportMachine()).technicalStatus, 'working');
    assert.equal((await action(id, 'take', 1)).status, 403);
    assert.equal((await action(id, 'verify', 1)).status, 409);
    const taken = await Promise.all([action(id, 'take', 0), action(id, 'take', 0)]);
    assert.deepEqual(taken.map(response => response.status), [204, 204]);
    const getRevision = async () => (await list(0, true)).find(report => report.id === id).machineRevision;
    const beforeShutdown = await getRevision();
    assert.equal((await request('/api/laundry-machines/' + dryer.id + '/condition', 'POST', 0, { action: 'stop' })).status, 204);
    assert.equal((await action(id, 'resolve', 0, { machineRevision: beforeShutdown })).status, 409);
    const machineRevision = await getRevision();
    const resolved = await Promise.all([
      action(id, 'resolve', 0, { machineRevision }), action(id, 'resolve', 0, { machineRevision }),
    ]);
    assert.deepEqual(resolved.map(response => response.status), [204, 204]);
    assert.equal((await list(1))[0].status, 'resolved');
    assert.equal((await reportMachine()).technicalStatus, 'working');
    assert.equal((await book(1, 80, 140, dryer.id)).status, 201);
    assert.equal((await action(id, 'verify', 0)).status, 404);
    assert.equal((await action(id, 'verify', 1)).status, 204);
    assert.equal((await action(id, 'verify', 1)).status, 204);
    const verified = (await list(1))[0];
    assert.equal(verified.status, 'verified');
    assert.equal(Date.parse((await reportMachine()).repairVerifiedUntil) - Date.parse(verified.verifiedAt), 48 * 60 * 60 * 1000);

    const deliveries = await db.query(`
      SELECT notice.kind, notice.user_id, count(delivery.subscription_id)::integer AS deliveries
      FROM laundry_notifications notice LEFT JOIN push_deliveries delivery ON delivery.notification_id = notice.id
      WHERE notice.report_id = $1 GROUP BY notice.id ORDER BY notice.id`, [id]);
    assert.deepEqual(deliveries.rows, [
      { kind: 'report-new', user_id: users[0].id, deliveries: 1 },
      { kind: 'report-taken', user_id: users[1].id, deliveries: 0 },
      { kind: 'report-resolved', user_id: users[1].id, deliveries: 1 },
    ]);
    await db.query("UPDATE laundry_machines SET repair_verified_until = now() - interval '1 second' WHERE id = $1", [dryer.id]);
    assert.equal((await reportMachine()).repairVerifiedUntil, undefined);
    await db.query("UPDATE laundry_machines SET repair_verified_until = now() + interval '1 hour' WHERE id = $1", [dryer.id]);
    const another = await request(reports, 'POST', 1, draft);
    assert.equal(another.status, 201);
    assert.equal((await reportMachine()).repairVerifiedUntil, undefined);
    assert.equal((await action(id, 'verify', 1)).status, 204);
    assert.equal((await reportMachine()).repairVerifiedUntil, undefined);
    assert.equal((await reportMachine()).technicalStatus, 'working');

    const { rows: [unconfirmed] } = await db.query(`
      INSERT INTO laundry_machines (name, location, room, type, label, technical_status)
      VALUES ('Test dryer', 'Test location', '2', 'dryer', 'TEST', 'unspecified') RETURNING id`);
    const extra = { ...draft, machineId: unconfirmed.id };
    const report = await (await request(reports, 'POST', 1, extra)).json();
    assert.equal((await action(report.id, 'take', 0)).status, 204);
    const operatorView = (await list(0, true)).find(item => item.id === report.id);
    assert.equal(operatorView.technicalStatus, 'unspecified');
    assert.equal((await action(report.id, 'resolve', 0, { machineRevision: operatorView.machineRevision })).status, 204);
    assert.equal((await book(1, 80, 140, unconfirmed.id)).status, 201);
    assert.equal((await request(reports, 'POST', 1, extra)).status, 201);
    assert.equal((await action(report.id, 'verify', 1)).status, 204);
    const { rows: [equipment] } = await db.query(
      'SELECT technical_status, repair_verified_until FROM laundry_machines WHERE id = $1', [unconfirmed.id]);
    assert.deepEqual(equipment, { technical_status: 'working', repair_verified_until: null });
  });
});
