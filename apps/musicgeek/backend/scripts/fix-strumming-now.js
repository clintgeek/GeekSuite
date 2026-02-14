const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'postgres',
  password: 'postgres',
});

async function applyFix() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Shifting steps 9-11 to temporary negative values...');
    await client.query(`
      UPDATE lesson_steps
      SET step_number = -step_number
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number >= 9
    `);

    console.log('Shifting to final positions (+1)...');
    await client.query(`
      UPDATE lesson_steps
      SET step_number = -step_number + 1
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number < 0
    `);

    console.log('Updating step 8 instruction...');
    await client.query(`
      UPDATE lesson_steps
      SET instruction = 'Adding Up Strums - The "And": Now let''s combine down and up! Count "1-and-2-and-3-and-4-and" out loud. Your hand moves constantly: DOWN(1)-up-DOWN(2)-up-DOWN(3)-up-DOWN(4)-up. Start by making ALL those motions, even if you miss the strings on the "ups". Just get the rhythm: down-up-down-up-down-up-down-up. Your hand bounces continuously!'
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number = 8
    `);

    console.log('Inserting new step 9...');
    await client.query(`
      INSERT INTO lesson_steps (lesson_id, step_number, instruction, visual_asset_url)
      SELECT id, 9,
        'The Classic Pattern - D D U D U: Here''s THE most common strumming pattern! Count "1-2-&-3-&-4-&". Strum: DOWN(1)-DOWN(2)-UP(&)-DOWN(3)-UP(&)-DOWN(4)-UP(&). Say it out loud as you play: "DOWN-DOWN-up-DOWN-up-DOWN-up". Notice: beats 1,2,3,4 are always DOWN. The "&" (and) beats are always UP. Practice slowly until it feels natural!',
        null
      FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern'
    `);

    await client.query('COMMIT');
    console.log('✅ SUCCESS! Strumming instructions clarified.');

    // Verify
    const result = await client.query(`
      SELECT step_number, LEFT(instruction, 100) as inst
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      ORDER BY step_number
    `);

    console.log('\nCurrent steps:');
    result.rows.forEach((row) => {
      console.log(`${row.step_number}: ${row.inst}...`);
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ERROR:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyFix().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
