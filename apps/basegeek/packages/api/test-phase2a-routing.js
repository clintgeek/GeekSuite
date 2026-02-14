// packages/api/test-phase2a-routing.js
/**
 * Phase 2A Routing Test
 *
 * Tests the model family routing system in dry-run mode.
 * Demonstrates task detection, family selection, and round-robin load balancing.
 */

import ModelFamilyRouter from './src/services/aiRouterService.js';
import LoadBalancer from './src/services/aiBalancerService.js';
import { getInstance as getHealthJobInstance } from './src/services/aiHealthJobService.js';

async function testPhase2ARouting() {
  console.log('='.repeat(80));
  console.log('Phase 2A: Model Family Routing Test (Dry-Run Mode)');
  console.log('='.repeat(80));
  console.log();

  const router = new ModelFamilyRouter();
  const loadBalancer = new LoadBalancer();

  // Test prompts for different task types
  const testPrompts = [
    {
      conversationId: 'test-001',
      prompt: 'Write a function to calculate fibonacci numbers in Python',
      expectedTask: 'code',
      expectedFamily: 'qwen'
    },
    {
      conversationId: 'test-002',
      prompt: 'Analyze why the Roman Empire fell and compare it to modern geopolitics',
      expectedTask: 'reasoning',
      expectedFamily: 'llama'
    },
    {
      conversationId: 'test-003',
      prompt: 'Write a creative short story about a time-traveling detective',
      expectedTask: 'creative',
      expectedFamily: 'deepseek'
    },
    {
      conversationId: 'test-004',
      prompt: 'What is the capital of France and when was it founded?',
      expectedTask: 'lookup',
      expectedFamily: 'gemini'
    },
    {
      conversationId: 'test-005',
      prompt: 'Based on our previous discussion, continue the analysis',
      expectedTask: 'contextual',
      expectedFamily: 'llama'
    },
    {
      conversationId: 'test-006',
      prompt: 'Debug this code and fix the syntax error',
      expectedTask: 'code',
      expectedFamily: 'qwen'
    }
  ];

  console.log('📋 Testing Task Detection & Routing\n');

  for (const test of testPrompts) {
    console.log(`Prompt: "${test.prompt.substring(0, 60)}..."`);

    try {
      const result = await router.routeTask({
        conversationId: test.conversationId,
        prompt: test.prompt,
        dryRun: true
      });

      const taskMatch = result.taskType === test.expectedTask ? '✓' : '✗';
      const familyMatch = result.family === test.expectedFamily ? '✓' : '✗';

      console.log(`  ${taskMatch} Task: ${result.taskType} (expected: ${test.expectedTask})`);
      console.log(`  ${familyMatch} Family: ${result.family} (expected: ${test.expectedFamily})`);
      console.log(`  Provider: ${result.selectedProvider}`);
      console.log(`  Routing Latency: ${result.routingLatency}ms`);
      console.log();

    } catch (error) {
      console.error(`  ✗ Error:`, error.message);
      console.log();
    }
  }

  console.log('-'.repeat(80));
  console.log('\n🔄 Testing Round-Robin Load Balancing\n');

  // Test round-robin for Qwen family (4 providers)
  console.log('Testing Qwen family (ollama, llm7, cerebras, openrouter):');
  for (let i = 0; i < 6; i++) {
    const provider = await loadBalancer.getNextProvider('qwen');
    console.log(`  Request ${i + 1}: ${provider}`);
  }

  console.log();
  console.log('Testing Llama family (groq, together, cerebras, llmgateway):');
  for (let i = 0; i < 6; i++) {
    const provider = await loadBalancer.getNextProvider('llama');
    console.log(`  Request ${i + 1}: ${provider}`);
  }

  console.log();
  console.log('-'.repeat(80));
  console.log('\n📊 Testing Provider Scoring\n');

  // Simulate provider outcomes
  await loadBalancer.updateProviderScore('groq', 'success', 150);
  await loadBalancer.updateProviderScore('groq', 'success', 120);
  await loadBalancer.updateProviderScore('together', 'failure');
  await loadBalancer.updateProviderScore('together', 'failure');
  await loadBalancer.updateProviderScore('cerebras', 'success', 200);

  const scores = await loadBalancer.getAllProviderScores();
  console.log('Provider Scores:');
  for (const [provider, data] of Object.entries(scores)) {
    console.log(`  ${provider}:`);
    console.log(`    Score: ${data.score} (success: ${data.successCount}, failure: ${data.failureCount})`);
    console.log(`    Avg Latency: ${data.avgLatency.toFixed(2)}ms`);
    if (data.cooldownUntil) {
      console.log(`    Cooldown Until: ${new Date(data.cooldownUntil).toISOString()}`);
    }
  }

  console.log();
  console.log('-'.repeat(80));
  console.log('\n📈 Routing Statistics\n');

  const stats = await router.getRoutingStats();
  console.log('Available Families:', stats.families.join(', '));
  console.log('Task Routing Config:');
  for (const [task, family] of Object.entries(stats.taskRouting)) {
    console.log(`  ${task} → ${family}`);
  }
  console.log();
  console.log('System Config:');
  console.log(`  Dry-Run Mode: ${stats.config.dryRunMode}`);
  console.log(`  Context Cache: ${stats.config.contextCacheEnabled}`);
  console.log(`  Health Tracking: ${stats.config.healthTrackingEnabled}`);

  console.log();
  console.log('-'.repeat(80));
  console.log('\n🏥 Testing Health Check Job\n');

  const healthJob = getHealthJobInstance();
  console.log('Running manual health check...');
  await healthJob.manualCheck();

  console.log();
  console.log('='.repeat(80));
  console.log('✓ Phase 2A Routing Test Complete');
  console.log('='.repeat(80));
  console.log();
  console.log('Next Steps:');
  console.log('  1. Review telemetry logs in ./logs/routing-telemetry.log');
  console.log('  2. Monitor provider scores and round-robin balance');
  console.log('  3. Run for 24-48 hours with production traffic');
  console.log('  4. Proceed to Phase 2B (context strategies) when ready');
  console.log();

  // Cleanup: Give time for async operations to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  process.exit(0);
}

// Run test
testPhase2ARouting().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
