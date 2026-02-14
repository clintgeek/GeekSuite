#!/usr/bin/env node

/**
 * Update Cerebras model from Qwen to Llama 3.3 70B
 * Run with: node scripts/update-cerebras-model.js
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

async function updateCerebrasModel() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(`${MONGODB_URI}/aiGeek`, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const aiConfigsCollection = db.collection('aiconfigs');

    // Find current Cerebras config
    const currentConfig = await aiConfigsCollection.findOne({ provider: 'cerebras' });
    
    if (!currentConfig) {
      console.log('❌ No Cerebras config found in database');
      console.log('   This means Cerebras may not be configured yet.');
      await mongoose.disconnect();
      return;
    }

    console.log('Current Cerebras config:');
    console.log(`  Model: ${currentConfig.model}`);
    console.log(`  Enabled: ${currentConfig.enabled}`);
    console.log(`  Max Tokens: ${currentConfig.maxTokens}`);
    console.log('');

    if (currentConfig.model === 'llama-3.3-70b') {
      console.log('✅ Cerebras is already using Llama 3.3 70B - no update needed!');
      await mongoose.disconnect();
      return;
    }

    // Update to Llama 3.3 70B
    console.log('Updating Cerebras model to Llama 3.3 70B...');
    const result = await aiConfigsCollection.updateOne(
      { provider: 'cerebras' },
      {
        $set: {
          model: 'llama-3.3-70b',
          updatedAt: new Date()
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log('✅ Successfully updated Cerebras model to llama-3.3-70b\n');
      
      // Verify the update
      const updatedConfig = await aiConfigsCollection.findOne({ provider: 'cerebras' });
      console.log('Updated Cerebras config:');
      console.log(`  Model: ${updatedConfig.model}`);
      console.log(`  Enabled: ${updatedConfig.enabled}`);
      console.log(`  Updated At: ${updatedConfig.updatedAt}`);
    } else {
      console.log('⚠️  No changes made (possibly already updated)');
    }

    await mongoose.disconnect();
    console.log('\n✅ Done! Restart baseGeek to use the new model.');
    
  } catch (error) {
    console.error('❌ Error updating Cerebras model:', error.message);
    console.error(error);
    process.exit(1);
  }
}

updateCerebrasModel();

