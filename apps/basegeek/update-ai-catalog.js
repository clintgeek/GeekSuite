#!/usr/bin/env node

import mongoose from 'mongoose';
import AIModel from './packages/api/src/models/AIModel.js';

const MONGODB_URI = 'mongodb://192.168.1.17:27018/aiGeek';

async function updateCatalog() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // Delete old Cerebras models
    console.log('Removing old Cerebras models...');
    await AIModel.deleteMany({
      provider: 'cerebras',
      modelId: { $in: ['cerebras/Qwen3-Coder-480B', 'cerebras/Llama3.1-70B', 'cerebras/Llama3.1-8B'] }
    });

    // Add new Cerebras models
    console.log('Adding new Cerebras models...');
    const cerebrasModels = [
      { id: 'qwen-3-235b-a22b-instruct-2507', name: 'Qwen3 235B Instruct (Free)' },
      { id: 'llama3.1-8b', name: 'Llama 3.1 8B (Free)' },
      { id: 'llama3.1-70b', name: 'Llama 3.1 70B (Free)' }
    ];

    for (const model of cerebrasModels) {
      await AIModel.findOneAndUpdate(
        { provider: 'cerebras', modelId: model.id },
        {
          name: model.name,
          lastChecked: new Date(),
          isActive: true
        },
        { upsert: true, new: true }
      );
      console.log(`  ✅ ${model.id} - ${model.name}`);
    }

    // Update OpenRouter models
    console.log('\nUpdating OpenRouter models...');
    const openrouterModels = [
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)' },
      { id: 'meta-llama/llama-3.1-70b-instruct:free', name: 'Llama 3.1 70B (Free)' },
      { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)' },
      { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 Llama 405B (Free - may be limited)' },
      { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' }
    ];

    for (const model of openrouterModels) {
      await AIModel.findOneAndUpdate(
        { provider: 'openrouter', modelId: model.id },
        {
          name: model.name,
          lastChecked: new Date(),
          isActive: true
        },
        { upsert: true, new: true }
      );
      console.log(`  ✅ ${model.id} - ${model.name}`);
    }

    console.log('\n✅ AI catalog updated successfully!');
    console.log('Restart your API server to apply changes.');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateCatalog();
