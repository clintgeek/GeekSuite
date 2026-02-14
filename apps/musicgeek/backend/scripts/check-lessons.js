const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function checkLessons() {
  const result = await pool.query(`
    SELECT id, title, order_index
    FROM lessons
    WHERE instrument_id = (SELECT id FROM instruments WHERE name = 'guitar')
    ORDER BY order_index
  `);

  console.log('\n✅ Guitar lessons in database:');
  console.log('================================\n');
  result.rows.forEach((r) => {
    console.log(`  ${r.order_index}. ${r.title}`);
  });
  console.log('\n================================');
  console.log(`Total: ${result.rows.length} lessons\n`);

  await pool.end();
}

checkLessons().catch(console.error);
