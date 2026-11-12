import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDatabase, DATABASE_TIMEOUT_MS } from '../src/db.js';
import net from 'node:net';

async function serve(t, check) {
  const server = createApp({ check }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('health responds without consulting PostgreSQL', async t => {
  const base = await serve(t, () => { throw new Error('Database must not be called'); });
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', message: 'Backend is running.' });
});

test('ready confirms a successful database check', async t => {
  let calls = 0;
  const base = await serve(t, async () => { calls++; });
  const response = await fetch(`${base}/api/ready`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected', message: 'PostgreSQL connection successful.' });
  assert.equal(calls, 1);
});

test('database failure returns 503 without exposing connection details', async t => {
  const base = await serve(t, async () => { throw new Error('Internal connection details'); });
  const response = await fetch(`${base}/api/ready`);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.database, 'unavailable');
  assert.equal(body.status, 'error');
  assert.equal(JSON.stringify(body).includes('Internal connection details'), false);
  const health = await fetch(`${base}/api/health`);
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
  const response = await fetch(`${base}/api/ready`);
  const elapsed = performance.now() - start;
  assert.equal(response.status, 503);
  assert.ok(elapsed < DATABASE_TIMEOUT_MS + 1000, `Readiness took ${elapsed} ms`);
  assert.equal((await response.json()).database, 'unavailable');
});
