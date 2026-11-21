import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const lockKey = "hashtext('app-camin'), hashtext('schema_migrations')";

async function loadMigrations(directory) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name));

  const migrations = [];
  for (const file of files) {
    const match = /^([0-9]{3})_[a-z0-9_]+\.sql$/.exec(file.name);
    if (!file.isFile() || !match || match[1] === '000') {
      throw new Error('Invalid migration filename. Use 001_description.sql.');
    }
    const version = Number(match[1]);
    if (migrations.at(-1)?.version === version) {
      throw new Error(`Duplicate migration version: ${match[1]}.`);
    }
    const bytes = await readFile(join(directory, file.name));
    migrations.push({
      version,
      filename: file.name,
      checksum: createHash('sha256').update(bytes).digest('hex'),
      sql: bytes.toString('utf8'),
    });
  }
  return migrations;
}

async function readHistory(client, migrations) {
  const { rows: [table] } = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
  );
  const history = table.present
    ? (await client.query(
      'SELECT version, filename, checksum FROM public.schema_migrations ORDER BY version',
    )).rows
    : [];

  for (const [index, applied] of history.entries()) {
    const local = migrations[index];
    if (local?.version !== applied.version || local.filename !== applied.filename
        || local.checksum !== applied.checksum) {
      throw new Error(`Migration history mismatch for version ${applied.version} (${applied.filename}).`);
    }
  }
  return { count: history.length, exists: table.present };
}

async function applyMigration(client, migration, historyExists) {
  await client.query('BEGIN');
  try {
    if (!historyExists) {
      await client.query(`
        CREATE TABLE public.schema_migrations (
          version integer PRIMARY KEY,
          filename text NOT NULL,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    }
    await client.query(migration.sql);
    await client.query(
      'INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
      [migration.version, migration.filename, migration.checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const code = /^[A-Z0-9]{5}$/.test(error.code) ? ` (SQLSTATE ${error.code})` : '';
    throw new Error(`Migration failed: ${migration.filename}${code}.`);
  }
}

export async function runMigrations(pool, directory, mode) {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  let locked = false;
  try {
    if (mode === 'status') {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    } else {
      const { rows: [lock] } = await client.query(
        `SELECT pg_try_advisory_lock(${lockKey}) AS acquired`,
      );
      locked = lock.acquired;
      if (!locked) throw new Error('Another migration run is already active.');
    }

    const history = await readHistory(client, migrations);
    const result = [];
    for (const [index, migration] of migrations.entries()) {
      let state = 'applied';
      if (index >= history.count) {
        state = 'pending';
        if (mode === 'apply') {
          await applyMigration(client, migration, history.exists || index > 0);
          state = 'newly applied';
        }
      }
      result.push({ filename: migration.filename, state });
    }
    if (mode === 'status') await client.query('COMMIT');
    return result;
  } finally {
    try {
      if (locked) await client.query(`SELECT pg_advisory_unlock(${lockKey})`);
    } finally {
      client.release(true);
    }
  }
}
