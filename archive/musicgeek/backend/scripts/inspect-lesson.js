const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function inspectLesson() {
  const client = await pool.connect();

  try {
    const lessonTitle = '%F Major%'; // F Major lesson

    const lessonResult = await client.query('SELECT id, title FROM lessons WHERE title LIKE $1', [
      lessonTitle,
    ]);

    if (lessonResult.rows.length === 0) {
      console.log('No lessons found with F Major');
      return;
    }

    console.log('Found lessons:');
    lessonResult.rows.forEach((row) => console.log(`${row.id}: ${row.title}`));

    // Use the first one
    const lessonId = lessonResult.rows[0].id;
    const actualTitle = lessonResult.rows[0].title;

    const stepsResult = await client.query(
      `
      SELECT step_number, instruction, media_url
      FROM lesson_steps
      WHERE lesson_id = $1
      ORDER BY step_number
    `,
      [lessonId]
    );

    console.log(`\n=== INSPECTING LESSON: ${actualTitle} (ID: ${lessonId}) ===\n`);

    stepsResult.rows.forEach((step) => {
      console.log(`Step ${step.step_number}:`);
      console.log(`Instruction: ${step.instruction}`);
      console.log(`Media URL: ${step.media_url || 'None'}`);
      console.log('---');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

inspectLesson();
