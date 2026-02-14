/**
 * Migration script: Load lesson content from markdown files into MongoDB
 * This eliminates the need to read files on every request
 */
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: '../.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://192.168.1.17:27018/musicGeek';
const CONTENT_ROOT = path.join(__dirname, 'content', 'lessons');

function parseMetaFromMarkdown(markdown) {
  const marker = ':::meta';
  const start = markdown.indexOf(marker);
  if (start === -1) return null;

  const afterMarkerIndex = markdown.indexOf('\n', start + marker.length);
  const from = afterMarkerIndex === -1 ? start + marker.length : afterMarkerIndex + 1;
  const rest = markdown.slice(from);

  const endMarkerIndex = rest.indexOf(':::');
  if (endMarkerIndex === -1) return null;

  const jsonText = rest.slice(0, endMarkerIndex).trim();
  if (!jsonText) return null;

  return JSON.parse(jsonText);
}

async function migrateLessons() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const lessonsCollection = db.collection('lessons');

    // Get all lessons that have a contentPath
    const lessons = await lessonsCollection
      .find({ contentPath: { $exists: true, $ne: null } })
      .toArray();
    console.log(`Found ${lessons.length} lessons with contentPath`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const lesson of lessons) {
      try {
        // Check if steps already exist
        if (lesson.steps && lesson.steps.length > 0) {
          console.log(`⏭️  Skipping ${lesson.title} - already has ${lesson.steps.length} steps`);
          skippedCount++;
          continue;
        }

        // Build file path
        const contentPath = lesson.contentPath.replace(/^\/+/, '');
        const filePath = path.join(CONTENT_ROOT, contentPath.replace('lessons/', ''));

        // Check if file exists
        try {
          await fs.access(filePath);
        } catch (err) {
          console.log(`❌ File not found for ${lesson.title}: ${filePath}`);
          errorCount++;
          continue;
        }

        // Read and parse markdown
        const markdown = await fs.readFile(filePath, 'utf8');
        const meta = parseMetaFromMarkdown(markdown);

        if (!meta || !meta.steps || meta.steps.length === 0) {
          console.log(`⚠️  No steps found in ${lesson.title}`);
          errorCount++;
          continue;
        }

        // Convert steps from markdown format to MongoDB schema format
        const dbSteps = meta.steps.map((step) => ({
          stepNumber: step.step_number,
          instruction: step.instruction,
          visualAssetUrl: step.visual_asset_url || null,
          codeExample: step.code_example || null,
          type: step.step_type || 'text',
          media: step.media || null,
          interactiveContent: step.interactive_content || null,
          config: step.step_config || null,
        }));

        // Update lesson with steps
        await lessonsCollection.updateOne({ _id: lesson._id }, { $set: { steps: dbSteps } });

        console.log(`✅ Migrated ${lesson.title}: ${dbSteps.length} steps`);
        migratedCount++;
      } catch (error) {
        console.error(`❌ Error processing ${lesson.title}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📝 Total: ${lessons.length}`);

    await mongoose.disconnect();
    console.log('\n✨ Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateLessons();
