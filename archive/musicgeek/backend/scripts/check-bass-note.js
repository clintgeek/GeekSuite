const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'CHANGE_ME',
});

async function checkBassNoteRule() {
  const client = await pool.connect();
  const output = [];

  try {
    const chords = [
      'Your First Chord: A Major',
      'The Triangle: D Major Chord',
      'Full Sound: E Major Chord',
      'Understanding Minor: A Minor Chord',
      'Easiest Chord: E Minor',
      'Dark Sound: D Minor Chord',
      'Bright Sound: C Major Chord',
      'Full Strummer: G Major Chord',
      'The Challenge: F Major Barre Chord',
    ];

    output.push('=== BASS NOTE RULE VERIFICATION ===\n');
    output.push('Checking if all chord lessons explain chord type and strumming origin...\n');

    for (const chord of chords) {
      const result = await client.query(
        `
        SELECT step_number, instruction
        FROM lesson_steps
        WHERE lesson_id = (SELECT id FROM lessons WHERE title = $1)
        AND (instruction LIKE '%type%chord%'
          OR instruction LIKE '%lowest note%'
          OR instruction LIKE '%strum from%')
        ORDER BY step_number
        LIMIT 1
      `,
        [chord]
      );

      if (result.rows.length > 0) {
        output.push(`✅ ${chord}`);
        output.push(
          `   Step ${result.rows[0].step_number}: "${result.rows[0].instruction.substring(0, 80)}..."`
        );
      } else {
        output.push(`❌ ${chord} - Bass note rule NOT found`);
      }
    }
  } catch (error) {
    output.push(`ERROR: ${error.message}`);
  } finally {
    client.release();
    await pool.end();
  }

  const result = output.join('\n');
  fs.writeFileSync('BASS_NOTE_RULE_CHECK.txt', result);
  console.log(result);
}

checkBassNoteRule();
