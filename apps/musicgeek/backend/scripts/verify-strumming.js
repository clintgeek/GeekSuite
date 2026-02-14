const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function verify() {
  const client = await pool.connect();
  const output = [];

  try {
    output.push('=== CHECKING STRUMMING 101 STEPS ===\n');

    const result = await client.query(`
      SELECT step_number, instruction
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      ORDER BY step_number
    `);

    output.push(`Found ${result.rows.length} steps:\n`);
    result.rows.forEach((row) => {
      output.push(`\nStep ${row.step_number}:`);
      output.push(row.instruction.substring(0, 150) + '...\n');
    });

    // Check if migration was recorded
    const migResult = await client.query(`
      SELECT * FROM pgmigrations WHERE name = '1731196000000_clarify-strumming-and'
    `);

    output.push('\n=== MIGRATION STATUS ===');
    if (migResult.rows.length > 0) {
      output.push(`✅ Migration recorded at: ${migResult.rows[0].run_on}`);
    } else {
      output.push('❌ Migration NOT recorded yet');
    }
  } catch (error) {
    output.push(`\n❌ ERROR: ${error.message}`);
    output.push(error.stack);
  } finally {
    client.release();
    await pool.end();
  }

  const outputText = output.join('\n');
  fs.writeFileSync('/tmp/strumming-verification.txt', outputText);
  console.log(outputText);
}

verify();
