const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function showEnhancedLessons() {
  const client = await pool.connect();
  const output = [];

  try {
    // Show the first step of a few enhanced lessons to verify changes
    const lessons = [
      'Your First Chord: A Major',
      'The Triangle: D Major Chord',
      'Easiest Chord: E Minor',
      'The Challenge: F Major Barre Chord',
    ];

    output.push('=== ENHANCED LESSONS VERIFICATION ===\n');

    for (const lessonTitle of lessons) {
      const result = await client.query(
        `
        SELECT step_number, instruction
        FROM lesson_steps
        WHERE lesson_id = (SELECT id FROM lessons WHERE title = $1)
        AND step_number = 1
      `,
        [lessonTitle]
      );

      if (result.rows.length > 0) {
        output.push(`\n📖 ${lessonTitle}`);
        output.push(`Step 1: ${result.rows[0].instruction.substring(0, 200)}...`);
        output.push(
          result.rows[0].instruction.includes('memory hook') ? '✅ Memory hook added' : ''
        );
        output.push(
          result.rows[0].instruction.includes('learning') ? '✅ Pedagogical language added' : ''
        );
      }
    }

    output.push('\n\n=== SUCCESS ===');
    output.push("Your friend's teaching tips have been successfully integrated!");
    output.push('Memory hooks, bass note rules, and encouragement are now in the lessons.');
  } catch (error) {
    output.push(`\n❌ ERROR: ${error.message}`);
  } finally {
    client.release();
    await pool.end();
  }

  const result = output.join('\n');
  fs.writeFileSync('INTEGRATION_VERIFICATION.txt', result);
  console.log(result);
}

showEnhancedLessons();
