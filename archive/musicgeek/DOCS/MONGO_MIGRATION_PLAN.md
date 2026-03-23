# MongoDB Migration Plan

## 1. Overview

This document outlines the strategy to migrate the GuitarGeek backend from PostgreSQL to MongoDB. The goal is to leverage MongoDB's document model to store rich, hierarchical data (especially Lessons and Steps) and simplify the development workflow by removing the need for complex SQL migrations.

## 2. Prerequisites

- [ ] **MongoDB Instance**: Ensure a MongoDB instance is available (local or Atlas).
- [ ] **Tools**: `pg` (PostgreSQL client) and `mongoose` (MongoDB ODM) installed in the backend.

## 3. Schema Design

### 3.1. Users Collection (`users`)

Consolidates `users`, `user_instruments`, and `user_daily_streaks` tables.

```javascript
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String },
    name: { type: String },
    bio: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },

    // Gamification & Stats
    gamification: {
      totalXp: { type: Number, default: 0 },
      level: { type: Number, default: 1 },
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      lastPracticeDate: { type: Date },
    },

    // Instrument Progress (Embedded)
    instruments: [
      {
        instrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument' },
        isActive: { type: Boolean, default: false },
        skillLevel: { type: String, default: 'beginner' },
        totalPracticeTime: { type: Number, default: 0 },
        lessonsCompleted: { type: Number, default: 0 },
        startedAt: { type: Date, default: Date.now },
      },
    ],

    // Settings
    activeInstrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument' },
    preferences: { type: Map, of: String }, // JSONB equivalent

    // Achievements (Embedded for fast access)
    achievements: [
      {
        achievementId: { type: Schema.Types.ObjectId, ref: 'Achievement' },
        earnedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);
```

### 3.2. Instruments Collection (`instruments`)

Consolidates `instruments` and `tuning_configurations`.

```javascript
const InstrumentSchema = new Schema({
  name: { type: String, required: true, unique: true }, // e.g., 'guitar'
  displayName: { type: String, required: true },
  description: String,
  icon: String,
  colorTheme: String,

  features: {
    tunerEnabled: { type: Boolean, default: false },
    hasFretboard: { type: Boolean, default: false },
  },

  // Embedded Tunings
  tunings: [
    {
      name: String,
      isDefault: Boolean,
      description: String,
      strings: [
        {
          // JSONB content from PG
          note: String,
          octave: Number,
          frequency: Number,
          string: Number,
        },
      ],
    },
  ],
});
```

### 3.3. Lessons Collection (`lessons`)

Consolidates `lessons` and `lesson_steps`. This is the biggest win.

```javascript
const LessonSchema = new Schema(
  {
    title: { type: String, required: true },
    description: String,
    category: { type: String, required: true },
    difficulty: { type: Number, min: 1, max: 5 },
    estimatedTimeMinutes: Number,
    orderIndex: Number,

    instrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument' },

    // Content
    contentPath: String, // Legacy support if needed
    videoUrl: String,
    tags: [String],
    prerequisites: [{ type: Schema.Types.ObjectId, ref: 'Lesson' }],

    // Embedded Steps
    steps: [
      {
        stepNumber: Number,
        instruction: String,
        visualAssetUrl: String,
        codeExample: String,

        // Rich Content Fields
        type: { type: String, default: 'basic' }, // 'interactive', 'video', etc.
        media: {
          type: { type: String }, // 'image', 'video', 'audio'
          url: String,
        },
        interactiveContent: Schema.Types.Mixed, // JSONB
        config: Schema.Types.Mixed, // JSONB
      },
    ],
  },
  { timestamps: true }
);
```

### 3.4. User Progress Collection (`user_progress`)

Kept separate from Users to avoid unbounded document growth, but linked.

```javascript
const UserProgressSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },

  status: {
    isCompleted: { type: Boolean, default: false },
    completedAt: Date,
    startedAt: { type: Date, default: Date.now },
    currentStep: { type: Number, default: 1 },
  },

  stats: {
    score: { type: Number, default: 0 },
    xpGained: { type: Number, default: 0 },
  },

  // Exercise History (formerly user_exercise_progress)
  exercises: [
    {
      type: String,
      metricName: String,
      metricValue: Number,
      notes: String,
      recordedAt: { type: Date, default: Date.now },
    },
  ],
});

// Compound index for unique progress per user/lesson
UserProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
```

### 3.5. Practice Sessions (`practice_sessions`)

Direct mapping.

```javascript
const PracticeSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMinutes: Number,
    notes: String,
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson' }, // Optional link
  },
  { timestamps: true }
);
```

### 3.6. Achievements (`achievements`)

Static definitions.

```javascript
const AchievementSchema = new Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  criteria: String,
  xpReward: Number,
});
```

## 4. Migration Strategy

### Phase 1: Preparation

1.  **Install Dependencies**: `npm install mongoose`
2.  **Create Models**: Create `src/models/*.js` files with the schemas above.
3.  **Database Connection**: Create `src/config/mongo.js` to handle the connection.

### Phase 2: Data Migration Script (`scripts/migrate-pg-to-mongo.js`)

We will write a script that connects to BOTH databases and moves data.

**Logic:**

1.  **Clear Mongo**: `await mongoose.connection.dropDatabase();`
2.  **Migrate Instruments**:
    - Select all from PG `instruments`.
    - For each, select all from PG `tuning_configurations`.
    - Construct Mongo document and save.
    - _Map PG UUIDs to Mongo ObjectIds in a memory map for FK resolution._
3.  **Migrate Users**:
    - Select all from PG `users`.
    - Fetch `user_daily_streaks`, `user_instruments`, `user_achievements` for each user.
    - Construct User document.
    - _Map PG UUIDs to Mongo ObjectIds._
4.  **Migrate Achievements**:
    - Direct copy.
5.  **Migrate Lessons**:
    - Select all from PG `lessons`.
    - Fetch all `lesson_steps` for each lesson.
    - Construct Lesson document with embedded steps.
    - _Map PG UUIDs to Mongo ObjectIds._
6.  **Migrate Progress & Practice**:
    - Iterate PG `user_progress` and `practice_sessions`.
    - Resolve User and Lesson IDs using the maps.
    - Save to Mongo.

### Phase 3: Codebase Updates

1.  **Service Layer**: Rewrite `lessonService.js`, `userService.js`, etc., to use Mongoose models instead of `pool.query`.
    - _Example_: `pool.query('SELECT * FROM users WHERE id = $1')` -> `User.findById(id)`
2.  **Remove SQL**: Delete `migrations/` folder, `setup-database.sh`, and `pg` dependency.

## 5. Verification Plan

1.  **Count Check**: Ensure record counts match between PG tables and Mongo collections.
2.  **Data Integrity**: Spot check specific complex records (e.g., a User with streaks and instruments, a Lesson with steps).
3.  **API Test**: Run the frontend against the new backend. Verify:
    - Login works.
    - Lessons load with steps.
    - Progress updates correctly.

## 6. Rollback Plan

If migration fails:

1.  Revert code changes (git stash/checkout).
2.  Point `DATABASE_URL` back to PostgreSQL.
3.  No data is deleted from PG during migration, so it remains the source of truth until switchover is confirmed.
