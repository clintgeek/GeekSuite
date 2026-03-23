const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function listLessons() {
  const client = await pool.connect();

  try {
    const countResult = await client.query('SELECT COUNT(*) FROM lessons');
    console.log(`Total lessons: ${countResult.rows[0].count}`);

    const result = await client.query(`
      SELECT id, title FROM lessons ORDER BY id LIMIT 20
    `);

    console.log('First 20 lessons:');
    result.rows.forEach((lesson) => {
      console.log(`${lesson.id}: ${lesson.title}`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

listLessons();
