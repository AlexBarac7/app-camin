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

export function loadConfig(env = process.env) {
  return {
    port: port(env, 'PORT'),
    database: loadDatabaseConfig(env),
    internalReadinessPort: env.INTERNAL_READINESS_PORT === undefined
      ? undefined : port(env, 'INTERNAL_READINESS_PORT'),
  };
}
