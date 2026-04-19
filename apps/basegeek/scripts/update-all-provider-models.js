#!/usr/bin/env node

/**
 * Update all provider models to optimized tool-use models
 * Run with: node scripts/update-all-provider-models.js
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

const PROVIDER_UPDATES = {
  'cerebras': {
    model: 'llama-3.3-70b',
    reason: 'Better tool-use than Qwen 3 235B'
  },
  'together': {
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    reason: 'Tool execution over reasoning (was DeepSeek R1)'
  },
  'openrouter': {
    model: 'meta-llama/llama-3.1-70b-instruct:free',
    reason: 'Better tool-use than Qwen 3 235B'
  },
  'cloudflare': {
    model: 'llama-3.3-70b-instruct-fp8-fast',
    reason: 'Proven capability over GPT OSS 120B'
  },
  'onemin': {
    model: 'claude-3-7-sonnet',
    reason: 'Premium fallback (was deepseek-reasoner)'
  }
};

async function updateAllProviderModels() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(`${MONGODB_URI}/aiGeek`, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const aiConfigsCollection = db.collection('aiconfigs');

    console.log('====================================');
    console.log('Provider Model Updates');
    console.log('====================================\n');

    let updatedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;

    for (const [provider, updates] of Object.entries(PROVIDER_UPDATES)) {
      const currentConfig = await aiConfigsCollection.findOne({ provider });

      if (!currentConfig) {
        console.log(`⚠️  ${provider.toUpperCase()}: Not found in database (not configured)`);
        notFoundCount++;
        continue;
      }

      console.log(`📝 ${provider.toUpperCase()}:`);
      console.log(`   Current model: ${currentConfig.model}`);
      console.log(`   Target model:  ${updates.model}`);
      console.log(`   Reason: ${updates.reason}`);

      if (currentConfig.model === updates.model) {
        console.log(`   ✅ Already up-to-date\n`);
        skippedCount++;
        continue;
      }

      const result = await aiConfigsCollection.updateOne(
        { provider },
        {
          $set: {
            model: updates.model,
            updatedAt: new Date()
          }
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`   ✅ Updated successfully\n`);
        updatedCount++;
      } else {
        console.log(`   ⚠️  Update failed\n`);
      }
    }

    console.log('====================================');
    console.log('Summary');
    console.log('====================================');
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⏭️  Skipped (already current): ${skippedCount}`);
    console.log(`⚠️  Not found: ${notFoundCount}`);
    console.log('');

    if (updatedCount > 0) {
      console.log('🔄 Restart baseGeek to apply changes:');
      console.log('   docker-compose restart basegeek');
    } else {
      console.log('No updates needed - all providers are current!');
    }

    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error updating provider models:', error.message);
    console.error(error);
    process.exit(1);
  }
}

updateAllProviderModels();

