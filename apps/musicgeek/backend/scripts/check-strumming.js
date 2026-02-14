const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'postgres',
  password: 'postgres',
});

async function checkStrummingSteps() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT step_number, instruction
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      ORDER BY step_number
    `);

    console.log(`Found ${result.rows.length} steps:\n`);
    result.rows.forEach((row) => {
      console.log(`Step ${row.step_number}:`);
      console.log(row.instruction.substring(0, 200));
      console.log('---\n');
    });
  } finally {
    client.release();
    await pool.end();
  }
}

checkStrummingSteps().catch(console.error);
