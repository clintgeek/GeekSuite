const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'CHANGE_ME',
});

async function showFull() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT step_number, instruction
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number >= 8
      ORDER BY step_number
    `);

    result.rows.forEach((row) => {
      console.log(`\n=== STEP ${row.step_number} ===`);
      console.log(row.instruction);
    });
  } finally {
    client.release();
    await pool.end();
  }
}

showFull();
