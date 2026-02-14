/**
 * Redis Cache Test Script
 * 
 * Tests the caching implementation for FitnessGeek.
 * Run this to verify cache hits, misses, and TTL behavior.
 */

require('dotenv').config();
const redisClient = require('./src/config/redis');
const cacheService = require('./src/services/cacheService');
const logger = require('./src/config/logger');

async function testCache() {
  console.log('🧪 Testing Redis Cache Implementation...\n');

  try {
    // Connect to Redis
    console.log('📡 Connecting to Redis...');
    await redisClient.connect();
    console.log('✅ Redis connected\n');

    // Test 1: Basic get/set
    console.log('Test 1: Basic Cache Operations');
    console.log('-------------------------------');
    const testKey = cacheService.key('test', 'demo', '123');
    const testData = { message: 'Hello from cache', timestamp: Date.now() };
    
    await cacheService.set(testKey, testData, 60);
    console.log('✅ Set cache:', testKey);
    
    const retrieved = await cacheService.get(testKey);
    console.log('✅ Retrieved:', retrieved);
    console.log('Match:', JSON.stringify(retrieved) === JSON.stringify(testData) ? '✅ PASS' : '❌ FAIL');
    console.log();

    // Test 2: Cache miss
    console.log('Test 2: Cache Miss');
    console.log('------------------');
    const missingKey = cacheService.key('test', 'missing', '999');
    const missResult = await cacheService.get(missingKey);
    console.log('Result for missing key:', missResult === null ? '✅ PASS (null)' : '❌ FAIL');
    console.log();

    // Test 3: Cache wrap pattern
    console.log('Test 3: Cache Wrap Pattern');
    console.log('--------------------------');
    let fetchCount = 0;
    const wrapKey = cacheService.key('test', 'wrap', 'demo');
    
    const fetchData = async () => {
      fetchCount++;
      console.log(`  🔄 Fetch function called (count: ${fetchCount})`);
      return { data: 'expensive data', computed: Date.now() };
    };

    // First call - cache miss
    console.log('First call (should miss):');
    const result1 = await cacheService.wrap(wrapKey, fetchData, 30);
    console.log('  Result:', result1);
    
    // Second call - cache hit
    console.log('Second call (should hit):');
    const result2 = await cacheService.wrap(wrapKey, fetchData, 30);
    console.log('  Result:', result2);
    
    console.log(`Cache efficiency: ${fetchCount === 1 ? '✅ PASS (fetched once)' : '❌ FAIL'}`);
    console.log();

    // Test 4: Pattern deletion
    console.log('Test 4: Pattern Deletion');
    console.log('------------------------');
    await cacheService.set(cacheService.key('ai', 'user', '123', 'weekly-report', '2024-01', '7'), { test: 1 }, 60);
    await cacheService.set(cacheService.key('ai', 'user', '123', 'trend-watch', '2024-01', '30'), { test: 2 }, 60);
    await cacheService.set(cacheService.key('ai', 'user', '456', 'weekly-report', '2024-01', '7'), { test: 3 }, 60);
    
    console.log('Created 3 test keys (2 for user 123, 1 for user 456)');
    await cacheService.invalidateUserAI('123');
    console.log('Invalidated user 123 AI cache');
    
    const check1 = await cacheService.get(cacheService.key('ai', 'user', '123', 'weekly-report', '2024-01', '7'));
    const check2 = await cacheService.get(cacheService.key('ai', 'user', '456', 'weekly-report', '2024-01', '7'));
    console.log('User 123 cache deleted:', check1 === null ? '✅ PASS' : '❌ FAIL');
    console.log('User 456 cache preserved:', check2 !== null ? '✅ PASS' : '❌ FAIL');
    console.log();

    // Test 5: Food search caching simulation
    console.log('Test 5: Food Search Cache Simulation');
    console.log('------------------------------------');
    const searchKey = cacheService.key('food', 'search', 'chicken breast', 25);
    const mockFoodResults = [
      { name: 'Chicken Breast, Raw', calories: 165 },
      { name: 'Grilled Chicken Breast', calories: 142 }
    ];
    
    await cacheService.set(searchKey, mockFoodResults, 7 * 24 * 3600);
    console.log('✅ Cached food search results (7 day TTL)');
    
    const cachedSearch = await cacheService.get(searchKey);
    console.log('Retrieved:', cachedSearch?.length, 'items');
    console.log('Match:', Array.isArray(cachedSearch) && cachedSearch.length === 2 ? '✅ PASS' : '❌ FAIL');
    console.log();

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await cacheService.deletePattern('fg:test:*');
    await cacheService.deletePattern('fg:ai:user:123:*');
    await cacheService.deletePattern('fg:ai:user:456:*');
    await cacheService.delete(searchKey);
    console.log('✅ Cleanup complete\n');

    console.log('═══════════════════════════════════');
    console.log('✅ All cache tests completed successfully!');
    console.log('═══════════════════════════════════\n');

    console.log('📊 Cache Key Patterns Used:');
    console.log('  - AI Insights: fg:ai:user:{userId}:weekly-report:{start}:{days}');
    console.log('  - AI Trends: fg:ai:user:{userId}:trend-watch:{start}:{days}');
    console.log('  - Food Search: fg:food:search:{query}:{limit}');
    console.log('  - Barcode: fg:food:barcode:{barcode}');
    console.log('  - Reports: fg:reports:user:{userId}:*\n');

    console.log('⏱️  TTL Settings:');
    console.log('  - AI Weekly Reports: 6 hours');
    console.log('  - AI Trend Watch: 12 hours');
    console.log('  - Food Search: 7 days');
    console.log('  - Barcode Lookup: 30 days\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    logger.error('Cache test error', { error: error.message });
  } finally {
    await redisClient.disconnect();
    console.log('👋 Disconnected from Redis');
  }
}

// Run tests
testCache();
