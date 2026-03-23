#!/usr/bin/env node
const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function seedMissingLessons() {
  const client = await pool.connect();

  try {
    console.log('🎸 Seeding missing foundation lessons...\n');

    // Get guitar instrument ID
    const instrumentResult = await client.query("SELECT id FROM instruments WHERE name = 'guitar'");
    const guitarId = instrumentResult.rows[0].id;

    const lessons = [
      {
        title: 'String Names: E-A-D-G-B-E',
        description: 'Learn the names of all six guitar strings and how to remember them.',
        order_index: 16,
        category: 'Basics',
        content_path: 'lessons/guitar-s1-l3-string-names.md',
        difficulty: 1,
        estimated_time_minutes: 10,
      },
      {
        title: 'Tuning Basics: Getting In Tune',
        description: 'Learn how to tune your guitar using the built-in tuner.',
        order_index: 17,
        category: 'Basics',
        content_path: 'lessons/guitar-s1-l4-tuning.md',
        difficulty: 1,
        estimated_time_minutes: 15,
      },
      {
        title: 'Finger Workout: Building Strength',
        description: 'Develop finger strength and dexterity with chromatic exercises.',
        order_index: 21,
        category: 'Technique',
        content_path: 'lessons/guitar-s1-l6-finger-workout.md',
        difficulty: 2,
        estimated_time_minutes: 15,
      },
      {
        title: 'Strumming 101: Down and Up',
        description: 'Master basic strumming patterns with down and up strokes.',
        order_index: 22,
        category: 'Technique',
        content_path: 'lessons/guitar-s1-l7-strumming.md',
        difficulty: 2,
        estimated_time_minutes: 20,
      },
      {
        title: 'Reading Chord Diagrams',
        description: 'Learn how to read and understand guitar chord diagrams.',
        order_index: 23,
        category: 'Theory',
        content_path: 'lessons/guitar-s1-l8-reading-diagrams.md',
        difficulty: 1,
        estimated_time_minutes: 10,
      },
      {
        title: 'Play a Melody: Single Notes',
        description: 'Play your first melody using single notes on the guitar.',
        order_index: 24,
        category: 'Playing',
        content_path: 'lessons/guitar-s1-l9-melody.md',
        difficulty: 2,
        estimated_time_minutes: 20,
      },
      {
        title: 'Smooth Transitions: Changing Chords',
        description: 'Practice smooth transitions between chords with timed exercises.',
        order_index: 25,
        category: 'Technique',
        content_path: 'lessons/guitar-s1-l10-transitions.md',
        difficulty: 3,
        estimated_time_minutes: 25,
      },
    ];

    for (const lesson of lessons) {
      const result = await client.query(
        `INSERT INTO lessons (instrument_id, title, description, order_index, category, content_path, difficulty, estimated_time_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING
         RETURNING id, title`,
        [
          guitarId,
          lesson.title,
          lesson.description,
          lesson.order_index,
          lesson.category,
          lesson.content_path,
          lesson.difficulty,
          lesson.estimated_time_minutes,
        ]
      );

      if (result.rows.length > 0) {
        console.log(`✅ Created: ${lesson.title}`);
        console.log(`   Order: ${lesson.order_index}, Path: ${lesson.content_path}\n`);
      } else {
        console.log(`⚠️  Skipped: ${lesson.title} (already exists)\n`);
      }
    }

    console.log('========================================');
    console.log('✨ Missing lessons seeded successfully!');
    console.log('========================================\n');

    // Verify
    const verify = await client.query(
      'SELECT COUNT(*) as count FROM lessons WHERE instrument_id = $1',
      [guitarId]
    );

    console.log(`Total guitar lessons in database: ${verify.rows[0].count}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedMissingLessons();
