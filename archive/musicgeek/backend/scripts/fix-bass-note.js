const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'CHANGE_ME',
});

async function fixMissingBassNoteRule() {
  const client = await pool.connect();
  const output = [];

  try {
    await client.query('BEGIN');

    output.push('=== FIXING MISSING BASS NOTE RULE ===\n');

    // Check C Major current step 4
    output.push('1. Updating C Major Step 4...');
    await client.query(`
      UPDATE lesson_steps
      SET instruction = 'Strumming C Major: C major is a C-type chord, so we strum from the C string... wait, there''s no open C string on guitar! That''s what makes C unique. Instead, strum from the A string (5th) downward through the G string (3rd), avoiding the low E string. Try G-C-D progressions to hear C in musical context! The key principle still applies: we choose strumming to showcase the chord identity.'
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Bright Sound: C Major Chord')
      AND step_number = 4
    `);

    // Check F Major current step 4
    output.push('2. Updating F Major Step 4...');
    await client.query(`
      UPDATE lesson_steps
      SET instruction = 'Strumming Full F Major (The Challenge): When you play full F major with the barre, you''re covering multiple strings with one finger. Strum from the F... well, there''s no open F string either! Like C major, the actual string selection matters less than the principle: start your strum to let all the fretted notes ring cleanly. Eventually, you''ll develop an intuition for which string position gives the best sound.'
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'The Challenge: F Major Barre Chord')
      AND step_number = 4
    `);

    await client.query('COMMIT');
    output.push('\n✅ Updated both lessons with bass note principle!');
  } catch (error) {
    await client.query('ROLLBACK');
    output.push(`\n❌ ERROR: ${error.message}`);
  } finally {
    client.release();
    await pool.end();
  }

  const result = output.join('\n');
  fs.writeFileSync('BASS_NOTE_FIX.txt', result);
  console.log(result);
}

fixMissingBassNoteRule();
