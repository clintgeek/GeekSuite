const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function reviewLessons() {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        id,
        title,
        description,
        order_index,
        category,
        difficulty,
        estimated_time_minutes
      FROM lessons
      WHERE instrument_id = (SELECT id FROM instruments WHERE name = 'guitar')
      ORDER BY order_index
    `);

    console.log(`=== GUITAR LESSONS (Total: ${result.rows.length}) ===\n`);

    result.rows.forEach((lesson, index) => {
      console.log(`${index + 1}. ${lesson.title}`);
      console.log(
        `   Order: ${lesson.order_index} | Category: ${lesson.category} | Difficulty: ${lesson.difficulty} | Time: ${lesson.estimated_time_minutes}min`
      );
      console.log(`   Description: ${lesson.description}`);
      console.log('');
    });

    // Get step count for each lesson
    console.log('=== LESSON STEP COUNTS ===\n');
    for (const lesson of result.rows) {
      const stepResult = await client.query(
        `
        SELECT COUNT(*) as step_count
        FROM lesson_steps
        WHERE lesson_id = $1
      `,
        [lesson.id]
      );

      console.log(`${lesson.title}: ${stepResult.rows[0].step_count} steps`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

reviewLessons();
