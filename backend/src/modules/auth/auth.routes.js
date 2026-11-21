import express from 'express';
import { newToken, normalizeEmail, passwordLength, tokenHash, validToken, verifyPassword } from './credentials.js';
import { activateInvitation } from './invitations.js';

const sessionCookie = 'camin_session';
const sessionLifetime = 24 * 60 * 60 * 1000;
const attemptWindow = 60 * 1000;
const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function readSession(req) {
  const prefix = sessionCookie + '=';
  const token = req.get('cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(prefix))?.slice(prefix.length);
  return validToken(token) ? tokenHash(token) : null;
}

function limitedAttempts() {
  const attempts = new Map();
  let resetAt = 0;
  return (req, res) => {
    const now = Date.now();
    if (now >= resetAt) {
      attempts.clear();
      resetAt = now + attemptWindow;
    }
    const key = req.ip;
    const count = attempts.get(key) ?? 0;
    if (count >= 10) {
      res.set('Retry-After', String(Math.ceil((resetAt - now) / 1000)));
      res.status(429).json({ message: 'Prea multe încercări. Încearcă din nou peste un minut.' });
      return false;
    }
    attempts.set(key, count + 1);
    return true;
  };
}

export function authRoutes(database, origins = localOrigins) {
  const router = express.Router();
  const allowActivation = limitedAttempts();
  const allowLogin = limitedAttempts();
  const json = express.json({ limit: '8kb' });
  const cookieOptions = req => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.get('origin')?.startsWith('https://') === true,
    path: '/',
  });

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && !origins.includes(req.get('origin'))) {
      return res.status(403).json({ message: 'Originea cererii nu este permisă.' });
    }
    next();
  });

  router.post('/activate', json, async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!validToken(token)) return res.status(400).json({ code: 'invalid_invitation' });
    const length = passwordLength(password);
    if (length < 15 || length > 128) {
      return res.status(400).json({ message: 'Parola trebuie să aibă între 15 și 128 de caractere.' });
    }
    if (!allowActivation(req, res)) return;
    if (!await activateInvitation(database, token, password)) {
      return res.status(400).json({ code: 'invalid_invitation' });
    }
    res.status(201).end();
  });

  router.post('/login', json, async (req, res) => {
    const { email, password } = req.body ?? {};
    const normalized = normalizeEmail(email);
    const length = passwordLength(password);
    if (!normalized || length < 1 || length > 128) {
      return res.status(400).json({ message: 'Introdu o adresă de e-mail și o parolă validă.' });
    }
    if (!allowLogin(req, res)) return;
    const { rows: [user] } = await database.query('SELECT id, password_hash FROM users WHERE email = $1', [normalized]);
    if (!await verifyPassword(password, user?.password_hash)) {
      return res.status(401).json({ message: 'Adresa de e-mail sau parola este incorectă.' });
    }

    const token = newToken();
    await database.query('INSERT INTO sessions (token_hash, user_id) VALUES ($1, $2)', [tokenHash(token), user.id]);
    res.cookie(sessionCookie, token, { ...cookieOptions(req), maxAge: sessionLifetime });
    res.status(200).end();
  });

  router.get('/session', async (req, res) => {
    const digest = readSession(req);
    if (!digest) return res.status(401).end();
    const { rows: [account] } = await database.query(
      `SELECT users.email FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > clock_timestamp()`,
      [digest],
    );
    if (!account) return res.status(401).end();
    res.json(account);
  });

  router.post('/logout', async (req, res) => {
    const digest = readSession(req);
    if (digest) await database.query('DELETE FROM sessions WHERE token_hash = $1', [digest]);
    res.clearCookie(sessionCookie, cookieOptions(req));
    res.status(204).end();
  });

  router.use((error, _req, res, next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      return res.status(error.status).json({ message: 'Cererea nu este validă.' });
    }
    next(error);
  });
  return router;
}
