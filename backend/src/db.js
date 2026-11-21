import pg from 'pg';

export const DATABASE_TIMEOUT_MS = 4000;

export function createDatabase(config) {
  const pool = new pg.Pool({
    ...config,
    connectionTimeoutMillis: DATABASE_TIMEOUT_MS,
    query_timeout: DATABASE_TIMEOUT_MS,
    statement_timeout: DATABASE_TIMEOUT_MS,
  });
  pool.on('error', () => console.error('An idle PostgreSQL connection failed.'));

  async function check() {
    let client;
    let expired = false;
    let timer;
    const operation = (async () => {
      const connection = await pool.connect();
      if (expired) {
        connection.release(true);
        return;
      }
      client = connection;
      await client.query('SELECT 1');
    })();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new Error('PostgreSQL readiness check timed out.'));
      }, DATABASE_TIMEOUT_MS);
    });
    try {
      await Promise.race([operation, deadline]);
    } finally {
      clearTimeout(timer);
      client?.release(expired);
    }
  }

  return {
    check,
    connect: () => pool.connect(),
    query: (sql, parameters) => pool.query(sql, parameters),
    close: () => pool.end(),
  };
}
