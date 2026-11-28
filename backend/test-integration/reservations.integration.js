import assert from 'node:assert/strict';
import { once } from 'node:events';
import sharp from 'sharp';
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
  const objects = new Map();
  let storageUnavailable = false;
  const photos = {
    async put(key, bytes) {
      if (storageUnavailable) throw new Error('fixture storage unavailable');
      objects.set(key, bytes);
    },
    async get(key) { return objects.get(key); },
    async remove(key) { objects.delete(key); },
  };
  const server = createApp(db, undefined, 'fixture-public-key', photos).listen(0, '127.0.0.1');
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
  const pushUnreadCounts = [];
  const expectedPushCount = (await notices(1)).filter(notice => !notice.readAt).length;
  await dispatchPushDeliveries(db, async (_subscription, payload) => {
    const { id, unreadCount } = JSON.parse(payload);
    sent.push(id);
    pushUnreadCounts.push(unreadCount);
    throw Object.assign(new Error('fixture'), { statusCode: 503 });
  });
  assert.ok(sent.length > 0);
  assert.ok(pushUnreadCounts.every(count => count === expectedPushCount));
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
    const action = (id, name, resident, body = name === 'take' ? { priority: 'normal' } : {}) =>
      request(reports + '/' + id + '/' + name, 'POST', resident, body);
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

  await t.test('Live-queue releases cancelled and shortened blocks without displacing bookings', async t => {
    const { advanceWaitingQueues } = await import('../src/modules/laundry/live-queue.js');
    let clock = at(240);
    const fixedTime = (query, args = []) => {
      if (!/clock_timestamp\(\) AS now|statement_timestamp\(\)/.test(query)) return [query, args];
      const parameter = '$' + (args.length + 1) + '::timestamptz';
      return [query.replaceAll('clock_timestamp() AS now', parameter + ' AS now')
        .replaceAll('statement_timestamp()', parameter), [...args, clock]];
    };
    const database = {
      ...db,
      query: (query, args) => db.query(...fixedTime(query, args)),
      async connect() {
        const client = await db.connect();
        return { query: (query, args) => client.query(...fixedTime(query, args)),
          release: discard => client.release(discard) };
      },
    };
    const liveServer = createApp(database, undefined, 'fixture-public-key').listen(0, '127.0.0.1');
    await once(liveServer, 'listening');
    t.after(() => { liveServer.closeAllConnections(); liveServer.close(); });
    const { rows: [machine] } = await db.query(`
      INSERT INTO laundry_machines (name, location, room, type, label, technical_status)
      VALUES ('Queue washer', 'Test location', '1', 'washer', 'QUEUE', 'working') RETURNING id`);
    const endpoint = '/api/laundry-machines/' + machine.id;
    const queueCookies = [...cookies];
    const send = (resident, url, method = 'GET', body, signal) =>
      fetch('http://127.0.0.1:' + liveServer.address().port + url, {
        signal, method, headers: { origin: 'http://localhost:5173', 'content-type': 'application/json',
          ...(queueCookies[resident] && { cookie: queueCookies[resident] }) }, body: JSON.stringify(body),
      });
    const { rows: [resident] } = await db.query(`
      INSERT INTO users (email, password_hash) VALUES ('queue@example.test', 'fixture') RETURNING id`);
    const token = newToken();
    await db.query('INSERT INTO sessions (user_id, token_hash) VALUES ($1, $2)', [resident.id, tokenHash(token)]);
    await db.query(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)`,
    [resident.id, 'https://fcm.googleapis.com/fcm/send/queue-fixture', subscription.keys.p256dh, subscription.keys.auth]);
    const short = 3;
    queueCookies[short] = 'camin_session=' + token;
    const add = async (who, starts, useEnds, ends) => (await db.query(`
      INSERT INTO laundry_reservations (machine_id, user_id, starts_at, use_ends_at, ends_at)
      VALUES ($1, $2, $3, $4, $5) RETURNING id`, [machine.id, users[who].id, at(starts), at(useEnds), at(ends)])).rows[0].id;
    const inbox = async who => (await (await send(who, '/api/notifications')).json()).items
      .filter(notice => notice.machineId === machine.id);
    const join = (who, durationMinutes) => send(who, endpoint + '/queue', 'POST', { durationMinutes });
    const answer = (who, offer, action = 'accept') => send(who, endpoint + '/queue/offers/' + offer.id, 'POST', { action });
    const ongoing = await add(0, 210, 290, 300);
    const cancelled = await add(0, 300, 350, 360);
    await add(0, 360, 390, 400);
    await add(0, 400, 590, 600);
    assert.equal((await join(2, 45)).status, 401);
    assert.equal((await join(1, 90)).status, 201);
    assert.equal((await join(short, 45)).status, 201);
    assert.equal((await join(short, 45)).status, 409);

    const watch = async who => {
      const abort = new AbortController();
      const response = await send(who, endpoint + '/queue/events', 'GET', undefined,
        AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]));
      t.after(() => abort.abort());
      assert.match(response.headers.get('content-type'), /^text\/event-stream/);
      const reader = response.body.getReader();
      let buffer = '';
      return async () => {
        while (!buffer.includes('\n\n')) {
          const packet = await reader.read();
          assert.equal(packet.done, false);
          buffer += new TextDecoder().decode(packet.value);
        }
        const end = buffer.indexOf('\n\n');
        const event = buffer.slice('data: '.length, end);
        buffer = buffer.slice(end + 2);
        return JSON.parse(event);
      };
    };
    const first = await watch(1);
    const second = await watch(short);
    assert.deepEqual((await first()).entry, { position: 1, durationMinutes: 90 });
    assert.deepEqual((await second()).entry, { position: 2, durationMinutes: 45 });

    assert.equal((await send(0, endpoint + '/reservations/' + cancelled, 'DELETE')).status, 204);
    const offer = (await second()).offer;
    assert.equal(offer.immediate, false);
    assert.equal(offer.startsAt, at(300));
    assert.equal(offer.endsAt, at(355));
    assert.equal((await first()).offer, null);
    assert.equal((await answer(1, offer)).status, 404);
    assert.equal((await send(1, endpoint + '/reservations', 'POST', { startsAt: at(300), endsAt: at(355) })).status, 409);
    const accepted = await Promise.all([answer(short, offer), answer(short, offer)]);
    assert.deepEqual(accepted.map(response => response.status).sort(), [200, 201]);
    const acceptedReservation = (await accepted[0].json()).id;
    assert.equal((await accepted[1].json()).id, acceptedReservation);
    const turns = (await inbox(short)).filter(notice => notice.kind === 'queue-turn');
    assert.equal(turns.length, 1);
    assert.equal((await db.query('SELECT 1 FROM push_deliveries WHERE notification_id = $1', [turns[0].id])).rowCount, 1);

    assert.equal((await join(short, 30)).status, 201);
    assert.equal((await send(0, endpoint + '/reservations/' + ongoing + '/finish', 'POST')).status, 204);
    const [shortened] = (await db.query(`
      SELECT use_ends_at, ends_at, original_ends_at FROM laundry_reservations WHERE id = $1`, [ongoing])).rows;
    assert.equal(shortened.use_ends_at.toISOString(), at(240));
    assert.equal(shortened.ends_at.toISOString(), at(250));
    assert.equal(shortened.original_ends_at.toISOString(), at(300));
    const earlyOffer = (await inbox(short)).find(notice => notice.offer?.status === 'pending').offer;
    assert.equal(earlyOffer.startsAt, at(250));
    assert.equal(earlyOffer.endsAt, at(290));
    assert.equal((await send(1, endpoint + '/reservations/' + ongoing + '/finish', 'POST')).status, 404);
    clock = at(245);
    await Promise.all([advanceWaitingQueues(database), advanceWaitingQueues(database)]);
    assert.equal((await answer(short, earlyOffer)).status, 409);
    assert.equal((await inbox(short)).find(notice => notice.offer?.id === earlyOffer.id).offer.status, 'expired');
    assert.equal((await inbox(1)).filter(notice => notice.kind === 'queue-turn').length, 0);

    const { rows: [operator] } = await db.query('SELECT can_manage_equipment FROM users WHERE id = $1', [users[0].id]);
    await db.query('UPDATE users SET can_manage_equipment = true WHERE id = $1', [users[0].id]);
    t.after(() => db.query('UPDATE users SET can_manage_equipment = $2 WHERE id = $1',
      [users[0].id, operator.can_manage_equipment]));
    clock = at(310);
    const condition = body => send(0, endpoint + '/condition', 'POST', body);
    assert.equal((await condition({ action: 'inspect' })).status, 204);
    const { rows: [state] } = await db.query('SELECT inspection_started_at FROM laundry_machines WHERE id = $1', [machine.id]);
    assert.equal((await condition({ action: 'notify-inspection', message: 'Verificare după ciclu.',
      inspectionStartedAt: state.inspection_started_at.toISOString() })).status, 204);
    assert.equal((await inbox(1)).filter(notice => notice.kind === 'inspection').length, 1);
    assert.equal((await join(short, 15)).status, 409);
    assert.equal((await condition({ action: 'restore' })).status, 204);
    assert.equal((await condition({ action: 'inspect' })).status, 204);
    assert.equal((await condition({ action: 'stop' })).status, 204);
    assert.equal((await inbox(1)).filter(notice => notice.kind === 'shutdown').length, 1);
    const { rows: [ended] } = await db.query(`
      SELECT end_reason FROM laundry_queue_entries WHERE machine_id = $1 AND user_id = $2`, [machine.id, users[1].id]);
    assert.equal(ended.end_reason, 'Echipament defect');
    assert.equal((await condition({ action: 'restore' })).status, 204);
    const shortRestoration = (await inbox(0)).find(notice =>
      notice.kind === 'restored' && notice.offer?.startsAt === at(360));
    assert.equal(shortRestoration.offer.endsAt, at(400));
    assert.equal((await send(0, '/api/notifications/offers/' + shortRestoration.offer.id,
      'POST', { action: 'accept' })).status, 201);
    assert.equal((await join(1, 180)).status, 201);

    const dryer = '/api/laundry-machines/' + fixture.dryer;
    assert.equal((await send(1, dryer + '/queue', 'POST', { durationMinutes: 10 })).status, 409);
    assert.equal((await send(short, dryer + '/queue', 'POST', { durationMinutes: 10 })).status, 201);
    const dryerNotice = (await (await send(short, '/api/notifications')).json()).items
      .find(notice => notice.machineId === fixture.dryer && notice.kind === 'queue-turn');
    assert.equal(dryerNotice.offer.immediate, true);
    const start = await send(short, dryer + '/queue/offers/' + dryerNotice.offer.id, 'POST', { action: 'accept' });
    assert.equal(start.status, 201);
    const { rows: [cycle] } = await db.query('SELECT starts_at, use_ends_at FROM laundry_reservations WHERE id = $1',
      [(await start.json()).id]);
    assert.equal(cycle.starts_at.toISOString(), at(310));
    assert.equal(cycle.use_ends_at.toISOString(), at(320));

    clock = at(600);
    await advanceWaitingQueues(database);
    assert.equal((await join(short, 10)).status, 409);
    const result = await db.query(`
      SELECT end_reason FROM laundry_queue_entries WHERE machine_id = $1 AND user_id = $2 ORDER BY id DESC LIMIT 1`,
    [machine.id, users[1].id]);
    assert.equal(result.rows[0].end_reason, 'Închis');
  });

  await t.test('room and common-space reports with priority and protected photos', async () => {
    const reports = '/api/laundry-reports';
    const room = { category: 'plumbing', locationType: 'room', location: 'Test room', floor: '2', description: 'Test leak.' };
    const list = async (resident, operator = false) =>
      (await (await request(reports + (operator ? '/operator' : ''), 'GET', resident)).json()).items;
    const action = (id, name, resident, body = {}) => request(reports + '/' + id + '/' + name, 'POST', resident, body);
    const { rows: [otherResident] } = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ('other@example.test', 'fixture') RETURNING id");
    const token = newToken();
    await db.query('INSERT INTO sessions (user_id, token_hash) VALUES ($1, $2)', [otherResident.id, tokenHash(token)]);
    cookies[3] = 'camin_session=' + token;
    const { rows: [initial] } = await db.query('SELECT count(*) FROM laundry_reservations');
    assert.equal((await request(reports, 'POST', 1, { ...room, category: 'unknown' })).status, 400);
    assert.equal((await request(reports, 'POST', 1, { ...room, location: ' ' })).status, 400);
    const common = await request(reports, 'POST', 1, { ...room, locationType: 'shared', location: 'Test kitchen' });
    assert.equal(common.status, 201);

    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#456789' } })
      .withExif({ IFD0: { ImageDescription: 'Synthetic test metadata' } }).png().toBuffer();
    const attach = (bytes, contentType = 'image/png', filename = 'sample.png', fields = room) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.set(key, value);
      form.set('photo', new Blob([bytes], { type: contentType }), filename);
      return fetch('http://127.0.0.1:' + server.address().port + reports, {
        method: 'POST', headers: { origin: 'http://localhost:5173', cookie: cookies[1] }, body: form,
      });
    };
    assert.equal((await attach('not a photo')).status, 422);
    assert.equal((await attach(Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
    storageUnavailable = true;
    assert.equal((await attach(png)).status, 503);
    storageUnavailable = false;
    const created = await attach(png);
    assert.equal(created.status, 201);
    const { id } = await created.json();
    const item = (await list(1)).find(report => report.id === id);
    assert.equal(item.category, 'plumbing');
    assert.equal(item.floor, '2');
    assert.equal(item.priority, null);
    assert.equal(item.hasPhoto, true);
    assert.equal(item.machineId, null);
    const photo = reports + '/' + id + '/photo';
    assert.equal((await request(photo, 'GET', 2)).status, 401);
    assert.equal((await request(photo, 'GET', 3)).status, 404);
    assert.equal((await request(photo, 'GET', 0)).status, 200);
    assert.equal((await action(id, 'take', 1, { priority: 'urgent' })).status, 403);
    assert.equal((await action(id, 'take', 0)).status, 400);
    assert.equal((await action(id, 'take', 0, { priority: 'urgent' })).status, 204);
    assert.equal((await action(id, 'take', 0, { priority: 'low' })).status, 204);
    assert.equal((await list(0, true)).find(report => report.id === id).priority, 'urgent');
    assert.equal((await action(id, 'resolve', 0)).status, 204);
    assert.equal((await action(id, 'verify', 1)).status, 204);
    assert.equal((await list(1)).find(report => report.id === id).status, 'verified');
    const image = await request(photo, 'GET', 1);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.equal(image.headers.get('cache-control'), 'no-store');
    const stored = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.equal(stored.format, 'jpeg');
    assert.equal(stored.width, 1600);
    assert.equal(stored.height, 800);
    assert.equal(stored.exif, undefined);
    assert.equal(objects.size, 1);
    assert.equal((await notices(0)).filter(notice => notice.reportId === id && notice.kind === 'report-new').length, 1);
    assert.equal((await notices(1)).filter(notice => notice.reportId === id && notice.kind === 'report-resolved').length, 1);
    assert.equal((await db.query('SELECT count(*) FROM laundry_reservations')).rows[0].count, initial.count);
    await db.query('UPDATE users SET can_manage_equipment = false WHERE id = $1', [users[0].id]);
    assert.equal((await request(photo, 'GET', 0)).status, 404);
  });

  await t.test('reservations remind, confirm, expire once and suspend until corrected', async t => {
    const { advanceWaitingQueues } = await import('../src/modules/laundry/live-queue.js');
    let clock = at(240);
    let clockAfterAccountLock;
    let afterHoldCleanup;
    const timed = (sql, args = []) => {
      if (!/clock_timestamp\(\) AS now|statement_timestamp\(\)/.test(sql)) return [sql, args];
      const value = '$' + (args.length + 1) + '::timestamptz';
      return [sql.replaceAll('clock_timestamp() AS now', value + ' AS now')
        .replaceAll('statement_timestamp()', value), [...args, clock]];
    };
    const database = {
      ...db,
      query: (sql, args) => db.query(...timed(sql, args)),
      async connect() {
        const client = await db.connect();
        return {
          async query(sql, args) {
            const result = await client.query(...timed(sql, args));
            if (afterHoldCleanup && sql.includes('WITH suspended AS')) {
              const suspend = afterHoldCleanup;
              afterHoldCleanup = undefined;
              await suspend();
            }
            if (clockAfterAccountLock && /SELECT id FROM users WHERE id = \$1 FOR (?:NO KEY )?UPDATE/.test(sql)) {
              clock = clockAfterAccountLock;
              clockAfterAccountLock = undefined;
            }
            return result;
          },
          release: discard => client.release(discard),
        };
      },
    };
    const attendanceServer = createApp(database).listen(0, '127.0.0.1');
    await once(attendanceServer, 'listening');
    t.after(() => { attendanceServer.closeAllConnections(); attendanceServer.close(); });
    await db.query('UPDATE users SET can_manage_equipment = true WHERE id = $1', [users[0].id]);
    const { rows: [resident] } = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ('attendance@example.test', 'fixture') RETURNING id, email");
    const token = newToken();
    await db.query('INSERT INTO sessions (user_id, token_hash) VALUES ($1, $2)', [resident.id, tokenHash(token)]);
    const { rows: [noticeAdmin] } = await db.query(`
      INSERT INTO users (email, password_hash, can_view_service_status)
      VALUES ('strike-admin@example.test', 'fixture', true) RETURNING id`);
    const adminToken = newToken();
    await db.query('INSERT INTO sessions (user_id, token_hash) VALUES ($1, $2)', [noticeAdmin.id, tokenHash(adminToken)]);
    await db.query(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ($1, 'https://fcm.googleapis.com/fcm/send/strike-admin', 'fixture', 'fixture'),
             ($2, 'https://fcm.googleapis.com/fcm/send/strike-operator', 'fixture', 'fixture')`,
    [noticeAdmin.id, users[0].id]);
    const attendanceCookies = [cookies[0], 'camin_session=' + token, 'camin_session=' + adminToken];
    const { rows: [equipment] } = await db.query(`
      INSERT INTO laundry_machines (name, location, room, type, label, technical_status)
      VALUES ('Attendance washer', 'Test location', '1', 'washer', 'ATTENDANCE', 'working') RETURNING id`);
    const endpoint = '/api/laundry-machines/' + equipment.id;
    const send = (url, method = 'GET', resident = 1, body) => fetch(
      'http://127.0.0.1:' + attendanceServer.address().port + url, {
        method, headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', cookie: attendanceCookies[resident] },
        body: JSON.stringify(body),
      });
    async function create(start, minutes = 20, machineId = equipment.id) {
      const { rows: [row] } = await db.query(`
        INSERT INTO laundry_reservations (machine_id, user_id, starts_at, use_ends_at, ends_at, attendance_tracked)
        VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
      [machineId, resident.id, at(start), at(start + minutes), at(start + minutes + 10)]);
      return row.id;
    }
    const noticesFor = async id => (await (await send('/api/notifications')).json()).items
      .filter(item => item.reservation?.id === id).reverse();
    const confirm = (id, resident = 1) => send(endpoint + '/reservations/' + id + '/confirm', 'POST', resident);
    const calendar = resident => send(endpoint + '/calendar?day=' + fixture.day, 'GET', resident).then(response => response.json());
    const inbox = account => send('/api/notifications', 'GET', account).then(response => response.json());
    const tick = () => advanceWaitingQueues(database);

    const subscription = 'https://fcm.googleapis.com/fcm/send/attendance-test';
    await db.query(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'fixture', 'fixture')`,
    [resident.id, subscription]);
    const pushes = [];
    const dispatch = async () => {
      const { rows: [{ count }] } = await db.query(`
        SELECT count(*)::integer FROM push_deliveries WHERE next_attempt_at <= $1`, [clock]);
      for (let batch = 0; batch < Math.ceil(count / 8); batch++) {
        await dispatchPushDeliveries(database, async (target, payload, options) => {
          if (target.endpoint === subscription) pushes.push({ ...JSON.parse(payload), ttl: options.TTL });
        });
      }
    };

    const attended = await create(250);
    await Promise.all([tick(), tick()]);
    assert.deepEqual((await noticesFor(attended)).map(item => item.kind), ['reservation-reminder']);
    await dispatch();
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].ttl, 600);
    assert.equal(pushes[0].path, '/spalatorie/1?echipament=' + equipment.id + '&zi=' + fixture.day + '#rezervare-' + attended);
    assert.equal((await confirm(attended)).status, 409);
    assert.equal((await confirm(attended, 0)).status, 404);
    clock = at(250);
    await Promise.all([tick(), tick()]);
    const alerts = await noticesFor(attended);
    assert.deepEqual(alerts.map(item => item.kind), ['reservation-reminder', 'reservation-start']);
    assert.equal(alerts[1].message, 'Rezervarea ta a început. Confirmă începerea în 10 minute.');
    await dispatch();
    assert.equal(pushes.length, 2);
    assert.equal(pushes[1].message, alerts[1].message);
    assert.equal(pushes[1].ttl, 600);
    assert.equal((await calendar(1)).reservations.find(item => item.id === attended).confirmBy, at(260));
    assert.equal((await calendar(0)).reservations.find(item => item.startsAt === at(250)).confirmBy, undefined);
    clock = new Date(Date.parse(at(260)) - 1).toISOString();
    assert.equal((await confirm(attended)).status, 204);

    const missed = [await create(300), await create(340), await create(380, 10)];
    assert.deepEqual((await inbox(1)).strikeProgress, { active: 0, remaining: 3, suspendedUntil: null });
    const short = await create(285, 5);
    const { rows: [otherMachine] } = await db.query(`
      INSERT INTO laundry_machines (name, location, room, type, label, technical_status)
      VALUES ('Suspension washer', 'Test location', '1', 'washer', 'SUSPENSION', 'working') RETURNING id`);
    const otherEndpoint = '/api/laundry-machines/' + otherMachine.id;
    const ongoing = await create(385, 20, otherMachine.id);
    const future = await create(400);
    const suspensionEnd = 390 + 48 * 60;
    const justBeforeExpiry = await create(suspensionEnd - 5);
    const atExpiry = await create(suspensionEnd, 20, otherMachine.id);
    const beyondSuspension = await create(390 + 3 * 1440, 20, otherMachine.id);
    for (const [index, offset] of [310, 350, 390].entries()) {
      if (index === 2) {
        clock = at(385);
        assert.equal((await send(otherEndpoint + '/reservations/' + ongoing + '/confirm', 'POST')).status, 204);
      }
      clock = at(offset);
      const [, , confirmation] = await Promise.all([tick(), tick(), confirm(missed[index])]);
      assert.equal(confirmation.status, 409);
      // A tick may skip the equipment while the confirmation request holds its lock.
      await tick();
      const expected = ['Mai ai 2 strike-uri până la suspendare.', 'Mai ai 1 strike până la suspendare.', 'Suspendarea a început.'];
      assert.equal((await noticesFor(missed[index])).find(item => item.kind === 'strike-received').strikeProgressMessage,
        expected[index]);
      if (index < 2) {
        assert.deepEqual((await inbox(1)).strikeProgress, { active: index + 1, remaining: 2 - index, suspendedUntil: null });
      }
    }
    const residentView = await calendar(1);
    assert.equal(residentView.suspension.until, new Date(Date.parse(at(390)) + 48 * 3_600_000).toISOString());
    assert.deepEqual((await inbox(1)).strikeProgress, { active: 0, remaining: 0, suspendedUntil: residentView.suspension.until });
    assert.equal(residentView.cancellations.filter(item => item.reason === 'Neprezentare').length, 3);
    assert.ok(residentView.cancellations.some(item => item.id === future && item.reason === 'Suspendare pentru neprezentare'));
    assert.equal((await calendar(0)).cancellations.length, 0);
    assert.ok(!(await calendar(0)).reservations.some(item => item.startsAt === at(400)));
    const { rows: affectedReservations } = await db.query(`
      SELECT id, cancelled_at, cancellation_reason FROM laundry_reservations
      WHERE id = ANY($1::bigint[]) ORDER BY id`, [[future, justBeforeExpiry, atExpiry, beyondSuspension]]);
    assert.deepEqual(affectedReservations.map(row => [row.id, row.cancelled_at?.toISOString() ?? null, row.cancellation_reason]), [
      [future, at(390), 'Suspendare pentru neprezentare'],
      [justBeforeExpiry, at(390), 'Suspendare pentru neprezentare'],
      [atExpiry, null, null],
      [beyondSuspension, null, null],
    ]);
    assert.ok(!(await noticesFor(future)).some(item => Date.parse(item.createdAt) >= Date.parse(at(390))));
    assert.equal((await send(otherEndpoint + '/reservations/' + ongoing + '/finish', 'POST')).status, 204);
    assert.equal((await send(endpoint + '/reservations', 'POST', 1, { startsAt: at(450), endsAt: at(480) })).status, 403);

    clock = at(430);
    await tick();
    const { rows: strikes } = await db.query(`
      SELECT reservation_id FROM laundry_strikes WHERE user_id = $1 ORDER BY reservation_id`, [resident.id]);
    assert.deepEqual(strikes.map(row => row.reservation_id), missed);
    assert.equal((await db.query('SELECT cancelled_at FROM laundry_reservations WHERE id = $1', [short])).rows[0].cancelled_at, null);

    const notice = async (kind, machineId = equipment.id) => (await db.query(`
      INSERT INTO laundry_notifications (user_id, machine_id, kind, message, created_at)
      VALUES ($1, $2, $3, 'Test offer', $4) RETURNING id`, [resident.id, machineId, kind, clock])).rows[0].id;
    const { rows: [entry] } = await db.query(`
      INSERT INTO laundry_queue_entries (machine_id, user_id, day, duration_minutes)
      VALUES ($1, $2, $3, 20) RETURNING id`, [equipment.id, resident.id, fixture.day]);
    const { rows: [queueOffer] } = await db.query(`
      INSERT INTO laundry_queue_offers (entry_id, machine_id, notification_id, starts_at, ends_at, expires_at, immediate)
      VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING id`,
    [entry.id, equipment.id, await notice('queue-turn'), at(450), at(480), at(435)]);
    const { rows: [restorationOffer] } = await db.query(`
      INSERT INTO laundry_restoration_offers
        (notification_id, original_reservation_id, machine_id, starts_at, use_ends_at, ends_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [await notice('restored'), missed[0], equipment.id, at(480), at(500), at(510), at(435)]);
    const queueAnswer = await send(endpoint + '/queue/offers/' + queueOffer.id, 'POST', 1, { action: 'accept' });
    assert.equal(queueAnswer.status, 403);
    assert.equal((await queueAnswer.json()).suspension.until, residentView.suspension.until);
    const restorationAnswer = await send('/api/notifications/offers/' + restorationOffer.id, 'POST', 1, { action: 'accept' });
    assert.equal(restorationAnswer.status, 403);
    assert.equal((await restorationAnswer.json()).suspension.until, residentView.suspension.until);
    assert.deepEqual((await calendar(0)).holds, []);
    await tick();
    const { rows: holds } = await db.query(`
      SELECT status FROM laundry_queue_offers WHERE id = $1
      UNION ALL
      SELECT status FROM laundry_restoration_offers WHERE id = $2`, [queueOffer.id, restorationOffer.id]);
    assert.deepEqual(holds.map(row => row.status), ['withdrawn', 'withdrawn']);

    const rules = '/api/admin/reservation-attendance-policy';
    assert.equal((await send(rules, 'PUT', 0, { strikeWindowDays: 2147483647, suspensionHours: 48 })).status, 400);
    assert.deepEqual(await (await send(rules, 'GET', 0)).json(), { strikeWindowDays: 7, suspensionHours: 48 });

    const strikeAlerts = async account => (await (await send('/api/notifications', 'GET', account)).json()).items
      .filter(item => item.kind === 'strike-issued' && missed.includes(item.reservation?.id));
    for (const account of [0, 2]) {
      const alerts = await strikeAlerts(account);
      assert.deepEqual(alerts.map(item => item.reservation.id).sort(), [...missed].sort());
      assert.ok(alerts.every(item => item.message === 'S-a acordat un strike.'));
      assert.ok(alerts.every(item => item.residentEmail === resident.email));
    }
    assert.deepEqual(await strikeAlerts(1), []);
    const residentStrikes = async account => (await (await send('/api/notifications', 'GET', account)).json()).items
      .filter(item => item.kind === 'strike-received');
    const personalAlerts = await residentStrikes(1);
    assert.deepEqual(personalAlerts.map(item => item.reservation.id), [...missed].reverse());
    for (const item of personalAlerts) {
      const index = missed.indexOf(item.reservation.id);
      assert.equal(item.reservation.startsAt, at([300, 340, 380][index]));
      assert.equal(item.machineId, equipment.id);
      assert.equal(item.room, '1');
      assert.equal(item.message, 'Neprezentare la rezervare.');
      assert.equal(item.readAt, null);
      assert.equal(Object.hasOwn(item, 'residentEmail'), false);
    }
    for (const account of [0, 2]) {
      assert.ok(!(await residentStrikes(account)).some(item => missed.includes(item.reservation.id)));
    }
    const { rows: [deliveryCount] } = await db.query(`
      SELECT count(*)::integer AS count FROM push_deliveries delivery
      JOIN laundry_notifications notice ON notice.id = delivery.notification_id
      WHERE notice.kind = 'strike-issued'`);
    assert.equal(deliveryCount.count, 0);
    const { rowCount: residentDeliveries } = await db.query(`
      SELECT 1 FROM push_deliveries delivery
      JOIN laundry_notifications notice ON notice.id = delivery.notification_id
      WHERE notice.kind = 'strike-received'`);
    assert.equal(residentDeliveries, 0);

    // Put the target beyond the first page of the unfiltered history.
    await db.query(`
      INSERT INTO laundry_reservations (machine_id, user_id, starts_at, use_ends_at, ends_at)
      SELECT $1, $2, $3::timestamptz + n * interval '1 day',
        $3::timestamptz + n * interval '1 day' + interval '20 minutes',
        $3::timestamptz + n * interval '1 day' + interval '30 minutes'
      FROM generate_series(1, 26) AS offsets(n)`, [equipment.id, resident.id, at(450)]);
    const history = '/api/admin/reservations';
    const firstPage = await (await send(history, 'GET', 0)).json();
    assert.ok(!firstPage.items.some(item => item.id === missed[0]));
    const target = history + '?reservationId=' + missed[0];
    assert.equal((await send(target)).status, 403);
    assert.equal((await send(history + '?reservationId=invalid', 'GET', 0)).status, 400);
    for (const account of [0, 2]) {
      const result = await (await send(target, 'GET', account)).json();
      assert.deepEqual(result.items.map(item => item.id), [missed[0]]);
      assert.ok(result.items[0].strike_at);
      assert.equal(result.items[0].strike_resident_email, resident.email);
      assert.equal(result.hasNext, false);
    }

    const correction = '/api/admin/reservations/' + missed[0] + '/strike-correction';
    assert.equal((await send(correction, 'POST', 1, { reason: 'Test' })).status, 403);
    assert.equal((await send(correction, 'POST', 0, { reason: '' })).status, 400);
    assert.equal((await send(correction, 'POST', 0, { reason: 'Corecție de test' })).status, 204);
    assert.equal((await calendar(1)).suspension, null);
    assert.ok((await calendar(1)).cancellations.some(item => item.id === future));
    assert.equal((await send(correction, 'POST', 2, { reason: 'Repetare corecție' })).status, 204);
    const correctionAlerts = (await noticesFor(missed[0])).filter(item => item.kind === 'strike-corrected');
    assert.deepEqual(correctionAlerts.map(item => item.strikeProgressMessage), ['Mai ai 3 strike-uri până la suspendare.']);
    assert.ok(!(await inbox(0)).items.some(item => item.kind === 'strike-corrected' && item.reservation?.id === missed[0]));
    assert.deepEqual((await inbox(1)).strikeProgress, { active: 0, remaining: 3, suspendedUntil: null });
    assert.equal((await noticesFor(missed[0])).find(item => item.kind === 'strike-received').strikeProgressMessage,
      'Mai ai 2 strike-uri până la suspendare.');
    assert.equal((await db.query(`
      SELECT 1 FROM push_deliveries delivery JOIN laundry_notifications notice ON notice.id = delivery.notification_id
      WHERE notice.kind = 'strike-corrected'`)).rowCount, 0);

    const { rows: [newQueueOffer] } = await db.query(`
      INSERT INTO laundry_queue_offers (entry_id, machine_id, notification_id, starts_at, ends_at, expires_at, immediate)
      VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING id`,
    [entry.id, equipment.id, await notice('queue-turn'), at(450), at(480), at(435)]);
    const { rows: [newRestorationOffer] } = await db.query(`
      INSERT INTO laundry_restoration_offers
        (notification_id, original_reservation_id, machine_id, starts_at, use_ends_at, ends_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [await notice('restored'), missed[0], equipment.id, at(480), at(500), at(510), at(435)]);
    for (const offerPath of [
      endpoint + '/queue/offers/' + newQueueOffer.id, '/api/notifications/offers/' + newRestorationOffer.id,
    ]) {
      clock = at(434);
      clockAfterAccountLock = at(435);
      assert.equal((await send(offerPath, 'POST', 1, { action: 'accept' })).status, 409);
      assert.equal(clockAfterAccountLock, undefined);
    }

    const afterCorrection = await send(endpoint + '/reservations', 'POST', 1, { startsAt: at(510), endsAt: at(540) });
    assert.equal(afterCorrection.status, 201);
    const afterCorrectionId = (await afterCorrection.json()).id;

    const changeCondition = action => send(endpoint + '/condition', 'POST', 0, { action });
    const inspectionOutcome = async id => (await db.query(`
      SELECT reservation.attendance_excused_at, reservation.cancelled_at, strike.issued_at AS strike_at
      FROM laundry_reservations reservation
      LEFT JOIN laundry_strikes strike ON strike.reservation_id = reservation.id
      WHERE reservation.id = $1`, [id])).rows[0];

    const firstCycle = await create(450, 10);
    const blocked = await create(470);
    clock = at(450);
    assert.equal((await confirm(firstCycle)).status, 204);
    assert.equal((await changeCondition('inspect')).status, 204);
    clock = at(475);
    assert.equal((await confirm(blocked)).status, 409);
    await tick();
    clock = new Date(Date.parse(at(480)) + 1).toISOString();
    assert.equal((await changeCondition('restore')).status, 204);
    await Promise.all([tick(), tick()]);
    const excused = await inspectionOutcome(blocked);
    assert.equal(excused.strike_at, null, 'inspection prevented confirmation until the deadline');
    assert.equal(excused.cancelled_at, null);
    assert.ok(excused.attendance_excused_at);
    const operatorInbox = await (await send('/api/notifications', 'GET', 0)).json();
    assert.ok(!operatorInbox.items.some(item => item.kind === 'strike-issued' && item.reservation?.id === blocked));
    assert.ok(!(await residentStrikes(1)).some(item => item.reservation.id === blocked));

    const secondCycle = await create(540, 10);
    const restoredInTime = await create(560);
    clock = at(510);
    assert.equal((await confirm(afterCorrectionId)).status, 204);
    clock = at(540);
    assert.equal((await confirm(secondCycle)).status, 204);
    assert.equal((await changeCondition('inspect')).status, 204);
    clock = at(565);
    assert.equal((await confirm(restoredInTime)).status, 409);
    assert.equal((await changeCondition('restore')).status, 204);
    assert.equal((await confirm(restoredInTime)).status, 204);
    clock = at(570);
    await tick();
    assert.deepEqual(await inspectionOutcome(restoredInTime), {
      attendance_excused_at: null, cancelled_at: null, strike_at: null,
    });

    const newerMiss = await create(590);
    clock = at(600);
    await tick();
    assert.deepEqual((await inbox(1)).strikeProgress, { active: 1, remaining: 2, suspendedUntil: null });
    clock = at(600 + 7 * 1440);
    assert.deepEqual((await inbox(1)).strikeProgress, { active: 0, remaining: 3, suspendedUntil: null });
    clock = at(600);
    assert.equal((await send('/api/admin/reservations/' + newerMiss + '/strike-correction', 'POST', 0, { reason: 'Corecție individuală' })).status, 204);
    assert.deepEqual((await inbox(1)).strikeProgress, { active: 0, remaining: 3, suspendedUntil: null });

    for (const kind of ['queue-turn', 'restored']) {
      await t.test(kind + ' stays blocked if another resident booked during suspension', async () => {
        clock = at(434);
        const { rows: [raceMachine] } = await db.query(`
          INSERT INTO laundry_machines (name, location, room, type, label, technical_status)
          VALUES ('Offer conflict washer', 'Test location', '1', 'washer', $1, 'working') RETURNING id`, [kind]);
        const raceEndpoint = '/api/laundry-machines/' + raceMachine.id;
        const offerNotice = await notice(kind, raceMachine.id);
        let offerPath;
        if (kind === 'queue-turn') {
          const { rows: [raceEntry] } = await db.query(`
            INSERT INTO laundry_queue_entries (machine_id, user_id, day, duration_minutes)
            VALUES ($1, $2, $3, 20) RETURNING id`, [raceMachine.id, resident.id, fixture.day]);
          const { rows: [offer] } = await db.query(`
            INSERT INTO laundry_queue_offers (entry_id, machine_id, notification_id, starts_at, ends_at, expires_at, immediate)
            VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING id`,
          [raceEntry.id, raceMachine.id, offerNotice, at(450), at(480), at(435)]);
          offerPath = raceEndpoint + '/queue/offers/' + offer.id;
        } else {
          const original = await create(450, 20, raceMachine.id);
          await db.query(`UPDATE laundry_reservations SET cancelled_at = $2, cancellation_reason = 'Echipament defect'
            WHERE id = $1`, [original, at(430)]);
          const { rows: [offer] } = await db.query(`
            INSERT INTO laundry_restoration_offers
              (notification_id, original_reservation_id, machine_id, starts_at, use_ends_at, ends_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [offerNotice, original, raceMachine.id, at(450), at(470), at(480), at(435)]);
          offerPath = '/api/notifications/offers/' + offer.id;
        }
        let suspensionId;
        afterHoldCleanup = async () => {
          const { rows: [suspension] } = await db.query(`
            INSERT INTO laundry_suspensions (user_id, starts_at, ends_at) VALUES ($1, $2, $3) RETURNING id`,
          [resident.id, clock, at(1000)]);
          suspensionId = suspension.id;
        };
        const winner = await send(raceEndpoint + '/reservations', 'POST', 2, { startsAt: at(450), endsAt: at(480) });
        assert.equal(winner.status, 201);
        assert.ok(suspensionId);
        await db.query('UPDATE laundry_suspensions SET lifted_at = $2 WHERE id = $1', [suspensionId, clock]);
        const answer = await send(offerPath, 'POST', 1, { action: 'accept' });
        assert.equal(answer.status, 409);
        const { rows: holds } = await db.query(`
          SELECT status FROM laundry_queue_offers WHERE notification_id = $1
          UNION ALL
          SELECT status FROM laundry_restoration_offers WHERE notification_id = $1`, [offerNotice]);
        assert.deepEqual(holds.map(row => row.status), ['withdrawn']);
        const { rows: survivors } = await db.query(`
          SELECT id FROM laundry_reservations WHERE machine_id = $1 AND cancelled_at IS NULL`, [raceMachine.id]);
        assert.deepEqual(survivors.map(row => row.id), [(await winner.json()).id]);
      });
    }

    await db.query('UPDATE users SET can_manage_equipment = false WHERE id = $1', [users[0].id]);
    const formerOperatorAlerts = await strikeAlerts(0);
    assert.equal(formerOperatorAlerts.length, missed.length);
    assert.ok(formerOperatorAlerts.every(item => !Object.hasOwn(item, 'residentEmail')));
    assert.equal((await send(target, 'GET', 0)).status, 403);

    await t.test('the end-of-use reminder uses the handover boundary and sends once', async () => {
      const { rows: [reminderMachine] } = await db.query(`
        INSERT INTO laundry_machines (name, location, room, type, label, technical_status)
        VALUES ('Reminder washer', 'Test location', '1', 'washer', 'REMINDER', 'working') RETURNING id`);
      const reservationPath = '/api/laundry-machines/' + reminderMachine.id + '/reservations';
      const endNotices = async id => (await noticesFor(id)).filter(item => item.kind === 'reservation-end-reminder');
      const endPushes = id => pushes.filter(item => item.path?.endsWith('#rezervare-' + id));
      const add = (start, minutes) => create(start, minutes, reminderMachine.id);
      const start = id => send(reservationPath + '/' + id + '/confirm', 'POST');
      const regular = await add(490, 30);
      clock = at(490);
      assert.equal((await start(regular)).status, 204);
      clock = new Date(Date.parse(at(505)) - 1).toISOString();
      await tick();
      assert.deepEqual(await endNotices(regular), []);
      clock = at(505);
      await Promise.all([tick(), tick()]);
      await tick();
      const reminder = await endNotices(regular);
      assert.deepEqual(reminder.map(item => item.createdAt), [at(505)]);
      assert.equal(reminder[0].message,
        'Mai ai cel mult 15 minute până la finalul utilizării. Pregătește-te să eliberezi echipamentul.');
      assert.ok(!(await inbox(0)).items.some(item => item.id === reminder[0].id));
      await dispatch();
      await dispatch();
      assert.deepEqual(endPushes(regular).map(item => [item.id, item.ttl, item.message]),
        [[reminder[0].id, 900, reminder[0].message]]);

      const cancelled = await add(560, 20);
      assert.equal((await send(reservationPath + '/' + cancelled, 'DELETE')).status, 204);
      const early = await add(530, 30);
      clock = at(530);
      assert.equal((await start(early)).status, 204);
      clock = at(540);
      assert.equal((await send(reservationPath + '/' + early + '/finish', 'POST')).status, 204);
      clock = at(545);
      await tick();
      assert.deepEqual(await endNotices(early), []);
      const late = await add(550, 20);
      await db.query('UPDATE laundry_reservations SET created_at = $2 WHERE id = $1', [late, at(556)]);
      clock = at(556);
      assert.equal((await start(late)).status, 204);
      await tick();
      const short = await create(570, 5, otherMachine.id);
      clock = at(570);
      await tick();
      for (const id of [cancelled, late, short]) assert.deepEqual(await endNotices(id), []);

      const closingResponse = await send(reservationPath, 'POST', 1, { startsAt: at(580), endsAt: at(600) });
      assert.equal(closingResponse.status, 201);
      const { id: closing, useEndsAt } = await closingResponse.json();
      assert.equal(useEndsAt, at(600));
      clock = at(580);
      assert.equal((await start(closing)).status, 204);
      clock = new Date(Date.parse(at(585)) - 1).toISOString();
      await tick();
      assert.deepEqual(await endNotices(closing), []);
      clock = at(585);
      await tick();
      assert.deepEqual((await endNotices(closing)).map(item => item.createdAt), [at(585)]);
      clock = at(600);
      await dispatch();
      assert.deepEqual(endPushes(closing), []);
    });

    await t.test('the end-of-use reminder falls back to email only without a push subscription', async () => {
      const { dispatchEndReminderEmails } = await import('../src/modules/notifications/end-reminder-email.js');
      const emails = [];
      const dispatchEmail = (sender = async (to, message) => emails.push({ to, message })) =>
        dispatchEndReminderEmails(database, sender);

      const { rows: [emailMachine] } = await db.query(`
        INSERT INTO laundry_machines (name, location, room, type, label, technical_status)
        VALUES ('Email washer', 'Test location', '1', 'washer', 'EMAIL', 'working') RETURNING id`);
      const reservationPath = '/api/laundry-machines/' + emailMachine.id + '/reservations/';
      const dueReminder = async (offset, minutes = 30) => {
        const id = await create(offset, minutes, emailMachine.id);
        clock = at(offset);
        assert.equal((await send(reservationPath + id + '/confirm', 'POST')).status, 204);
        clock = at(offset + minutes - 15);
        await Promise.all([tick(), tick()]);
        await tick();
        return id;
      };

      await dueReminder(50);
      await dispatchEmail();
      assert.deepEqual(emails, [], 'a registered push device rules out email');
      await db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [resident.id]);
      await tick();
      await dispatchEmail();
      assert.deepEqual(emails, [], 'removing a subscription does not change the selected channel');

      const regular = await dueReminder(100);
      const notices = (await noticesFor(regular)).filter(item => item.kind === 'reservation-end-reminder');
      assert.equal(notices.length, 1);
      assert.equal((await db.query('SELECT count(*) FROM push_deliveries WHERE notification_id = $1',
        [notices[0].id])).rows[0].count, '0');
      await Promise.all([dispatchEmail(), dispatchEmail()]);
      await tick();
      await dispatchEmail();
      assert.deepEqual(emails, [{ to: resident.email, message: notices[0].message }]);

      const cancelled = await dueReminder(150);
      await db.query('UPDATE laundry_reservations SET cancelled_at = $2 WHERE id = $1', [cancelled, clock]);
      await dispatchEmail();
      const finished = await dueReminder(200);
      assert.equal((await send(reservationPath + finished + '/finish', 'POST')).status, 204);
      await dispatchEmail();
      await dueReminder(250);
      clock = at(280);
      await dispatchEmail();
      assert.equal(emails.length, 1);

      await dueReminder(300);
      let attempts = 0;
      await dispatchEmail(async () => {
        attempts++;
        throw Object.assign(new Error('temporary SMTP rejection'), { responseCode: 451 });
      });
      await dispatchEmail();
      assert.equal(attempts, 1);
      assert.equal(emails.length, 1);
      clock = at(316);
      await dispatchEmail();
      await dispatchEmail();
      assert.equal(emails.length, 2);

      await dueReminder(350);
      await dispatchEmail(async () => {
        attempts++;
        throw new Error('SMTP result unknown');
      });
      clock = at(366);
      await dispatchEmail();
      assert.equal(attempts, 2);
      assert.equal(emails.length, 2);
    });
  });
});

test('Administrator announcements reach resident accounts and track explicit confirmation', async t => {
  assert.equal(process.env.PGDATABASE, 'app_camin_reservations_test');
  const db = createDatabase(loadDatabaseConfig());
  t.after(() => db.close());
  await runMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)), 'apply');
  const objects = new Map();
  let unavailable = false;
  const photos = {
    async put(key, bytes) {
      objects.set(key, bytes);
      if (unavailable && objects.size === 2) throw new Error('fixture storage unavailable');
    },
    async get(key) { return objects.get(key); },
    async remove(key) { objects.delete(key); },
  };
  const server = createApp(db, undefined, 'fixture-public-key', photos, { testAccounts: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { rows: users } = await db.query(`
    INSERT INTO users (email, password_hash, can_view_service_status, can_manage_equipment) VALUES
      ('announcement-author@example.test', 'fixture', false, true),
      ('admin@example.test', 'fixture', false, true),
      ('announcement-first@example.test', 'fixture', false, false),
      ('announcement-second@example.test', 'fixture', false, false)
    RETURNING id, email`);
  const [author, admin, first, second] = users;
  const cookies = new Map();
  for (const user of users) {
    const token = newToken();
    await db.query('INSERT INTO sessions (user_id, token_hash) VALUES ($1, $2)', [user.id, tokenHash(token)]);
    cookies.set(user, 'camin_session=' + token);
  }
  const inbox = '/api/notifications';
  const announcements = inbox + '/announcements';
  const request = (path, user, method = 'GET', body) => fetch(
    'http://127.0.0.1:' + server.address().port + path, {
      method, headers: { origin: 'http://localhost:5173',
        ...(user && { cookie: cookies.get(user) }),
        ...(body && !(body instanceof FormData) && { 'content-type': 'application/json' }) },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  const message = 'Apa va fi oprită joi.';
  const requestId = 'f5c977ae-cb2a-461b-8ca4-a458c55337e2';
  const publish = (user, body = { message, requestId }) => request(announcements, user, 'POST', body);
  assert.equal((await publish(null)).status, 401);
  assert.equal((await publish(admin)).status, 403);
  assert.equal((await publish(first)).status, 403);
  assert.equal((await publish(author, { message: '  ', requestId })).status, 400);

  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();
  const form = () => {
    const body = new FormData();
    body.set('message', message);
    body.set('requestId', requestId);
    body.append('photos', new Blob([image], { type: 'image/png' }), 'first.png');
    body.append('photos', new Blob([image], { type: 'image/png' }), 'second.png');
    return body;
  };
  unavailable = true;
  assert.equal((await publish(author, form())).status, 503);
  assert.equal(objects.size, 0);
  assert.deepEqual(await (await request(announcements, author)).json(), []);
  unavailable = false;
  await db.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES ($1, 'https://fcm.googleapis.com/fcm/send/announcement-fixture', 'fixture', 'fixture')`, [first.id]);

  const results = await Promise.all([publish(author, form()), publish(author, form())]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 201]);
  const [{ id }, retry] = await Promise.all(results.map(response => response.json()));
  assert.equal(retry.id, id);
  assert.equal(objects.size, 2);
  const findNotices = async user => (await (await request(inbox, user)).json()).items
    .filter(item => item.kind === 'announcement');
  const [firstNotice] = await findNotices(first);
  const secondNotices = await findNotices(second);
  assert.equal(secondNotices.length, 1);
  assert.equal(firstNotice.message, message);
  assert.equal(firstNotice.announcement.id, id);
  assert.equal(firstNotice.announcement.confirmedAt, null);
  assert.equal(firstNotice.announcement.photoIds.length, 2);
  assert.deepEqual(await findNotices(author), []);
  assert.deepEqual(await findNotices(admin), []);
  assert.equal((await request(announcements, first)).status, 403);
  assert.equal((await request(announcements + '/' + id, first)).status, 404);
  const photo = announcements + '/' + id + '/photos/' + firstNotice.announcement.photoIds[0];
  assert.equal((await request(photo, null)).status, 401);
  assert.equal((await request(photo, admin)).status, 404);
  const attachment = await request(photo, second);
  assert.equal(attachment.status, 200);
  assert.equal(attachment.headers.get('content-type'), 'image/jpeg');
  assert.equal((await request(photo, author)).status, 200);

  const pushed = [];
  await dispatchPushDeliveries(db, async (subscription, payload) => {
    if (subscription.endpoint.endsWith('/announcement-fixture')) pushed.push(JSON.parse(payload));
  });
  assert.deepEqual(pushed, [{ id: firstNotice.id, unreadCount: 1, title: 'Notificare de la Administrator' }]);

  const summary = async () => (await (await request(announcements + '/' + id, author)).json()).recipients;
  const receipt = inbox + '/' + firstNotice.id + '/confirm';
  assert.equal((await request(receipt, second, 'PUT')).status, 404);
  assert.equal((await request(inbox + '/' + firstNotice.id + '/read', first, 'PUT')).status, 200);
  assert.equal((await summary()).find(row => row.email === first.email).confirmedAt, null);
  const confirmation = await request(receipt, first, 'PUT');
  assert.equal(confirmation.status, 200);
  const { confirmedAt } = await confirmation.json();
  assert.ok(confirmedAt);
  assert.deepEqual(await (await request(receipt, first, 'PUT')).json(), { confirmedAt });
  assert.equal((await findNotices(first))[0].announcement.confirmedAt, confirmedAt);
  assert.equal((await summary()).find(row => row.email === first.email).confirmedAt, confirmedAt);
  assert.equal((await summary()).find(row => row.email === second.email).confirmedAt, null);

  const textOnly = await publish(author, { message, requestId: '3dffab18-dc2f-47d4-a982-cc633d06be56' });
  assert.equal(textOnly.status, 201);
  assert.equal((await findNotices(first))[0].announcement.photoIds.length, 0);
});
