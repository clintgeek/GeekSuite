#!/usr/bin/env node
/**
 * Content Sync Script
 *
 * Reads JSON lesson and path files from backend/content and upserts them to MongoDB.
 * Also generates TTS audio for all vocabulary and phrases.
 *
 * Usage: npm run content:sync
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from project root
dotenv.config({ path: path.join(__dirname, "../../.env") });

// Import models
import Lesson from "../src/models/Lesson.js";
import LearningPath from "../src/models/LearningPath.js";
import Language from "../src/models/Language.js";

// Import TTS service
import { generateAudio, extractAudioTexts } from "../src/services/tts/ttsService.js";

const CONTENT_DIR = path.join(__dirname, "../content");
const LESSONS_DIR = path.join(CONTENT_DIR, "lessons");
const PATHS_DIR = path.join(CONTENT_DIR, "paths");
const AUDIO_DIR = path.join(__dirname, "../public/audio");

const log = {
  info: (msg) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  warning: (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`),
  error: (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`),
  audio: (msg) => console.log(`\x1b[35m🔊 ${msg}\x1b[0m`)
};

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/babelgeek";
  log.info(`Connecting to MongoDB: ${uri}`);
  await mongoose.connect(uri);
  log.success("Connected to MongoDB");
}

function readJsonFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    log.warning(`Directory does not exist: ${dir}`);
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories (e.g., lessons/spanish/)
      files.push(...readJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const data = JSON.parse(content);
        files.push({ path: fullPath, data });
      } catch (err) {
        log.error(`Failed to parse ${fullPath}: ${err.message}`);
      }
    }
  }

  return files;
}

async function syncLessons() {
  log.info("Syncing lessons...");
  const lessonFiles = readJsonFiles(LESSONS_DIR);

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const { path: filePath, data } of lessonFiles) {
    try {
      const result = await Lesson.findOneAndUpdate(
        { slug: data.slug },
        data,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
        log.success(`Created: ${data.slug}`);
      } else {
        updated++;
        log.info(`Updated: ${data.slug}`);
      }
    } catch (err) {
      failed++;
      log.error(`Failed to sync ${data.slug}: ${err.message}`);
    }
  }

  log.info(`Lessons sync complete: ${created} created, ${updated} updated, ${failed} failed`);
  return { created, updated, failed };
}

async function syncPaths() {
  log.info("Syncing learning paths...");
  const pathFiles = readJsonFiles(PATHS_DIR);

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const { path: filePath, data } of pathFiles) {
    try {
      const result = await LearningPath.findOneAndUpdate(
        { slug: data.slug },
        data,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
        log.success(`Created: ${data.slug}`);
      } else {
        updated++;
        log.info(`Updated: ${data.slug}`);
      }
    } catch (err) {
      failed++;
      log.error(`Failed to sync ${data.slug}: ${err.message}`);
    }
  }

  log.info(`Paths sync complete: ${created} created, ${updated} updated, ${failed} failed`);
  return { created, updated, failed };
}

async function seedLanguages() {
  log.info("Seeding languages...");

  const languages = [
    {
      code: "es",
      name: "Spanish",
      nativeName: "Español",
      flag: "🇪🇸",
      isActive: true,
      availableLevels: ["A1", "A2"],
      orderIndex: 1
    },
    {
      code: "fr",
      name: "French",
      nativeName: "Français",
      flag: "🇫🇷",
      isActive: true,
      availableLevels: ["A1"],
      orderIndex: 2
    },
    {
      code: "de",
      name: "German",
      nativeName: "Deutsch",
      flag: "🇩🇪",
      isActive: false,
      availableLevels: [],
      orderIndex: 3
    },
    {
      code: "it",
      name: "Italian",
      nativeName: "Italiano",
      flag: "🇮🇹",
      isActive: false,
      availableLevels: [],
      orderIndex: 4
    },
    {
      code: "pt",
      name: "Portuguese",
      nativeName: "Português",
      flag: "🇧🇷",
      isActive: false,
      availableLevels: [],
      orderIndex: 5
    }
  ];

  for (const lang of languages) {
    await Language.findOneAndUpdate(
      { code: lang.code },
      lang,
      { upsert: true }
    );
    log.success(`Language: ${lang.flag} ${lang.name}`);
  }

  log.info(`Seeded ${languages.length} languages`);
}

async function generateLessonAudio() {
  log.info("Generating TTS audio for lessons...");

  const lessonFiles = readJsonFiles(LESSONS_DIR);

  let generated = 0;
  let cached = 0;
  let failed = 0;

  for (const { data: lesson } of lessonFiles) {
    const languageCode = lesson.languageCode;
    const audioDir = path.join(AUDIO_DIR, languageCode);

    // Ensure audio directory exists
    fs.mkdirSync(audioDir, { recursive: true });

    // Extract all texts that need audio
    const texts = extractAudioTexts(lesson);

    log.info(`Processing ${lesson.slug}: ${texts.length} audio files needed`);

    for (const { text, type } of texts) {
      try {
        const result = await generateAudio(text, languageCode, audioDir);

        if (result.cached) {
          cached++;
        } else {
          generated++;
          log.audio(`Generated (${result.provider}): "${text.slice(0, 30)}..." → ${result.filename}`);
        }

        // Small delay to avoid rate limiting
        if (!result.cached) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        failed++;
        log.error(`Failed to generate audio for "${text.slice(0, 30)}...": ${err.message}`);
      }
    }
  }

  log.info(`Audio generation complete: ${generated} generated, ${cached} cached, ${failed} failed`);
  return { generated, cached, failed };
}

async function main() {
  console.log("\n🌍 BabelGeek Content Sync\n");
  console.log("=".repeat(40));

  try {
    await connectDB();

    await seedLanguages();
    console.log();

    const lessonStats = await syncLessons();
    console.log();

    const pathStats = await syncPaths();
    console.log();

    // Generate TTS audio
    console.log("=".repeat(40));
    const audioStats = await generateLessonAudio();
    console.log();

    console.log("=".repeat(40));
    log.success("Content sync completed!");
    console.log(`
Summary:
  Languages: seeded
  Lessons: ${lessonStats.created + lessonStats.updated} synced (${lessonStats.failed} failed)
  Paths: ${pathStats.created + pathStats.updated} synced (${pathStats.failed} failed)
  Audio: ${audioStats.generated} generated, ${audioStats.cached} cached (${audioStats.failed} failed)
`);

  } catch (err) {
    log.error(`Sync failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    log.info("Disconnected from MongoDB");
  }
}

main();
