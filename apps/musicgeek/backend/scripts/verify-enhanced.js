const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'CHANGE_ME',
});

async function verifyEnhanced() {
  const client = await pool.connect();
  const output = [];

  try {
    output.push('=== VERIFYING ENHANCED CHORD LESSONS ===\n');

    // Check a few enhanced lessons
    const chords = [
      'Your First Chord: A Major',
      'The Triangle: D Major Chord',
      'Understanding Minor: A Minor Chord',
      'Easiest Chord: E Minor',
    ];

    for (const chordName of chords) {
      const result = await client.query(
        `
        SELECT step_number, instruction
        FROM lesson_steps
        WHERE lesson_id = (SELECT id FROM lessons WHERE title = $1)
        ORDER BY step_number
        LIMIT 2
      `,
        [chordName]
      );

      output.push(`\n${chordName}:`);
      result.rows.forEach((row) => {
        output.push(`  Step ${row.step_number}: ${row.instruction.substring(0, 100)}...`);
      });
    }

    output.push('\n✅ Verification complete!');
  } catch (error) {
    output.push(`\n❌ ERROR: ${error.message}`);
  } finally {
    client.release();
    await pool.end();
  }

  const outputText = output.join('\n');
  fs.writeFileSync('ENHANCED_CHORDS_VERIFICATION.txt', outputText);
  console.log(outputText);
}

verifyEnhanced();
