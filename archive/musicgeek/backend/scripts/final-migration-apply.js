#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const LOG_FILE = path.join(__dirname, '..', 'MIGRATION_RESULT.txt');
const log = [];

function write(msg) {
  log.push(msg);
  console.log(msg);
}

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'CHANGE_ME',
});

async function applyMigration() {
  const client = await pool.connect();

  try {
    write('=== BEFORE MIGRATION ===\n');
    let result = await client.query(`
      SELECT step_number, LEFT(instruction, 60) as inst
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      ORDER BY step_number
    `);
    result.rows.forEach((row) => write(`  Step ${row.step_number}: ${row.inst}...`));

    write('\n=== APPLYING MIGRATION ===');
    await client.query('BEGIN');

    write('1. Shifting steps 9-11 to negative values...');
    await client.query(`
      UPDATE lesson_steps
      SET step_number = -step_number
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number >= 9
    `);

    write('2. Shifting to final positions...');
    await client.query(`
      UPDATE lesson_steps
      SET step_number = -step_number + 1
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number < 0
    `);

    write('3. Updating step 8...');
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

    write('4. Inserting new step 9...');
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

    write('5. Recording migration...');
    await client.query(`
      INSERT INTO pgmigrations (name, run_on)
      VALUES ('1731196000000_clarify-strumming-and', NOW())
    `);

    await client.query('COMMIT');
    write('✅ COMMITTED SUCCESSFULLY!');

    write('\n=== AFTER MIGRATION ===\n');
    result = await client.query(`
      SELECT step_number, LEFT(instruction, 60) as inst
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      ORDER BY step_number
    `);
    result.rows.forEach((row) => write(`  Step ${row.step_number}: ${row.inst}...`));

    write('\n✅✅✅ MIGRATION COMPLETE! ✅✅✅');
    write('\nStrumming 101 now has:');
    write('  - Step 8: Continuous down-up motion (1-and-2-and-3-and-4-and)');
    write('  - Step 9: Specific D-D-U-D-U pattern');
    write('  - Steps 10-11: Common mistakes & practice plan');
  } catch (error) {
    await client.query('ROLLBACK');
    write('\n❌❌❌ ERROR ❌❌❌');
    write(`Error: ${error.message}`);
    write(error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
    fs.writeFileSync(LOG_FILE, log.join('\n'));
    write(`\nLog saved to: ${LOG_FILE}`);
  }
}

applyMigration().catch((err) => {
  write(`Fatal error: ${err.message}`);
  fs.writeFileSync(LOG_FILE, log.join('\n'));
  process.exit(1);
});
