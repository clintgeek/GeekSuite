const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'postgres',
  password: 'REDACTED',
});

async function check() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT step_number, instruction
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      ORDER BY step_number
    `);

    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

check();
