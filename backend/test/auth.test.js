import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';

test('auth requires the app origin, validates inputs and limits repeated login attempts', async t => {
  const server = createApp({ check() {}, query: async () => ({ rows: [] }) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body, origin = 'http://localhost:5173') => fetch(base + '/api/auth/' + path, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await post('logout', {}, 'https://example.test')).status, 403);
  assert.equal((await post('activate', {})).status, 400);
  assert.equal((await post('login', {})).status, 400);
  assert.equal((await fetch(base + '/api/auth/session')).status, 401);

  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await post('login', { email: 'unknown@example.test', password: 'demo passphrase for test' });
    assert.equal(response.status, 401);
  }
  assert.equal((await post('login', { email: 'unknown@example.test', password: 'demo passphrase for test' })).status, 429);
});
