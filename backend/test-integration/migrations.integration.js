import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { runMigrations } from '../src/migrations.js';

test('migrations on a fresh, disposable PostgreSQL database', async t => {
  assert.equal(process.env.PGDATABASE, 'app_camin_migrations_test');
  const pool = new pg.Pool({ connectionTimeoutMillis: 4000 });
  t.after(() => pool.end());
  const directory = await mkdtemp(join(tmpdir(), 'camin-migrations-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const write = (name, sql) => writeFile(join(directory, name), sql);
  const run = mode => runMigrations(pool, directory, mode);
  const history = async () => (await pool.query(
    'SELECT filename FROM public.schema_migrations ORDER BY version',
  )).rows.map(row => row.filename);
  const historyExists = async () => (await pool.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
  )).rows[0].present;
  const hasLabel = async () => (await pool.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'migration_probe' AND column_name = 'label') AS present",
  )).rows[0].present;

  assert.equal(await historyExists(), false, 'Use a fresh test database');
  await write('001_create_probe.sql', 'CREATE TABLE public.migration_probe (id integer);');
  const addLabel = 'ALTER TABLE public.migration_probe ADD COLUMN label text;';
  await write('002_add_label.sql', addLabel + ' SELECT nonexistent_column;');

  await t.test('status reports pending files without writing history', async () => {
    assert.deepEqual(await run('status'), [
      { filename: '001_create_probe.sql', state: 'pending' },
      { filename: '002_add_label.sql', state: 'pending' },
    ]);
    assert.equal(await historyExists(), false);
  });

  await t.test('failure rolls back only the failing file, and retry resumes', async () => {
    await assert.rejects(run('apply'), /002_add_label.sql/);
    assert.deepEqual(await history(), ['001_create_probe.sql']);
    assert.equal(await hasLabel(), false);
    await write('002_add_label.sql', addLabel);
    assert.deepEqual(await run('apply'), [
      { filename: '001_create_probe.sql', state: 'applied' },
      { filename: '002_add_label.sql', state: 'newly applied' },
    ]);
    assert.equal(await hasLabel(), true);
    assert.deepEqual((await run('apply')).map(row => row.state), ['applied', 'applied']);
    assert.deepEqual(await history(), ['001_create_probe.sql', '002_add_label.sql']);
  });

  await t.test('modified history stops application before pending SQL', async () => {
    await write('003_insert_probe.sql', 'INSERT INTO public.migration_probe VALUES (1);');
    await write('002_add_label.sql', addLabel + '\n');
    await assert.rejects(run('apply'), /002_add_label.sql/);
    await assert.rejects(run('status'), /002_add_label.sql/);
    assert.equal((await pool.query('SELECT * FROM public.migration_probe')).rowCount, 0);
    await write('002_add_label.sql', addLabel);
  });

  await t.test('a concurrent command fails while the first is applying', async () => {
    const blocker = await pool.connect();
    let first;
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE public.migration_probe IN ACCESS EXCLUSIVE MODE');
      first = run('apply');
      // Wait until the first command has the migration lock and is waiting on the probe table.
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        waiting = (await blocker.query(
          "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE relation = 'public.migration_probe'::regclass AND NOT granted) AS waiting",
        )).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(waiting, true);
      await assert.rejects(run('apply'), /another migration run/i);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await first;
    }
    assert.deepEqual(await history(), ['001_create_probe.sql', '002_add_label.sql', '003_insert_probe.sql']);
    assert.equal((await pool.query('SELECT * FROM public.migration_probe')).rowCount, 1);
  });
});
