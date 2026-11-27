import express from 'express';
import { transaction } from '../../db.js';
import { invitationEmail, newToken, normalizeEmail, passwordLength, tokenHash, validToken, verifyPassword } from './credentials.js';
import { activateInvitation, requestAccess } from './invitations.js';
import { accountRole, isTestAccount, testResidentEmail } from './account-roles.js';
import { issuePasswordReset, resetPassword } from './password-resets.js';

const sessionCookie = 'camin_session';
const sessionLifetime = 24 * 60 * 60 * 1000;
const attemptWindow = 60 * 1000;
export const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function readSession(req) {
  const prefix = sessionCookie + '=';
  const token = req.get('cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(prefix))?.slice(prefix.length);
  return validToken(token) ? tokenHash(token) : null;
}

export async function sessionAccount(database, req) {
  const digest = readSession(req);
  if (!digest) return null;
  const { rows: [account] } = await database.query(
    `SELECT users.*
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > clock_timestamp()`,
    [digest],
  );
  const { testAccounts } = req.app.locals;
  if (!account || (!testAccounts && isTestAccount(account.email))) return null;
  return { id: account.id, email: account.email, role: accountRole(account, testAccounts) };
}

export function requireSession(database, { serviceStatus = false, manageEquipment = false, admin = false } = {}) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const account = await sessionAccount(database, req);
    if (!account) return res.status(401).end();
    if ((serviceStatus || admin) && account.role !== 'admin') return res.status(403).end();
    if (manageEquipment && account.role === 'resident') return res.status(403).end();
    res.locals.account = account;
    next();
  };
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

export function authRoutes(database, origins = localOrigins, { appOrigin, sendPasswordReset } = {}) {
  const router = express.Router();
  const allowActivation = limitedAttempts();
  const allowLogin = limitedAttempts();
  const allowRequest = limitedAttempts();
  const allowResetRequest = limitedAttempts();
  const allowReset = limitedAttempts();
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
    if (length < 8 || length > 128) {
      return res.status(400).json({ message: 'Parola trebuie să aibă între 8 și 128 de caractere.' });
    }
    if (!allowActivation(req, res)) return;
    if (!await activateInvitation(database, token, password)) {
      return res.status(400).json({ code: 'invalid_invitation' });
    }
    res.status(201).end();
  });

  router.post('/request-access', json, async (req, res) => {
    const { email: value, replacement = false } = req.body ?? {};
    const email = invitationEmail(value);
    if (!email) return res.status(400).json({ message: 'Introdu o adresă de e-mail validă.' });
    if (typeof replacement !== 'boolean') return res.status(400).json({ message: 'Cererea nu este validă.' });
    if (!allowRequest(req, res)) return;
    const allowed = !isTestAccount(email) || (req.app.locals.testAccounts && email === testResidentEmail);
    const status = allowed ? await requestAccess(database, email, req.app.locals.testAccounts, replacement) : 'unavailable';
    res.status(202).set('X-Camin-Access-Status', status).end();
  });

  router.post('/request-password-reset', json, async (req, res) => {
    const email = invitationEmail(req.body?.email);
    if (!email) return res.status(400).json({ message: 'Introdu o adresă de e-mail validă.' });
    if (!allowResetRequest(req, res)) return;
    const token = sendPasswordReset && (req.app.locals.testAccounts || !isTestAccount(email))
      ? await issuePasswordReset(database, email) : null;
    res.status(202).end();
    if (token) {
      try {
        await sendPasswordReset(email, new URL('/reseteaza-parola#' + token, appOrigin).href);
      } catch {
        console.error('Could not send password reset email.');
      }
    }
  });

  router.post('/reset-password', json, async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!validToken(token)) return res.status(400).json({ code: 'invalid_password_reset' });
    const length = passwordLength(password);
    if (length < 8 || length > 128) {
      return res.status(400).json({ message: 'Parola trebuie să aibă între 8 și 128 de caractere.' });
    }
    if (!allowReset(req, res)) return;
    if (!await resetPassword(database, token, password)) {
      return res.status(400).json({ code: 'invalid_password_reset' });
    }
    res.status(204).end();
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
    const storedHash = !req.app.locals.testAccounts && isTestAccount(normalized) ? undefined : user?.password_hash;
    const invalidCredentials = () => res.status(401).json({ message: 'Adresa de e-mail sau parola este incorectă.' });
    if (!await verifyPassword(password, storedHash)) {
      return invalidCredentials();
    }

    const token = newToken();
    const showWelcome = await transaction(database, async client => {
      const { rows: [current] } = await client.query(
        'SELECT welcome_pending FROM users WHERE id = $1 AND password_hash = $2 FOR UPDATE',
        [user.id, storedHash],
      );
      if (!current) return null;
      await client.query('INSERT INTO sessions (token_hash, user_id) VALUES ($1, $2)', [tokenHash(token), user.id]);
      if (current.welcome_pending) {
        await client.query('UPDATE users SET welcome_pending = false WHERE id = $1', [user.id]);
      }
      return current.welcome_pending;
    });
    if (showWelcome === null) return invalidCredentials();
    res.cookie(sessionCookie, token, { ...cookieOptions(req), maxAge: sessionLifetime });
    res.json({ showWelcome });
  });

  router.get('/session', requireSession(database), (_req, res) => {
    const { email, role } = res.locals.account;
    res.json({ email, role });
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
