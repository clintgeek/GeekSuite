// Debug script to check AI configurations in the database
import mongoose from 'mongoose';
import AIConfig from './src/models/AIConfig.js';

async function debugAIConfig() {
  try {
    // Connect to aiGeek database
    const AIGEEK_MONGODB_URI = process.env.AIGEEK_MONGODB_URI || 'mongodb://localhost:27017/aiGeek?authSource=admin';
    await mongoose.connect(AIGEEK_MONGODB_URI);
    console.log('Connected to MongoDB (aiGeek database)');

    // Check what's in the AIConfig collection
    const configs = await AIConfig.find({});
    console.log('\n📊 AI Configurations in Database:');
    console.log('=====================================');

    if (configs.length === 0) {
      console.log('❌ No AI configurations found in database');
      console.log('\n💡 You need to:');
      console.log('1. Go to baseGeek UI');
      console.log('2. Navigate to AI Geek → Configuration');
      console.log('3. Add your API keys for each provider');
    } else {
      configs.forEach(config => {
        console.log(`\n🔑 ${config.provider.toUpperCase()}:`);
        console.log(`   API Key: ${config.apiKey ? '✅ Set' : '❌ Not set'}`);
        console.log(`   Enabled: ${config.enabled ? '✅ Yes' : '❌ No'}`);
        console.log(`   Model: ${config.model || 'Default'}`);
      });
    }

    // Check if the AI service can load these configs
    console.log('\n🔧 Testing AI Service Configuration Loading...');

    // Import and test the AI service
    const aiService = (await import('./src/services/aiService.js')).default;

    // Wait for initialization
    let attempts = 0;
    while (!aiService.initialized && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    console.log(`AI Service Initialized: ${aiService.initialized ? '✅ Yes' : '❌ No'}`);

    if (aiService.initialized) {
      console.log('\n📋 Loaded Provider Configurations:');
      Object.entries(aiService.providers).forEach(([provider, config]) => {
        console.log(`\n${provider.toUpperCase()}:`);
        console.log(`   API Key: ${config.apiKey ? '✅ Set' : '❌ Not set'}`);
        console.log(`   Enabled: ${config.enabled ? '✅ Yes' : '❌ No'}`);
        console.log(`   Model: ${config.model}`);
      });
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

debugAIConfig();
