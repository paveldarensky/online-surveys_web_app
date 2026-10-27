import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
});

export async function checkConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
