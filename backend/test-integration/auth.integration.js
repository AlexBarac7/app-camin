import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadDatabaseConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { tokenHash } from '../src/modules/auth/credentials.js';
import { issueInvitation, revokeInvitation } from '../src/modules/auth/invitations.js';
import { dispatchPushDeliveries } from '../src/modules/notifications/push.js';

test('resident access on a fresh disposable PostgreSQL database', async t => {
  assert.equal(process.env.PGDATABASE, 'app_camin_auth_test');
  const db = createDatabase(loadDatabaseConfig());
  t.after(() => db.close());
  const migrations = fileURLToPath(new URL('../migrations/', import.meta.url));
  const baseline = await mkdtemp(join(tmpdir(), 'camin-catalog-'));
  t.after(() => rm(baseline, { recursive: true, force: true }));
  for (const file of ['001_resident_access.sql', '002_laundry_machines.sql']) {
    await cp(join(migrations, file), join(baseline, file));
  }
  assert.deepEqual(await runMigrations(db, baseline, 'apply'), [
    { filename: '001_resident_access.sql', state: 'newly applied' },
    { filename: '002_laundry_machines.sql', state: 'newly applied' },
  ]);
  // The current auth handlers also run during the historical catalog checks.
  await db.query('ALTER TABLE users ADD COLUMN welcome_pending boolean NOT NULL DEFAULT false');
  const outbound = [];
  const attempts = [];
  let rejectMail = false;
  const sendInvitation = async (email, link) => {
    attempts.push({ email, link });
    if (rejectMail) throw new Error('simulated SMTP rejection');
    outbound.push({ email, link });
  };
  const server = createApp(db, undefined, undefined, undefined, { sendInvitation }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const email = 'demo@example.test';
  const password = 'A demonstrative passphrase';
  const requestAt = origin => (path, body, cookie) => fetch(origin + '/api/auth/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  });
  const request = requestAt(base);
  const activate = token => request('activate', { token, password });

  const expired = await issueInvitation(db, email);
  await db.query("UPDATE invitations SET expires_at = now() - interval '1 hour'");
  assert.equal((await activate(expired)).status, 400);
  const replaced = await issueInvitation(db, email);
  const revoked = await issueInvitation(db, email);
  assert.equal((await activate(replaced)).status, 400);
  assert.equal(await revokeInvitation(db, email), true);
  assert.equal((await activate(revoked)).status, 400);
  const valid = await issueInvitation(db, ' DEMO@example.test ');
  const results = await Promise.all([activate(valid), activate(valid)]);
  assert.deepEqual(results.map(response => response.status).sort(), [201, 400]);
  assert.equal((await activate(valid)).status, 400);
  assert.equal((await db.query('SELECT email FROM users')).rows[0].email, email);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM users')).rows[0].total, 1);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM invitations WHERE used_at IS NOT NULL')).rows[0].total, 1);

  const wrong = await request('login', { email, password: 'incorrect' });
  const unknown = await request('login', { email: 'unknown@example.test', password });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());

  const login = await request('login', { email, password });
  assert.equal(login.status, 200);
  const header = login.headers.get('set-cookie');
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Lax/i);
  const cookie = header.split(';')[0];
  for (let visit = 0; visit < 2; visit++) {
    const response = await request('session', undefined, cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { email, role: 'resident' });
  }
  assert.equal((await request('logout', {}, cookie)).status, 204);
  assert.equal((await request('session', undefined, cookie)).status, 401);

  const secondLogin = await request('login', { email, password });
  const expiredCookie = secondLogin.headers.get('set-cookie').split(';')[0];
  await db.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
  assert.equal((await request('session', undefined, expiredCookie)).status, 401);

  const activeLogin = await request('login', { email, password });
  assert.equal(activeLogin.status, 200);
  const activeCookie = activeLogin.headers.get('set-cookie').split(';')[0];
  const catalog = cookie => fetch(base + '/api/laundry-machines', {
    headers: cookie ? { cookie } : {},
  });
  assert.equal((await catalog()).status, 401);
  assert.equal((await catalog(expiredCookie)).status, 401);
  const emptyCatalog = await catalog(activeCookie);
  assert.equal(emptyCatalog.status, 200);
  assert.deepEqual(await emptyCatalog.json(), []);
  await db.query(
    'INSERT INTO laundry_machines (id, name, location) OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3), ($4, $5, $6)',
    [2, 'Mașină test B', 'Etaj test B', 1, 'Mașină test A', 'Etaj test A'],
  );
  const populatedCatalog = await catalog(activeCookie);
  assert.equal(populatedCatalog.status, 200);
  assert.deepEqual(await populatedCatalog.json(), [
    { id: 1, name: 'Mașină test A', location: 'Etaj test A' },
    { id: 2, name: 'Mașină test B', location: 'Etaj test B' },
  ]);

  await db.query("INSERT INTO laundry_machines (id, name, location) OVERRIDING SYSTEM VALUE VALUES (3, 'Echipament anterior', 'Locație anterioară')");
  await cp(join(migrations, '003_laundry_inventory.sql'), join(baseline, '003_laundry_inventory.sql'));
  const migrated = await runMigrations(db, baseline, 'apply');
  assert.deepEqual(migrated.slice(2).map(row => row.state), ['newly applied']);

  const inventoryResponse = await catalog(activeCookie);
  assert.equal(inventoryResponse.status, 200);
  assert.equal(inventoryResponse.headers.get('cache-control'), 'no-store');
  const inventory = await inventoryResponse.json();
  assert.equal(inventory.length, 33);
  assert.equal(new Set(inventory.map(machine => machine.id)).size, 33);
  const legacy = inventory.find(machine => machine.name === 'Echipament anterior');
  assert.equal(legacy.location, 'Locație anterioară');
  assert.equal(legacy.room, undefined);

  const equipment = inventory.filter(machine => machine.room !== undefined);
  const labels = (room, type) => equipment.filter(machine => machine.room === room && machine.type === type)
    .map(machine => machine.label);
  assert.deepEqual(labels('1', 'washer'), Array.from({ length: 11 }, (_, i) => String(i + 1)));
  assert.deepEqual(labels('2', 'washer'), Array.from({ length: 8 }, (_, i) => (i + 1) + 'A'));
  assert.deepEqual(labels('2', 'dryer'), ['1A', '2A']);
  assert.deepEqual(labels('uscatorie', 'dryer'), Array.from({ length: 9 }, (_, i) => String(i + 1)));
  assert.deepEqual(equipment.filter(machine => machine.technicalStatus === 'broken')
    .map(({ room, type, label }) => [room, type, label]), [['1', 'washer', '3'], ['1', 'washer', '10']]);
  assert.deepEqual(equipment.filter(machine => machine.technicalStatus === 'unspecified')
    .map(({ room, type, label }) => [room, type, label]), [['2', 'dryer', '1A'], ['2', 'dryer', '2A']]);
  assert.equal(equipment.filter(machine => machine.technicalStatus === 'working').length, 26);
  assert.equal((await catalog()).status, 401);
  assert.equal((await catalog(expiredCookie)).status, 401);
  assert.ok((await runMigrations(db, baseline, 'apply')).every(row => row.state === 'applied'));
  assert.equal((await db.query('SELECT count(*)::int AS total FROM laundry_machines')).rows[0].total, 33);

  const cleanup = () => execFileSync('npm', ['--silent', 'run', 'sessions:cleanup'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
  }).trim();
  assert.equal(cleanup(), 'Sesiuni șterse: 1');
  assert.equal(cleanup(), 'Sesiuni șterse: 0');
  const activeSession = await request('session', undefined, activeCookie);
  assert.equal(activeSession.status, 200);
  assert.deepEqual(await activeSession.json(), { email, role: 'resident' });

  await cp(join(migrations, '004_service_status_access.sql'), join(baseline, '004_service_status_access.sql'));
  assert.deepEqual((await runMigrations(db, baseline, 'apply')).slice(3), [
    { filename: '004_service_status_access.sql', state: 'newly applied' },
  ]);
  const otherEmail = 'other@example.test';
  assert.equal((await activate(await issueInvitation(db, otherEmail))).status, 201);
  const otherLogin = await request('login', { email: otherEmail, password });
  assert.equal(otherLogin.status, 200);
  const otherCookie = otherLogin.headers.get('set-cookie').split(';')[0];

  const permission = (mode, address) => spawnSync(process.execPath, ['src/service-status-access.js', mode], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    input: address + '\n',
    encoding: 'utf8',
  });
  const endpoints = ['/api/admin/access', '/api/health', '/api/ready'];
  const statuses = async cookie => Promise.all(endpoints.map(async path =>
    (await fetch(base + path, { headers: { cookie } })).status));
  assert.deepEqual(await statuses(activeCookie), [403, 403, 403]);
  assert.deepEqual(await statuses(otherCookie), [403, 403, 403]);

  const missing = permission('grant', 'missing@example.test');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Nu există un cont/);
  assert.equal(permission('grant', email).status, 0);
  assert.deepEqual(await statuses(activeCookie), [204, 200, 200]);
  const occupied = permission('grant', otherEmail);
  assert.equal(occupied.status, 1);
  assert.match(occupied.stderr, /Retrage permisiunea/);
  assert.deepEqual(await statuses(otherCookie), [403, 403, 403]);
  assert.equal(permission('revoke', email).status, 0);
  assert.deepEqual(await statuses(activeCookie), [403, 403, 403]);
  assert.equal(permission('grant', otherEmail).status, 0);
  assert.deepEqual(await statuses(otherCookie), [204, 200, 200]);

  await db.query('ALTER TABLE users DROP COLUMN welcome_pending');
  await runMigrations(db, migrations, 'apply');
  assert.deepEqual(await (await request('login', { email, password })).json(), { showWelcome: false });
  const admin = (path, body, actor) => fetch(base + '/api/admin/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', ...(actor && { cookie: actor }) },
    body: JSON.stringify(body),
  });
  const applicant = 'applicant@example.test';
  assert.equal((await admin('access-requests')).status, 401);
  assert.equal((await admin('access-requests', undefined, activeCookie)).status, 403);
  assert.deepEqual(await (await request('session', undefined, otherCookie)).json(), {
    email: otherEmail, role: 'admin',
  });
  await db.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    SELECT id, 'https://fcm.googleapis.com/fcm/send/access-' || id, 'fixture', 'fixture'
    FROM users WHERE email IN ($1, $2)`, [email, otherEmail]);
  const submissions = await Promise.all([
    request('request-access', { email: applicant }),
    request('request-access', { email: ' APPLICANT@example.test ' }),
    request('request-access', { email }),
  ]);
  assert.deepEqual(submissions.map(response => response.status), [202, 202, 202]);
  assert.deepEqual(submissions.slice(0, 2).map(response =>
    response.headers.get('x-camin-access-status')).sort(), ['pending', 'received']);
  assert.equal(submissions[2].headers.get('x-camin-access-status'), 'account_exists');
  assert.deepEqual(await Promise.all(submissions.map(response => response.text())), ['', '', '']);
  const requests = await (await admin('access-requests', undefined, otherCookie)).json();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].email, applicant);
  const notices = await (await fetch(base + '/api/notifications', { headers: { cookie: otherCookie } })).json();
  assert.equal(notices.items.filter(item => item.kind === 'access-request').length, 1);
  const pushed = [];
  await dispatchPushDeliveries(db, async (subscription, payload) => pushed.push({
    endpoint: subscription.endpoint, notice: JSON.parse(payload),
  }));
  assert.deepEqual(pushed, [{
    endpoint: (await db.query('SELECT endpoint FROM push_subscriptions JOIN users ON users.id = user_id WHERE email = $1',
      [otherEmail])).rows[0].endpoint,
    notice: { id: notices.items[0].id, unreadCount: 1, title: 'Cerere de acces nouă' },
  }]);
  const { dispatchAccessRequestEmails } = await import('../src/modules/notifications/access-request-email.js');
  const delivered = [];
  const sendAccessRequest = async address => delivered.push(address);
  await dispatchAccessRequestEmails(db, false, async address => {
    assert.equal(address, otherEmail);
    throw Object.assign(new Error('fixture SMTP deferral'), { responseCode: 450 });
  });
  await dispatchAccessRequestEmails(db, false, sendAccessRequest);
  assert.deepEqual(delivered, []);
  await db.query('UPDATE access_request_notice_emails SET next_attempt_at = now() WHERE next_attempt_at IS NOT NULL');
  await Promise.all([
    dispatchAccessRequestEmails(db, false, sendAccessRequest),
    dispatchAccessRequestEmails(db, false, sendAccessRequest),
  ]);
  assert.deepEqual(delivered, [otherEmail]);
  const approval = 'access-requests/' + requests[0].id + '/approve';
  assert.equal((await admin(approval, {}, activeCookie)).status, 403);
  const approvals = await Promise.all([admin(approval, {}, otherCookie), admin(approval, {}, otherCookie)]);
  assert.deepEqual(approvals.map(response => response.status).sort(), [201, 409]);
  assert.deepEqual(await approvals.find(response => response.status === 201).json(), { delivery: 'sent' });
  assert.equal(outbound.length, 1);
  const [{ email: recipient, link }] = outbound;
  assert.equal(recipient, applicant);
  const url = new URL(link);
  assert.equal(url.origin, 'http://localhost:5173');
  assert.equal(url.pathname, '/activeaza');
  assert.equal((await request('activate', { token: url.hash.slice(1), password: 'demo1234' })).status, 201);
  assert.equal((await activate(url.hash.slice(1))).status, 400);

  assert.equal((await admin('account-role', { email, role: 'administrator' }, activeCookie)).status, 403);
  assert.equal((await admin('account-role', { email, role: 'admin' }, otherCookie)).status, 400);
  assert.equal((await admin('account-role', { email, role: 'administrator' }, otherCookie)).status, 204);
  assert.deepEqual(await (await request('session', undefined, activeCookie)).json(), { email, role: 'administrator' });
  assert.equal((await admin('reservations', undefined, activeCookie)).status, 200);
  assert.equal((await admin('database/equipment', undefined, activeCookie)).status, 403);
  assert.deepEqual(await statuses(activeCookie), [403, 403, 403]);
  assert.equal((await admin('access-requests', undefined, activeCookie)).status, 403);
  assert.equal((await admin('account-role', { email, role: 'resident' }, otherCookie)).status, 204);
  assert.equal((await admin('reservations', undefined, activeCookie)).status, 403);

  const retryEmail = 'retry@example.test';
  assert.equal((await request('request-access', { email: retryEmail })).status, 202);
  const [retryRequest] = await (await admin('access-requests', undefined, otherCookie)).json();
  const retryPath = 'access-requests/' + retryRequest.id;
  rejectMail = true;
  assert.equal((await admin(retryPath + '/approve', {}, otherCookie)).status, 502);
  const firstLink = attempts.at(-1).link;
  const [failed] = await (await admin('access-requests', undefined, otherCookie)).json();
  assert.equal(failed.delivery, 'failed');
  rejectMail = false;
  const retries = await Promise.all([
    admin(retryPath + '/retry', {}, otherCookie), admin(retryPath + '/retry', {}, otherCookie),
  ]);
  assert.deepEqual(retries.map(response => response.status).sort(), [201, 409]);
  assert.equal(outbound.filter(item => item.email === retryEmail).length, 1);
  assert.notEqual(outbound.at(-1).link, firstLink);
  const attemptTokens = [firstLink, outbound.at(-1).link].map(link => new URL(link).hash.slice(1));
  const validInvitations = await db.query(`SELECT count(*)::int AS count FROM invitations
    WHERE email = $1 AND revoked_at IS NULL AND used_at IS NULL AND expires_at > clock_timestamp()`, [retryEmail]);
  assert.equal(validInvitations.rows[0].count, 1);
  assert.notEqual(attemptTokens[0], attemptTokens[1]);

  await t.test('a replacement invitation requires one new approval and replaces the previous link', async renewal => {
    const renewalServer = createApp(db, undefined, undefined, undefined, { sendInvitation }).listen(0, '127.0.0.1');
    await once(renewalServer, 'listening');
    renewal.after(() => renewalServer.close());
    const renewalRequest = requestAt('http://127.0.0.1:' + renewalServer.address().port);
    const address = 'replacement@example.test';
    const submit = async (replacement = false) => {
      const response = await renewalRequest('request-access', { email: address, replacement });
      assert.equal(response.status, 202);
      return response.headers.get('x-camin-access-status');
    };
    assert.equal(await submit(true), 'no_invitation');
    assert.equal(await submit(), 'received');
    const countDeliveries = async table => (await db.query(`
      SELECT count(*)::integer AS count FROM ${table} delivery
      JOIN laundry_notifications notice ON notice.id = delivery.notification_id
      WHERE notice.kind = 'access-request'`)).rows[0].count;
    const beforeReplacement = [
      await countDeliveries('push_deliveries'), await countDeliveries('access_request_notice_emails'),
    ];
    const [firstRequest] = await (await admin('access-requests', undefined, otherCookie)).json();
    const approvalPath = 'access-requests/' + firstRequest.id + '/approve';
    assert.equal((await admin(approvalPath, {}, otherCookie)).status, 201);
    const token = new URL(outbound.at(-1).link).hash.slice(1);
    assert.equal(await submit(), 'invite_sent');

    const digest = tokenHash(token);
    await db.query("UPDATE invitations SET expires_at = clock_timestamp() - interval '1 second' WHERE token_hash = $1", [digest]);
    assert.equal(await submit(), 'invite_expired');
    await db.query("UPDATE invitations SET expires_at = clock_timestamp() + interval '1 hour' WHERE token_hash = $1", [digest]);
    assert.deepEqual((await Promise.all([submit(true), submit(true)])).sort(), ['pending', 'replacement_received']);
    assert.deepEqual([
      await countDeliveries('push_deliveries'), await countDeliveries('access_request_notice_emails'),
    ], beforeReplacement.map(count => count + 1));
    const [reopened] = await (await admin('access-requests', undefined, otherCookie)).json();
    assert.equal(reopened.id, firstRequest.id);
    assert.equal(reopened.delivery, 'pending');
    const { rows: [previousInvitation] } = await db.query(
      'SELECT revoked_at FROM invitations WHERE token_hash = $1', [digest]);
    assert.equal(previousInvitation.revoked_at, null);
    assert.equal(outbound.filter(item => item.email === address).length, 1);
    assert.equal((await admin(approvalPath, {}, otherCookie)).status, 201);
    assert.equal(outbound.filter(item => item.email === address).length, 2);
    assert.equal((await renewalRequest('activate', { token, password })).status, 400);
    const newToken = new URL(outbound.at(-1).link).hash.slice(1);
    assert.equal((await renewalRequest('activate', { token: newToken, password })).status, 201);
  });

  await t.test('only Admin can reject, revoke the previous link and retry the rejection notice', async rejection => {
    const rejectedRecipients = [];
    let failDelivery = true;
    const rejectionServer = createApp(db, undefined, undefined, undefined, {
      sendInvitation,
      async sendAccessRejection(address) {
        if (failDelivery) throw new Error('simulated rejection notice failure');
        rejectedRecipients.push(address);
      },
    }).listen(0, '127.0.0.1');
    await once(rejectionServer, 'listening');
    rejection.after(() => rejectionServer.close());
    const rejectionBase = 'http://127.0.0.1:' + rejectionServer.address().port;
    const publicRequest = requestAt(rejectionBase);
    const decide = (id, action, actor, origin = 'http://localhost:5173') =>
      fetch(`${rejectionBase}/api/admin/access-requests/${id}/${action}`, {
        method: 'POST', headers: { origin, ...(actor ? { cookie: actor } : {}) },
      });
    const pending = async () => (await (await admin('access-requests', undefined, otherCookie)).json());
    const address = 'rejection-candidate@example.test';
    const token = await issueInvitation(db, address);
    const submitted = await publicRequest('request-access', { email: address, replacement: true });
    assert.equal(submitted.headers.get('x-camin-access-status'), 'replacement_received');
    const [{ id }] = await pending();
    assert.equal((await decide(id, 'reject')).status, 401);
    assert.equal((await decide(id, 'reject', activeCookie)).status, 403);
    assert.equal((await decide(id, 'reject', otherCookie, 'https://unrelated.example.test')).status, 403);
    assert.equal((await decide(id, 'reject', otherCookie)).status, 502);
    assert.equal(rejectedRecipients.length, 0);
    assert.deepEqual((await pending()).map(item => [item.id, item.rejected, item.delivery]), [[id, true, 'failed']]);
    assert.equal((await publicRequest('activate', { token, password })).status, 400);
    assert.equal((await decide(id, 'approve', otherCookie)).status, 409);
    for (const replacement of [false, true]) {
      const repeated = await publicRequest('request-access', { email: address, replacement });
      assert.equal(repeated.headers.get('x-camin-access-status'), 'rejected');
    }
    failDelivery = false;
    const retries = await Promise.all([
      decide(id, 'retry-rejection', otherCookie), decide(id, 'retry-rejection', otherCookie),
    ]);
    assert.deepEqual(retries.map(response => response.status).sort(), [200, 409]);
    assert.deepEqual(rejectedRecipients, [address]);
    assert.deepEqual(await pending(), []);

    const concurrentAddress = 'rejection-race@example.test';
    assert.equal((await publicRequest('request-access', { email: concurrentAddress })).status, 202);
    const [{ id: concurrentId }] = await pending();
    const outcomes = await Promise.all([
      decide(concurrentId, 'reject', otherCookie), decide(concurrentId, 'approve', otherCookie),
    ]);
    assert.equal(outcomes.filter(response => response.status === 409).length, 1);
    assert.ok([200, 201].includes(outcomes.find(response => response.status !== 409).status));
    assert.equal(rejectedRecipients.includes(concurrentAddress),
      !outbound.some(item => item.email === concurrentAddress));
    assert.deepEqual(await pending(), []);
  });

  const testEnvironment = { ...process.env, NODE_ENV: 'development', CAMIN_LOCAL_TEST_ACCOUNTS: 'true' };
  const configureTestAccount = (args, address, env = testEnvironment) => spawnSync(process.execPath,
    ['src/service-status-access.js', ...args], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), input: address + '\n', env, encoding: 'utf8',
    });
  const ownerSetup = configureTestAccount(['setup'], 'second-owner@example.test', {
    ...testEnvironment, CAMIN_SETUP_PASSWORD: password,
  });
  assert.equal(ownerSetup.status, 1);
  const testAdmin = 'admin@example.test';
  const setup = configureTestAccount(['setup'], testAdmin, { ...testEnvironment, CAMIN_SETUP_PASSWORD: password });
  assert.equal(setup.status, 0, setup.stderr);
  assert.equal((await request('login', { email: testAdmin, password })).status, 401);
  assert.equal(configureTestAccount(['--equipment', 'grant'], email).status, 1);

  const testServer = createApp(db, undefined, undefined, undefined, {
    testAccounts: true, appOrigin: 'https://camin.example.test', sendInvitation,
  }).listen(0, '127.0.0.1');
  await once(testServer, 'listening');
  t.after(() => testServer.close());
  const testBase = 'http://127.0.0.1:' + testServer.address().port;
  const local = (path, body, actor) => fetch(testBase + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', ...(actor && { cookie: actor }) },
    body: JSON.stringify(body),
  });
  const testLogin = await local('/api/auth/login', { email: testAdmin, password });
  assert.equal(testLogin.status, 200);
  const testCookie = testLogin.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await (await local('/api/auth/session', undefined, testCookie)).json(), { email: testAdmin, role: 'admin' });
  assert.equal((await local('/api/admin/database/equipment', undefined, testCookie)).status, 200);
  assert.equal((await local('/api/admin/access-requests', undefined, testCookie)).status, 200);
  assert.equal((await request('session', undefined, testCookie)).status, 401);
  assert.deepEqual(await testLogin.json(), { showWelcome: false });

  const fixtureAddress = 'rezident@example.test';
  assert.equal((await local('/api/auth/request-access', { email: fixtureAddress })).status, 202);
  const [fixtureRequest] = await (await local('/api/admin/access-requests', undefined, testCookie)).json();
  assert.equal(fixtureRequest.email, fixtureAddress);
  const fixtureApproval = await local('/api/admin/access-requests/' + fixtureRequest.id + '/approve', {}, testCookie);
  assert.equal(fixtureApproval.status, 201);
  assert.deepEqual(await fixtureApproval.json(), { delivery: 'sent' });
  const fixtureLink = new URL(outbound.at(-1).link);
  assert.equal(fixtureLink.origin, 'https://camin.example.test');
  assert.equal((await local('/api/auth/activate', { token: fixtureLink.hash.slice(1), password })).status, 201);

  const expiredAddress = 'expired-replacement@example.test';
  const expiredToken = await issueInvitation(db, expiredAddress);
  await db.query("UPDATE invitations SET expires_at = clock_timestamp() - interval '1 second' WHERE token_hash = $1",
    [tokenHash(expiredToken)]);
  const expiredReplacement = await local('/api/auth/request-access', { email: expiredAddress, replacement: true });
  assert.equal(expiredReplacement.status, 202);
  assert.equal(expiredReplacement.headers.get('x-camin-access-status'), 'replacement_received');
  const [expiredRequest] = await (await local('/api/admin/access-requests', undefined, testCookie)).json();
  assert.equal(expiredRequest.email, expiredAddress);
  assert.equal((await local('/api/admin/access-requests/' + expiredRequest.id + '/approve', {}, testCookie)).status, 201);

  assert.equal((await local('/api/auth/login', { email: fixtureAddress, password: 'wrong' })).status, 401);
  const fixtureLogins = await Promise.all(Array.from({ length: 2 }, () =>
    local('/api/auth/login', { email: fixtureAddress, password })));
  const welcomeFlags = await Promise.all(fixtureLogins.map(async response => {
    assert.equal(response.status, 200);
    return (await response.json()).showWelcome;
  }));
  assert.deepEqual(welcomeFlags.sort(), [false, true]);
  const fixtureLogin = fixtureLogins[0];
  const fixtureCookie = fixtureLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await local('/api/auth/logout', {}, fixtureLogins[1].headers.get('set-cookie').split(';')[0])).status, 204);
  assert.deepEqual(await (await local('/api/auth/login', { email: fixtureAddress, password })).json(), { showWelcome: false });
  assert.equal(configureTestAccount(['--equipment', 'grant'], fixtureAddress, {
    ...testEnvironment, NODE_ENV: 'production',
  }).status, 1);
  assert.equal(configureTestAccount(['--equipment', 'grant'], fixtureAddress).status, 0);
  assert.equal((await local('/api/laundry-reports/operator', undefined, fixtureCookie)).status, 200);
  assert.equal((await local('/api/equipment-access', undefined, fixtureCookie)).status, 204);

  const reportDraft = {
    category: 'other', locationType: 'shared', location: 'Test', description: 'Test de integrare',
  };
  for (const operatorCookie of [otherCookie, testCookie, fixtureCookie]) {
    assert.equal((await local('/api/laundry-reports', reportDraft, operatorCookie)).status, 403);
  }
  const report = await local('/api/laundry-reports', reportDraft, activeCookie);
  assert.equal(report.status, 201);
  const { id: reportId } = await report.json();
  for (const operatorCookie of [otherCookie, testCookie, fixtureCookie]) {
    const inbox = await (await local('/api/notifications', undefined, operatorCookie)).json();
    assert.equal(inbox.items.filter(item => item.kind === 'report-new' && item.reportId === reportId).length, 1);
  }
  assert.equal((await local('/api/laundry-reports/' + reportId + '/take', { priority: 'normal' }, fixtureCookie)).status, 204);
  assert.equal((await local('/api/laundry-reports/' + reportId + '/resolve', {}, fixtureCookie)).status, 204);
  assert.equal(configureTestAccount(['--equipment', 'revoke'], fixtureAddress).status, 0);
  assert.equal((await local('/api/laundry-reports/operator', undefined, fixtureCookie)).status, 403);

  await t.test('password reset expires, is consumed once, and fences out stale logins', async () => {
    const resetMail = [];
    let pauseLogin = false;
    const loginRead = Promise.withResolvers();
    const resumeLogin = Promise.withResolvers();
    const resetDatabase = {
      ...db,
      async query(sql, parameters) {
        const result = await db.query(sql, parameters);
        if (pauseLogin && sql.includes('SELECT id, password_hash FROM users WHERE email')) {
          pauseLogin = false;
          loginRead.resolve();
          await resumeLogin.promise;
        }
        return result;
      },
    };
    const resetServer = createApp(resetDatabase, undefined, undefined, undefined, {
      appOrigin: 'https://camin.example.test',
      sendPasswordReset: async (address, link) => resetMail.push({ address, url: new URL(link) }),
    }).listen(0, '127.0.0.1');
    await once(resetServer, 'listening');
    t.after(() => resetServer.close());
    const resetApi = (path, body, cookie) => fetch(`http://127.0.0.1:${resetServer.address().port}/api/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: JSON.stringify(body),
    });
    const ask = email => resetApi('request-password-reset', { email });
    const reset = (token, password) => resetApi('reset-password', { token, password });
    const signIn = password => resetApi('login', { email, password });
    const oldSession = await signIn(password);
    assert.equal(oldSession.status, 200);
    const oldCookie = oldSession.headers.get('set-cookie').split(';')[0];
    const absent = await ask('absent@example.test');
    const excluded = await ask(testAdmin);
    const present = await ask(' DEMO@example.test ');
    for (const response of [absent, excluded, present]) {
      assert.equal(response.status, 202);
      assert.equal(await response.text(), '');
    }
    assert.equal(resetMail.length, 1);
    assert.equal(resetMail[0].address, email);
    assert.equal(resetMail[0].url.origin, 'https://camin.example.test');
    assert.equal(resetMail[0].url.pathname, '/reseteaza-parola');
    const expiredToken = resetMail[0].url.hash.slice(1);
    assert.match(expiredToken, /^[\w-]{43}$/);
    const { rows: [lifetime] } = await db.query(`SELECT extract(epoch FROM expires_at - clock_timestamp())::int AS seconds
      FROM password_resets WHERE token_hash = $1`, [tokenHash(expiredToken)]);
    assert.ok(lifetime.seconds <= 1800 && lifetime.seconds > 1790);
    await db.query('UPDATE password_resets SET expires_at = clock_timestamp() WHERE token_hash = $1', [tokenHash(expiredToken)]);
    assert.equal((await reset(expiredToken, 'new test password')).status, 400);
    assert.equal((await resetApi('session', undefined, oldCookie)).status, 200);

    assert.equal((await ask(email)).status, 202);
    const token = resetMail.at(-1).url.hash.slice(1);
    const newPassword = 'altă1234';
    const competingPassword = 'x'.repeat(128);
    pauseLogin = true;
    const staleLogin = signIn(password);
    let results;
    try {
      await Promise.race([loginRead.promise, staleLogin.then(() => assert.fail('Login completed before the race barrier'))]);
      results = await Promise.all([reset(token, newPassword), reset(token, competingPassword)]);
    } finally {
      resumeLogin.resolve();
    }
    assert.deepEqual(results.map(response => response.status).sort(), [204, 400]);
    const staleResponse = await staleLogin;
    assert.equal(staleResponse.status, 401);
    assert.equal(staleResponse.headers.get('set-cookie'), null);
    assert.equal((await reset(token, 'reuse test')).status, 400);
    for (const actor of [oldCookie, activeCookie]) {
      assert.equal((await resetApi('session', undefined, actor)).status, 401);
    }
    assert.equal((await resetApi('session', undefined, otherCookie)).status, 200);
    assert.equal((await signIn(password)).status, 401);
    const winner = results[0].ok ? newPassword : competingPassword;
    const newSession = await signIn(winner);
    assert.equal(newSession.status, 200);
    assert.equal((await signIn(winner === newPassword ? competingPassword : newPassword)).status, 401);

    assert.equal((await ask(email)).status, 202);
    const nextToken = resetMail.at(-1).url.hash.slice(1);
    assert.notEqual(nextToken, token);
    const lastPassword = 'é'.repeat(128);
    assert.equal((await reset(nextToken, lastPassword)).status, 204);
    assert.equal((await resetApi('session', undefined, newSession.headers.get('set-cookie').split(';')[0])).status, 401);
    assert.equal((await signIn(lastPassword)).status, 200);
  });
});
