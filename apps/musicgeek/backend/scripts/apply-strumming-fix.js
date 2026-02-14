#!/usr/bin/env node
const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'postgres',
  password: 'REDACTED',
});

async function main() {
  const client = await pool.connect();

  try {
    // Check current state first
    console.log('=== BEFORE ===');
    let result = await client.query(`
      SELECT step_number, LEFT(instruction, 80) as inst
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      ORDER BY step_number
    `);
    result.rows.forEach((row) => console.log(`Step ${row.step_number}: ${row.inst}`));

    // Apply changes
    console.log('\n=== APPLYING CHANGES ===');
    await client.query('BEGIN');

    console.log('1. Shift steps 9-11 to negative...');
    await client.query(`
      UPDATE lesson_steps
      SET step_number = -step_number
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number >= 9
    `);

    console.log('2. Shift to final positions...');
    await client.query(`
      UPDATE lesson_steps
      SET step_number = -step_number + 1
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number < 0
    `);

    console.log('3. Update step 8...');
    await client.query(
      `
      UPDATE lesson_steps
      SET instruction = $1
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number = 8
    `,
      [
        'Adding Up Strums - The "And": Now let\'s combine down and up! Count "1-and-2-and-3-and-4-and" out loud. Your hand moves constantly: DOWN(1)-up-DOWN(2)-up-DOWN(3)-up-DOWN(4)-up. Start by making ALL those motions, even if you miss the strings on the "ups". Just get the rhythm: down-up-down-up-down-up-down-up. Your hand bounces continuously!',
      ]
    );

    console.log('4. Insert new step 9...');
    await client.query(
      `
      INSERT INTO lesson_steps (lesson_id, step_number, instruction, visual_asset_url)
      SELECT id, 9, $1, null
      FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern'
    `,
      [
        'The Classic Pattern - D D U D U: Here\'s THE most common strumming pattern! Count "1-2-&-3-&-4-&". Strum: DOWN(1)-DOWN(2)-UP(&)-DOWN(3)-UP(&)-DOWN(4)-UP(&). Say it out loud as you play: "DOWN-DOWN-up-DOWN-up-DOWN-up". Notice: beats 1,2,3,4 are always DOWN. The "&" (and) beats are always UP. Practice slowly until it feels natural!',
      ]
    );

    await client.query('COMMIT');
    console.log('✅ COMMITTED');

    // Show after state
    console.log('\n=== AFTER ===');
    result = await client.query(`
      SELECT step_number, LEFT(instruction, 80) as inst
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      ORDER BY step_number
    `);
    result.rows.forEach((row) => console.log(`Step ${row.step_number}: ${row.inst}`));

    // Mark migration as complete
    console.log('\n=== MARKING MIGRATION AS COMPLETE ===');
    await client.query(`
      INSERT INTO pgmigrations (name, run_on)
      VALUES ('1731196000000_clarify-strumming-and', NOW())
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Migration recorded');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
