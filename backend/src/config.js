import { invitationEmail } from './modules/auth/credentials.js';

function required(env, name) {
  if (!env[name]?.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return env[name];
}

function port(env, name) {
  const value = required(env, name);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`Invalid port environment variable: ${name}`);
  }
  return Number(value);
}

export function loadDatabaseConfig(env = process.env) {
  return {
    host: required(env, 'PGHOST'),
    port: port(env, 'PGPORT'),
    database: required(env, 'PGDATABASE'),
    user: required(env, 'PGUSER'),
    password: required(env, 'PGPASSWORD'),
  };
}

function invitationMailConfig(env) {
  if (!env.SMTP_HOST?.trim()) return undefined;
  const host = required(env, 'SMTP_HOST');
  const security = env.SMTP_SECURITY || 'starttls';
  const local = security === 'local';
  if (!['starttls', 'tls', 'local'].includes(security) || (local && (
    !['development', 'test'].includes(env.NODE_ENV) || !['mailpit', 'localhost', '127.0.0.1'].includes(host)
  ))) throw new Error('Invalid SMTP_SECURITY for this environment.');
  const from = invitationEmail(required(env, 'SMTP_FROM'));
  if (!from) throw new Error('Invalid SMTP_FROM.');
  return {
    host, port: port(env, 'SMTP_PORT'), secure: security === 'tls', requireTLS: security === 'starttls',
    from, ...(local ? { ignoreTLS: true } : {
      auth: { user: required(env, 'SMTP_USER'), pass: required(env, 'SMTP_PASSWORD') },
    }),
  };
}

export function loadConfig(env = process.env) {
  const push = ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].some(name => env[name])
    ? {
      subject: required(env, 'VAPID_SUBJECT'),
      publicKey: required(env, 'VAPID_PUBLIC_KEY'),
      privateKey: required(env, 'VAPID_PRIVATE_KEY'),
    }
    : undefined;
  const photos = env.PHOTO_S3_ACCESS_KEY || env.PHOTO_S3_SECRET_KEY ? {
    endpoint: required(env, 'PHOTO_S3_ENDPOINT'),
    bucket: required(env, 'PHOTO_S3_BUCKET'),
    region: env.PHOTO_S3_REGION || 'us-east-1',
    accessKeyId: required(env, 'PHOTO_S3_ACCESS_KEY'),
    secretAccessKey: required(env, 'PHOTO_S3_SECRET_KEY'),
  } : undefined;
  return {
    port: port(env, 'PORT'),
    database: loadDatabaseConfig(env),
    push,
    photos,
    invitationMail: invitationMailConfig(env),
    internalReadinessPort: env.INTERNAL_READINESS_PORT === undefined
      ? undefined : port(env, 'INTERNAL_READINESS_PORT'),
  };
}
