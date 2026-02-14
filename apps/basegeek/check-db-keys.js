#!/usr/bin/env node

import mongoose from 'mongoose';
import AIConfig from './packages/api/src/models/AIConfig.js';

const MONGODB_URI = 'mongodb://192.168.1.17:27018/aiGeek';

async function checkKeys() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const configs = await AIConfig.find({});
    console.log(`Found ${configs.length} provider configurations:\n`);

    for (const config of configs) {
      const maskedKey = config.apiKey
        ? `${config.apiKey.substring(0, 8)}...${config.apiKey.substring(config.apiKey.length - 4)}`
        : 'NOT SET';

      console.log(`${config.provider}:`);
      console.log(`  API Key: ${maskedKey}`);
      console.log(`  Key Length: ${config.apiKey ? config.apiKey.length : 0}`);
      console.log(`  Has Whitespace: ${config.apiKey ? (config.apiKey !== config.apiKey.trim() ? 'YES ⚠️' : 'NO') : 'N/A'}`);
      console.log(`  Enabled: ${config.enabled}`);
      console.log('');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkKeys();
