#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Ensure .env is loaded the same way as the main server
require('../src/config/config');
const connectDB = require('../src/config/mongo');

const Instrument = require('../src/models/Instrument');
const Lesson = require('../src/models/Lesson');
const LearningPath = require('../src/models/LearningPath');

function loadJsonDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.warn(`[sync-content] Directory not found, skipping: ${dirPath}`);
    return [];
  }

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));
  const results = [];

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const parsed = JSON.parse(raw);
      results.push(parsed);
    } catch (err) {
      console.error(`[sync-content] Failed to parse ${fullPath}:`, err.message);
    }
  }

  return results;
}

async function syncLessons(lessonDefs) {
  if (!lessonDefs.length) {
    console.log('[sync-content] No lesson JSON files found.');
    return;
  }

  console.log(`[sync-content] Syncing ${lessonDefs.length} lesson(s)...`);

  for (const def of lessonDefs) {
    const { slug, template, meta = {}, content = {}, orderIndex } = def;

    if (!slug) {
      console.warn('[sync-content] Lesson definition missing slug, skipping:', def);
      continue;
    }

    const update = {
      slug,
      template: template || meta.template || null,
      content,
    };

    // Set orderIndex if provided
    if (typeof orderIndex !== 'undefined') {
      update.orderIndex = orderIndex;
    }

    if (meta.title) update.title = meta.title;
    if (meta.subtitle) update.subtitle = meta.subtitle;
    if (meta.description) update.description = meta.description;
    if (meta.category) update.category = meta.category;
    if (typeof meta.difficulty !== 'undefined') update.difficulty = meta.difficulty;

    const est = meta.estimatedTimeMinutes ?? meta.estimated_time_minutes;
    if (typeof est !== 'undefined') update.estimatedTimeMinutes = est;

    if (typeof meta.xpReward !== 'undefined') update.xpReward = meta.xpReward;
    if (meta.audience) update.audience = meta.audience;
    if (Array.isArray(meta.tags)) update.tags = meta.tags;

    // Media fields - explicitly set to null if not present to clear old values
    update.imageUrl = meta.imageUrl || null;
    update.videoUrl = meta.videoUrl || null;
    update.audioUrl = meta.audioUrl || null;

    // Clear legacy steps field since we're using template-based content now
    update.steps = [];

    // Optional instrument resolution via instrumentSlug in root or meta
    const instrumentSlug = def.instrumentSlug || meta.instrumentSlug;
    if (instrumentSlug) {
      const instrument = await Instrument.findOne({ name: instrumentSlug });
      if (!instrument) {
        console.warn(
          `[sync-content] No instrument found with name="${instrumentSlug}" for lesson ${slug}`
        );
      } else {
        update.instrumentId = instrument._id;
      }
    }

    await Lesson.findOneAndUpdate({ slug }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    console.log(`[sync-content] Upserted lesson ${slug}`);
  }
}

async function syncPaths(pathDefs) {
  if (!pathDefs.length) {
    console.log('[sync-content] No learning path JSON files found.');
    return;
  }

  console.log(`[sync-content] Syncing ${pathDefs.length} learning path(s)...`);

  // Preload instruments to avoid repeated queries
  const instruments = await Instrument.find({});
  const instrumentByName = new Map();
  instruments.forEach((inst) => {
    if (inst.name) {
      instrumentByName.set(inst.name, inst);
    }
  });

  for (const def of pathDefs) {
    const {
      slug,
      instrumentSlug,
      level,
      audience,
      trackType,
      isDefault,
      template,
      title,
      subtitle,
      content = {},
    } = def;

    if (!slug) {
      console.warn('[sync-content] Path definition missing slug, skipping:', def);
      continue;
    }

    if (!instrumentSlug) {
      console.warn(`[sync-content] Path ${slug} missing instrumentSlug, skipping.`);
      continue;
    }

    const instrument = instrumentByName.get(instrumentSlug);
    if (!instrument) {
      console.warn(
        `[sync-content] No instrument found with name="${instrumentSlug}" for path ${slug}`
      );
      continue;
    }

    const update = {
      slug,
      instrumentId: instrument._id,
      level,
      audience: audience || 'both',
      trackType: trackType || 'core',
      isDefault: !!isDefault,
      template: template || 'linear_units_v1',
      title,
      subtitle,
      content,
    };

    await LearningPath.findOneAndUpdate({ slug }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    console.log(`[sync-content] Upserted learning path ${slug}`);
  }
}

// Optional helper: derive Lesson.unit from learning path units so the
// frontend can group lessons without needing a dedicated paths API yet.
//
// For each path definition, we walk its content.units[] and assign the
// unit.title to the corresponding Lesson.unit field for all referenced
// lessonSlug entries. This is safe and idempotent to run on every sync.
async function syncLessonUnitsFromPaths(pathDefs) {
  if (!pathDefs.length) {
    return;
  }

  console.log('[sync-content] Updating lesson units from learning paths...');

  // Preload instruments so we can resolve instrumentSlug -> instrumentId
  const instruments = await Instrument.find({});
  const instrumentByName = new Map();
  instruments.forEach((inst) => {
    if (inst.name) {
      instrumentByName.set(inst.name, inst);
    }
  });

  for (const def of pathDefs) {
    const instrument = instrumentByName.get(def.instrumentSlug);
    if (!instrument) {
      console.warn(
        `[sync-content] Cannot assign units: no instrument with name="${def.instrumentSlug}" for path ${def.slug}`
      );
      continue;
    }

    const units = def.content && Array.isArray(def.content.units) ? def.content.units : [];
    for (const unitDef of units) {
      const unitTitle = unitDef.title || unitDef.id || 'Other';
      const lessons = Array.isArray(unitDef.lessons) ? unitDef.lessons : [];

      for (const lessonRef of lessons) {
        const lessonSlug = lessonRef.lessonSlug;
        if (!lessonSlug) continue;

        const updated = await Lesson.findOneAndUpdate(
          { slug: lessonSlug, instrumentId: instrument._id },
          { unit: unitTitle },
          { new: true }
        );

        if (!updated) {
          console.warn(
            `[sync-content] Could not find lesson with slug="${lessonSlug}" for unit "${unitTitle}" (path ${def.slug})`
          );
        }
      }
    }
  }
}

async function main() {
  try {
    await connectDB();

    const lessonsDir = path.join(__dirname, '..', 'content', 'lessons');
    const pathsDir = path.join(__dirname, '..', 'content', 'paths');

    const lessonDefs = loadJsonDir(lessonsDir);
    const pathDefs = loadJsonDir(pathsDir);

    await syncLessons(lessonDefs);
    await syncPaths(pathDefs);
    await syncLessonUnitsFromPaths(pathDefs);

    console.log('[sync-content] Done.');
  } catch (err) {
    console.error('[sync-content] Fatal error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

main();
