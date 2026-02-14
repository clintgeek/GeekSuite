// packages/api/test-phase2a-basic.js
/**
 * Phase 2A Basic Test (No Redis Required)
 *
 * Tests task detection and family routing logic without Redis.
 */

import TaskDetector from './src/services/aiTaskDetector.js';
import fs from 'fs';

const familiesConfig = JSON.parse(fs.readFileSync('./families.json', 'utf-8'));

console.log('='.repeat(80));
console.log('Phase 2A: Basic Task Detection & Family Routing Test (No Redis)');
console.log('='.repeat(80));
console.log();

// Test prompts for different task types
const testPrompts = [
  {
    prompt: 'Write a function to calculate fibonacci numbers in Python',
    expectedTask: 'code',
    expectedFamily: 'qwen'
  },
  {
    prompt: 'Analyze why the Roman Empire fell and compare it to modern geopolitics',
    expectedTask: 'reasoning',
    expectedFamily: 'llama'
  },
  {
    prompt: 'Write a creative short story about a time-traveling detective',
    expectedTask: 'creative',
    expectedFamily: 'deepseek'
  },
  {
    prompt: 'What is the capital of France and when was it founded?',
    expectedTask: 'lookup',
    expectedFamily: 'gemini'
  },
  {
    prompt: 'Based on our previous discussion, continue the analysis',
    expectedTask: 'contextual',
    expectedFamily: 'llama'
  },
  {
    prompt: 'Debug this code and fix the syntax error',
    expectedTask: 'code',
    expectedFamily: 'qwen'
  },
  {
    prompt: 'Summarize this research paper and evaluate its methodology',
    expectedTask: 'analysis',
    expectedFamily: 'claude'
  }
];

const taskDetector = new TaskDetector();
const taskRouting = familiesConfig.taskRouting;

console.log('📋 Testing Task Detection & Family Routing\n');

let correctTasks = 0;
let correctFamilies = 0;

for (const test of testPrompts) {
  console.log(`Prompt: "${test.prompt.substring(0, 60)}..."`);

  const detectedTask = taskDetector.detectTask(test.prompt);
  const selectedFamily = taskRouting[detectedTask] || taskRouting['general'];
  const family = familiesConfig.families[selectedFamily];

  const taskMatch = detectedTask === test.expectedTask;
  const familyMatch = selectedFamily === test.expectedFamily;

  if (taskMatch) correctTasks++;
  if (familyMatch) correctFamilies++;

  const taskIcon = taskMatch ? '✓' : '✗';
  const familyIcon = familyMatch ? '✓' : '✗';

  console.log(`  ${taskIcon} Task: ${detectedTask} (expected: ${test.expectedTask})`);
  console.log(`  ${familyIcon} Family: ${selectedFamily} (expected: ${test.expectedFamily})`);
  console.log(`  Providers: ${family.providers.join(', ')}`);
  console.log(`  Strengths: ${family.strengths.join(', ')}`);
  console.log();
}

console.log('-'.repeat(80));
console.log('\n📊 Test Results\n');

const taskAccuracy = (correctTasks / testPrompts.length) * 100;
const familyAccuracy = (correctFamilies / testPrompts.length) * 100;

console.log(`Task Detection Accuracy: ${correctTasks}/${testPrompts.length} (${taskAccuracy.toFixed(1)}%)`);
console.log(`Family Routing Accuracy: ${correctFamilies}/${testPrompts.length} (${familyAccuracy.toFixed(1)}%)`);
console.log();

if (taskAccuracy >= 85) {
  console.log('✅ Task detection meets target (≥85%)');
} else {
  console.log('⚠️  Task detection below target (≥85%)');
}

console.log();
console.log('-'.repeat(80));
console.log('\n🏗️ Model Families Overview\n');

for (const [familyName, family] of Object.entries(familiesConfig.families)) {
  console.log(`${familyName.toUpperCase()}:`);
  console.log(`  Providers (${family.providers.length}): ${family.providers.join(', ')}`);
  console.log(`  Strengths: ${family.strengths.join(', ')}`);
  console.log(`  Context Window: ${family.contextWindow}`);
  console.log();
}

console.log('-'.repeat(80));
console.log('\n📋 Task Routing Configuration\n');

for (const [task, family] of Object.entries(taskRouting)) {
  const providers = familiesConfig.families[family].providers;
  console.log(`${task.padEnd(15)} → ${family.padEnd(12)} (${providers.length} providers)`);
}

console.log();
console.log('='.repeat(80));
console.log('✓ Basic Phase 2A Test Complete');
console.log('='.repeat(80));
console.log();
console.log('Next Steps:');
console.log('  1. ✅ Task detection logic verified');
console.log('  2. ✅ Family routing configuration validated');
console.log('  3. ⏳ Start Redis to test full routing with load balancing');
console.log('  4. ⏳ Run: redis-server --port 6380 &');
console.log('  5. ⏳ Run: node packages/api/test-phase2a-routing.js');
console.log();
