#!/usr/bin/env node
/**
 * Switch default provider from Cerebras/Llama to 1min.ai/Claude
 * 
 * Llama 3.3 70B keeps inventing random function call formats.
 * Claude 3.7 Sonnet is explicitly designed for tool calling.
 */

import mongoose from 'mongoose';
import { getAIGeekConnection } from '../packages/api/src/config/database.js';

const MONGODB_URI = 'mongodb://localhost:27017';

async function switchToClaude() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(`${MONGODB_URI}/aiGeek`, {
      authSource: 'admin'
    });
    console.log('✅ Connected to aiGeek database\n');

    const AIConfig = mongoose.model('AIConfig', new mongoose.Schema({}, { strict: false, collection: 'aiconfigs' }));

    // Find onemin/Claude config
    const claudeConfig = await AIConfig.findOne({ provider: 'onemin' });
    
    if (!claudeConfig) {
      console.log('❌ onemin provider not found in database');
      console.log('Creating it...\n');
      
      await AIConfig.create({
        provider: 'onemin',
        apiKey: '', // You'll need to add this manually
        model: 'claude-3-7-sonnet',
        maxTokens: 8000,
        temperature: 0.7,
        enabled: true, // Enable it
        baseURL: 'https://api.1min.ai/api',
        costPer1kTokens: 0.003,
        maxContextTokens: 200000
      });
      
      console.log('✅ Created onemin/Claude config');
    } else {
      // Update to ensure it's enabled with correct model
      await AIConfig.updateOne(
        { provider: 'onemin' },
        {
          $set: {
            model: 'claude-3-7-sonnet',
            enabled: true
          }
        }
      );
      console.log('✅ Updated onemin config:');
      console.log(`   Model: claude-3-7-sonnet`);
      console.log(`   Enabled: true\n`);
    }

    // Also update fallback order in a config document if it exists
    const SystemConfig = mongoose.model('SystemConfig', new mongoose.Schema({}, { strict: false, collection: 'systemconfigs' }));
    
    const sysConfig = await SystemConfig.findOne({});
    if (sysConfig) {
      await SystemConfig.updateOne(
        {},
        {
          $set: {
            defaultProvider: 'onemin',
            fallbackOrder: ['onemin', 'gemini', 'cerebras', 'groq', 'together', 'cloudflare', 'openrouter', 'llmgateway', 'llm7', 'ollama', 'cohere']
          }
        }
      );
      console.log('✅ Updated system config default provider to onemin\n');
    }

    console.log('📊 Current AI Provider Configurations:\n');
    const allConfigs = await AIConfig.find({}).select('provider model enabled');
    allConfigs.forEach(config => {
      const status = config.enabled ? '✅ ENABLED' : '⏸️  DISABLED';
      console.log(`   ${status} - ${config.provider}: ${config.model || 'N/A'}`);
    });

    console.log('\n✅ Switch complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Restart baseGeek: docker-compose restart basegeek');
    console.log('   2. Verify logs show: [onemin] or [1min.ai] or [Claude]');
    console.log('   3. Test with CodeGeek\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

switchToClaude().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


