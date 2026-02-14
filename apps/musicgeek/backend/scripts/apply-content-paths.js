#!/usr/bin/env node
const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function applyContentPaths() {
  const client = await pool.connect();

  try {
    console.log('🔗 Linking lessons to markdown files...\n');

    const mappings = [
      ['Welcome to Your Guitar', 'lessons/guitar-s1-l1-welcome.md'],
      ['Posture & Holding the Guitar', 'lessons/guitar-s1-l2-posture-holding.md'],
      ['String Names: E-A-D-G-B-E', 'lessons/guitar-s1-l3-string-names.md'],
      ['Tuning Basics: Getting In Tune', 'lessons/guitar-s1-l4-tuning.md'],
      ['Your First Chord: E Minor (Em)', 'lessons/guitar-s1-l5-em-first-chord.md'],
      ['Finger Workout: Building Strength', 'lessons/guitar-s1-l6-finger-workout.md'],
      ['Strumming 101: Down and Up', 'lessons/guitar-s1-l7-strumming.md'],
      ['Reading Chord Diagrams', 'lessons/guitar-s1-l8-reading-diagrams.md'],
      ['Play a Melody: Single Notes', 'lessons/guitar-s1-l9-melody.md'],
      ['Smooth Transitions: Changing Chords', 'lessons/guitar-s1-l10-transitions.md'],
    ];

    for (const [title, path] of mappings) {
      const result = await client.query(
        'UPDATE lessons SET content_path = $1 WHERE title = $2 AND (content_path IS NULL OR content_path != $1) RETURNING id, title',
        [path, title]
      );

      if (result.rows.length > 0) {
        console.log(`✅ Updated: ${title}`);
        console.log(`   Path: ${path}\n`);
      } else {
        console.log(`⚠️  Skipped: ${title} (already set or not found)\n`);
      }
    }

    console.log('========================================');
    console.log('✨ Content paths applied successfully!');
    console.log('========================================\n');

    // Verify the updates
    const verify = await client.query(
      "SELECT title, content_path FROM lessons WHERE content_path LIKE 'lessons/guitar-s1-%' ORDER BY order_index"
    );

    console.log('Verified lessons with content paths:');
    verify.rows.forEach((row) => {
      console.log(`  - ${row.title}: ${row.content_path}`);
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyContentPaths();
