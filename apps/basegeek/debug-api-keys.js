#!/usr/bin/env node

/**
 * Debug script to check API key configuration
 * This will help diagnose why keys are showing as invalid
 */

import mongoose from 'mongoose';
import APIKey from './packages/api/src/models/APIKey.js';
import AIConfig from './packages/api/src/models/AIConfig.js';

const AIGEEK_MONGODB_URI = process.env.AIGEEK_MONGODB_URI || 'mongodb://localhost:27017/aiGeek?authSource=admin';

async function debugApiKeys() {
  try {
    console.log('🔍 Connecting to database...');
    const conn = await mongoose.createConnection(AIGEEK_MONGODB_URI).asPromise();
    console.log('✅ Connected to aiGeek database\n');

    // Check baseGeek API Keys (bg_xxx keys for codeGeek)
    console.log('=' .repeat(60));
    console.log('📋 BaseGeek API Keys (for codeGeek authentication)');
    console.log('='.repeat(60));

    const APIKeyModel = conn.model('APIKey', APIKey.schema);
    const apiKeys = await APIKeyModel.find({}).sort({ createdAt: -1 });

    if (apiKeys.length === 0) {
      console.log('❌ No API keys found in database!');
      console.log('   You need to create API keys through the BaseGeek UI');
    } else {
      console.log(`Found ${apiKeys.length} API key(s):\n`);

      for (const key of apiKeys) {
        const keyDisplay = key.keyPrefix + '...' + (key.keyHash ? key.keyHash.substring(0, 8) : 'NO_HASH');
        console.log(`📝 Name: ${key.name}`);
        console.log(`   App: ${key.appName}`);
        console.log(`   Key: ${keyDisplay}`);
        console.log(`   Active: ${key.isActive ? '✅' : '❌'}`);
        console.log(`   Expired: ${key.isExpired() ? '❌ YES' : '✅ NO'}`);
        console.log(`   Created: ${key.createdAt}`);
        console.log(`   Permissions: ${key.permissions.join(', ')}`);
        console.log(`   Rate Limits: ${key.rateLimit.requestsPerMinute}/min, ${key.rateLimit.requestsPerHour}/hr, ${key.rateLimit.requestsPerDay}/day`);
        console.log(`   Usage: ${key.usage.totalRequests} requests total, last used: ${key.usage.lastUsed || 'never'}`);

        // Check key format
        const hasValidPrefix = key.keyPrefix.startsWith('bg_');
        const prefixLength = key.keyPrefix.length;
        console.log(`   Key Prefix Valid: ${hasValidPrefix ? '✅' : '❌'} (${prefixLength} chars, should be 11: bg_ + 8 chars)`);
        console.log('');
      }
    }

    // Check Provider API Keys (Anthropic, Groq, etc.)
    console.log('=' .repeat(60));
    console.log('🤖 Provider API Keys (Anthropic, Groq, Gemini, Together)');
    console.log('='.repeat(60));

    const AIConfigModel = conn.model('AIConfig', AIConfig.schema);
    const configs = await AIConfigModel.find({});

    if (configs.length === 0) {
      console.log('❌ No provider configurations found!');
    } else {
      console.log(`Found ${configs.length} provider configuration(s):\n`);

      for (const config of configs) {
        const keyDisplay = config.apiKey
          ? config.apiKey.substring(0, 15) + '...' + config.apiKey.substring(config.apiKey.length - 8)
          : '❌ NOT SET';

        console.log(`🔧 Provider: ${config.provider}`);
        console.log(`   Enabled: ${config.enabled ? '✅' : '❌'}`);
        console.log(`   Model: ${config.model}`);
        console.log(`   API Key: ${keyDisplay}`);
        console.log(`   Key Length: ${config.apiKey ? config.apiKey.length + ' chars' : 'N/A'}`);

        // Check key format based on provider
        if (config.apiKey) {
          let validFormat = false;
          let expectedFormat = '';

          switch(config.provider) {
            case 'anthropic':
              validFormat = config.apiKey.startsWith('sk-ant-');
              expectedFormat = 'sk-ant-...';
              break;
            case 'groq':
              validFormat = config.apiKey.startsWith('gsk_');
              expectedFormat = 'gsk_...';
              break;
            case 'gemini':
              validFormat = config.apiKey.startsWith('AIza');
              expectedFormat = 'AIza...';
              break;
            case 'together':
              validFormat = config.apiKey.startsWith('tgp_v1_') || config.apiKey.startsWith('sk-');
              expectedFormat = 'tgp_v1_... or sk-...';
              break;
            case 'mistral':
              validFormat = config.apiKey.length > 20; // Mistral keys don't have consistent prefix
              expectedFormat = 'Mistral API key';
              break;
            case 'cohere':
              validFormat = config.apiKey.length > 30; // Cohere keys are long
              expectedFormat = 'Cohere API key';
              break;
            case 'openrouter':
              validFormat = config.apiKey.startsWith('sk-or-');
              expectedFormat = 'sk-or-...';
              break;
            case 'cerebras':
              validFormat = config.apiKey.length > 20; // Cerebras keys
              expectedFormat = 'Cerebras API key';
              break;
          }

          console.log(`   Format Valid: ${validFormat ? '✅' : '⚠️'} (expected: ${expectedFormat})`);
        }
        console.log('');
      }
    }

    console.log('=' .repeat(60));
    console.log('✅ Diagnostic complete\n');

    await conn.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

debugApiKeys();
