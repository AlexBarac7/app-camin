import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadDatabaseConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { issueInvitation, revokeInvitation } from '../src/modules/auth/invitations.js';

test('resident access on a fresh disposable PostgreSQL database', async t => {
  assert.equal(process.env.PGDATABASE, 'app_camin_auth_test');
  const db = createDatabase(loadDatabaseConfig());
  t.after(() => db.close());
  assert.deepEqual(await runMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)), 'apply'), [
    { filename: '001_resident_access.sql', state: 'newly applied' },
    { filename: '002_laundry_machines.sql', state: 'newly applied' },
  ]);
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const email = 'demo@example.test';
  const password = 'A demonstrative passphrase';
  const request = (path, body, cookie) => fetch(base + '/api/auth/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  });
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
    assert.deepEqual(await response.json(), { email });
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

  const cleanup = () => execFileSync('npm', ['--silent', 'run', 'sessions:cleanup'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
  }).trim();
  assert.equal(cleanup(), 'Sesiuni șterse: 1');
  assert.equal(cleanup(), 'Sesiuni șterse: 0');
  const activeSession = await request('session', undefined, activeCookie);
  assert.equal(activeSession.status, 200);
  assert.deepEqual(await activeSession.json(), { email });
});
