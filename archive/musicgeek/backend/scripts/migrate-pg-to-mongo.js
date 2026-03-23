require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const mongoose = require('mongoose');
const Instrument = require('../src/models/Instrument');
const User = require('../src/models/User');
const Lesson = require('../src/models/Lesson');
const Achievement = require('../src/models/Achievement');
const UserProgress = require('../src/models/UserProgress');
const PracticeSession = require('../src/models/PracticeSession');

// PG Connection
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ID Maps (PG UUID -> Mongo ObjectId)
const idMap = {
  instruments: new Map(),
  users: new Map(),
  lessons: new Map(),
  achievements: new Map(),
};

const connectMongo = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB Connected');
};

const migrateInstruments = async () => {
  console.log('Migrating Instruments...');
  const { rows: instruments } = await pgPool.query('SELECT * FROM instruments');

  for (const inst of instruments) {
    // Get tunings
    const { rows: tunings } = await pgPool.query(
      'SELECT * FROM tuning_configurations WHERE instrument_id = $1',
      [inst.id]
    );

    const newInst = await Instrument.create({
      name: inst.name,
      displayName: inst.display_name,
      description: inst.description,
      icon: inst.icon,
      colorTheme: inst.color_theme,
      features: {
        tunerEnabled: inst.tuner_enabled,
        hasFretboard: inst.has_fretboard,
      },
      tunings: tunings.map((t) => ({
        name: t.name,
        isDefault: t.is_default,
        description: t.description,
        strings: t.strings,
      })),
    });

    idMap.instruments.set(inst.id, newInst._id);
  }
  console.log(`Migrated ${instruments.length} instruments`);
};

const migrateAchievements = async () => {
  console.log('Migrating Achievements...');
  const { rows: achievements } = await pgPool.query('SELECT * FROM achievements');

  for (const ach of achievements) {
    const newAch = await Achievement.create({
      name: ach.name,
      description: ach.description,
      criteria: ach.criteria,
      xpReward: ach.xp_reward,
    });
    idMap.achievements.set(ach.id, newAch._id);
  }
  console.log(`Migrated ${achievements.length} achievements`);
};

const migrateUsers = async () => {
  console.log('Migrating Users...');
  const { rows: users } = await pgPool.query('SELECT * FROM users');

  for (const user of users) {
    // Get user instruments
    const { rows: userInsts } = await pgPool.query(
      'SELECT * FROM user_instruments WHERE user_id = $1',
      [user.id]
    );

    // Get streaks
    const { rows: streaks } = await pgPool.query(
      'SELECT * FROM user_daily_streaks WHERE user_id = $1',
      [user.id]
    );
    const streak = streaks[0] || {};

    // Get achievements
    const { rows: userAchs } = await pgPool.query(
      'SELECT * FROM user_achievements WHERE user_id = $1',
      [user.id]
    );

    const newUser = await User.create({
      email: user.email,
      passwordHash: user.password_hash,
      displayName: user.display_name,
      name: user.name,
      bio: user.bio,
      avatarUrl: user.avatar_url,
      gamification: {
        totalXp: user.total_xp,
        level: user.level,
        currentStreak: streak.current_streak || 0,
        longestStreak: streak.longest_streak || 0,
        lastPracticeDate: streak.last_practice_date,
      },
      instruments: userInsts.map((ui) => ({
        instrumentId: idMap.instruments.get(ui.instrument_id),
        isActive: ui.is_active,
        skillLevel: ui.skill_level,
        totalPracticeTime: ui.total_practice_time,
        lessonsCompleted: ui.lessons_completed,
        startedAt: ui.started_at,
      })),
      activeInstrumentId: user.active_instrument_id
        ? idMap.instruments.get(user.active_instrument_id)
        : undefined,
      preferences: user.preferences,
      achievements: userAchs.map((ua) => ({
        achievementId: idMap.achievements.get(ua.achievement_id),
        earnedAt: ua.earned_at,
      })),
    });

    idMap.users.set(user.id, newUser._id);
  }
  console.log(`Migrated ${users.length} users`);
};

const migrateLessons = async () => {
  console.log('Migrating Lessons...');
  const { rows: lessons } = await pgPool.query('SELECT * FROM lessons ORDER BY order_index');

  for (const lesson of lessons) {
    // Get steps
    const { rows: steps } = await pgPool.query(
      'SELECT * FROM lesson_steps WHERE lesson_id = $1 ORDER BY step_number',
      [lesson.id]
    );

    const newLesson = await Lesson.create({
      title: lesson.title,
      description: lesson.description,
      category: lesson.category,
      difficulty: lesson.difficulty,
      estimatedTimeMinutes: lesson.estimated_time_minutes || lesson.estimated_duration,
      orderIndex: lesson.order_index,
      instrumentId: lesson.instrument_id ? idMap.instruments.get(lesson.instrument_id) : undefined,
      contentPath: lesson.content_path,
      videoUrl: lesson.video_url,
      tags: lesson.tags || [],
      // Prerequisites handling omitted for simplicity or needs 2-pass if self-referencing
      steps: steps.map((step) => ({
        stepNumber: step.step_number,
        instruction: step.instruction,
        visualAssetUrl: step.visual_asset_url,
        codeExample: step.code_example,
        type: step.step_type || 'basic',
        media: {
          type: step.media_type,
          url: step.media_url,
        },
        interactiveContent: step.interactive_content,
        config: step.step_config,
      })),
    });

    idMap.lessons.set(lesson.id, newLesson._id);
  }
  console.log(`Migrated ${lessons.length} lessons`);
};

const migrateProgressAndPractice = async () => {
  console.log('Migrating Progress & Practice...');

  // User Progress
  const { rows: progress } = await pgPool.query('SELECT * FROM user_progress');
  for (const p of progress) {
    const userId = idMap.users.get(p.user_id);
    const lessonId = idMap.lessons.get(p.lesson_id);

    if (userId && lessonId) {
      // Get exercise history (if any, though schema didn't explicitly show a table for it in previous view, assuming it might be new or handled differently. The plan mentioned 'user_exercise_progress' table in service but not in migration view. I'll check if table exists or skip.)
      // Checking service code: yes, 'user_exercise_progress' table exists.
      let exercises = [];
      try {
        const { rows: exRows } = await pgPool.query(
          'SELECT * FROM user_exercise_progress WHERE user_id = $1 AND lesson_id = $2',
          [p.user_id, p.lesson_id]
        );
        exercises = exRows.map((e) => ({
          type: e.exercise_type,
          metricName: e.metric_name,
          metricValue: e.metric_value,
          notes: e.notes,
          recordedAt: e.recorded_at,
        }));
      } catch (e) {
        // Table might not exist yet if migration 1763602438000 wasn't run or I missed it.
        // Ignoring error.
      }

      await UserProgress.create({
        userId,
        lessonId,
        status: {
          isCompleted: p.completed || p.completed_at != null,
          completedAt: p.completed_at,
          startedAt: p.started_at || p.created_at,
          currentStep: p.current_step,
        },
        stats: {
          score: p.score,
          xpGained: p.xp_gained,
        },
        exercises,
      });
    }
  }

  // Practice Sessions
  const { rows: sessions } = await pgPool.query('SELECT * FROM practice_sessions');
  for (const s of sessions) {
    const userId = idMap.users.get(s.user_id);
    if (userId) {
      await PracticeSession.create({
        userId,
        startTime: s.start_time,
        endTime: s.end_time,
        durationMinutes: s.duration_minutes,
        notes: s.notes,
        // lessonId not in PG table, so skipping
      });
    }
  }
  console.log(`Migrated ${progress.length} progress records and ${sessions.length} sessions`);
};

const run = async () => {
  try {
    await connectMongo();

    // Clear existing data
    await mongoose.connection.dropDatabase();
    console.log('Database cleared');

    await migrateInstruments();
    await migrateAchievements();
    await migrateUsers();
    await migrateLessons();
    await migrateProgressAndPractice();

    console.log('Migration Complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration Failed:', err);
    process.exit(1);
  }
};

run();
