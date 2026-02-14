#!/usr/bin/env node

import mongoose from 'mongoose';
import AIConfig from './packages/api/src/models/AIConfig.js';

const MONGODB_URI = 'mongodb://192.168.1.17:27018/aiGeek';

async function updateModels() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // Update Cerebras model
    console.log('Updating Cerebras model...');
    const cerebrasResult = await AIConfig.findOneAndUpdate(
      { provider: 'cerebras' },
      {
        $set: {
          model: 'qwen-3-235b-a22b-instruct-2507'
        }
      },
      { new: true }
    );

    if (cerebrasResult) {
      console.log('✅ Cerebras updated:');
      console.log(`   Model: ${cerebrasResult.model}`);
    } else {
      console.log('⚠️  Cerebras config not found in database');
    }

    // Update OpenRouter model to a different free model
    console.log('\nUpdating OpenRouter model...');
    const openrouterResult = await AIConfig.findOneAndUpdate(
      { provider: 'openrouter' },
      {
        $set: {
          model: 'google/gemini-2.0-flash-exp:free'
        }
      },
      { new: true }
    );

    if (openrouterResult) {
      console.log('✅ OpenRouter updated:');
      console.log(`   Model: ${openrouterResult.model}`);
    } else {
      console.log('⚠️  OpenRouter config not found in database');
    }

    console.log('\n✅ Done! Restart your API server to apply changes.');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateModels();
