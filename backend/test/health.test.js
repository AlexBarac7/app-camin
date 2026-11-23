import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDatabase, DATABASE_TIMEOUT_MS } from '../src/db.js';
import net from 'node:net';
import { newToken } from '../src/modules/auth/credentials.js';

const adminSession = { headers: { cookie: 'camin_session=' + newToken() } };

async function serve(t, check, account = { can_view_service_status: true }) {
  const server = createApp({ check, query: async () => ({ rows: account ? [account] : [] }) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('health responds without running the readiness probe', async t => {
  const base = await serve(t, () => { throw new Error('Readiness probe must not be called'); });
  const response = await fetch(`${base}/api/health`, adminSession);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', message: 'Backend is running.' });
});

test('ready confirms a successful database check', async t => {
  let calls = 0;
  const base = await serve(t, async () => { calls++; });
  const response = await fetch(`${base}/api/ready`, adminSession);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected', message: 'PostgreSQL connection successful.' });
  assert.equal(calls, 1);
});

test('database failure returns 503 without exposing connection details', async t => {
  const base = await serve(t, async () => { throw new Error('Internal connection details'); });
  const response = await fetch(`${base}/api/ready`, adminSession);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.database, 'unavailable');
  assert.equal(body.status, 'error');
  assert.equal(JSON.stringify(body).includes('Internal connection details'), false);
  const health = await fetch(`${base}/api/health`, adminSession);
  assert.equal(health.status, 200);
});

test('missing configuration fails without exposing environment values', () => {
  assert.throws(() => loadConfig({ PORT: '3000' }), { message: 'Missing required environment variable: PGHOST' });
  assert.throws(() => loadConfig({ PORT: 'invalid' }), { message: 'Invalid port environment variable: PORT' });
});

test('an unresponsive PostgreSQL peer cannot keep readiness waiting indefinitely', async t => {
  const sockets = new Set();
  const peer = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  }).listen(0, '127.0.0.1');
  await once(peer, 'listening');
  const database = createDatabase({ host: '127.0.0.1', port: peer.address().port, user: 'timeout_probe', database: 'timeout_probe' });
  t.after(async () => {
    await database.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => peer.close(resolve));
  });
  const base = await serve(t, database.check);
  const start = performance.now();
  const response = await fetch(`${base}/api/ready`, adminSession);
  const elapsed = performance.now() - start;
  assert.equal(response.status, 503);
  assert.ok(elapsed < DATABASE_TIMEOUT_MS + 1000, `Readiness took ${elapsed} ms`);
  assert.equal((await response.json()).database, 'unavailable');
});

test('admin endpoints reject missing, expired and unauthorized sessions without caching', async t => {
  const check = () => assert.fail('Unauthorized requests cannot run probes');
  const resident = await serve(t, check, {});
  const expired = await serve(t, check, null);
  for (const path of ['/api/admin/access', '/api/health', '/api/ready']) {
    for (const [base, options, status] of [
      [resident, undefined, 401], [expired, adminSession, 401], [resident, adminSession, 403],
    ]) {
      const response = await fetch(base + path, options);
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
  const admin = await serve(t, check);
  const response = await fetch(admin + '/api/admin/access', adminSession);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
