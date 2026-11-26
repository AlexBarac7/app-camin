import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { newToken } from '../src/modules/auth/credentials.js';

test('auth requires the app origin, validates inputs and limits repeated login attempts', async t => {
  const server = createApp({ check() {}, query: async () => ({ rows: [] }) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body, origin = 'http://localhost:5173') => fetch(base + '/api/auth/' + path, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await post('logout', {}, 'https://example.test')).status, 403);
  assert.equal((await post('request-password-reset', { email: 'demo@example.test' }, 'https://example.test')).status, 403);
  assert.equal((await post('reset-password', {}, 'https://example.test')).status, 403);
  assert.equal((await post('activate', {})).status, 400);
  const token = newToken();
  const shortPassword = await post('activate', { token, password: '1234567' });
  assert.equal(shortPassword.status, 400);
  assert.match((await shortPassword.json()).message, /8 și 128/);
  const validLength = await post('activate', { token, password: '12345678' });
  assert.equal(validLength.status, 400);
  assert.deepEqual(await validLength.json(), { code: 'invalid_invitation' });
  assert.equal((await post('login', {})).status, 400);
  assert.equal((await fetch(base + '/api/auth/session')).status, 401);

  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await post('login', { email: 'unknown@example.test', password: 'demo passphrase for test' });
    assert.equal(response.status, 401);
  }
  assert.equal((await post('login', { email: 'unknown@example.test', password: 'demo passphrase for test' })).status, 429);
});

test('password reset validates requests and accepts valid addresses generically', async t => {
  const server = createApp({ query: async () => ({ rows: [] }) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port + '/api/auth/';
  const post = (path, body) => fetch(base + path, {
    method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  assert.equal((await post('request-password-reset', { email: 'invalid' })).status, 400);
  const accepted = await post('request-password-reset', { email: 'unknown@example.test' });
  assert.equal(accepted.status, 202);
  assert.equal(await accepted.text(), '');
  assert.equal(accepted.headers.get('cache-control'), 'no-store');
  assert.equal((await post('reset-password', { token: 'invalid', password: '12345678' })).status, 400);
  for (const password of ['1234567', 'x'.repeat(129)]) {
    const response = await post('reset-password', { token: newToken(), password });
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /8 și 128/);
  }
  const invalid = await post('reset-password', { token: newToken(), password: 'x'.repeat(128) });
  assert.deepEqual(await invalid.json(), { code: 'invalid_password_reset' });
});
