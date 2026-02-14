# Testing Redis Caching

This guide helps you verify the Redis caching implementation is working correctly.

## Prerequisites

- Redis server running at `192.168.1.17:6380`
- Backend dependencies installed (`npm install`)
- Environment variable `REDIS_URL` configured in `.env`

## Quick Connection Test

```bash
cd backend
./test-redis-connection.sh
```

This script:
- ✅ Checks Redis connectivity
- ✅ Shows server info and memory usage
- ✅ Lists current FitnessGeek cache keys
- ✅ Tests basic cache operations

## Comprehensive Cache Test

```bash
cd backend
node test-cache.js
```

This runs the full test suite covering:
1. Basic cache get/set operations
2. Cache miss handling
3. Cache-aside (wrap) pattern
4. Pattern-based deletion (invalidation)
5. Food search simulation
6. User-specific cache invalidation

**Expected output:**
```
✅ All cache tests completed successfully!
```

## Manual Redis Testing

### Connect to Redis CLI
```bash
redis-cli -h 192.168.1.17 -p 6380
```

### Check FitnessGeek Keys
```redis
# List all FG keys
KEYS fg:*

# Get specific key
GET fg:food:search:chicken:25

# Check TTL
TTL fg:ai:user:123:weekly-report:2024-11-25:7

# Delete pattern
KEYS fg:test:* | xargs redis-cli -h 192.168.1.17 -p 6380 DEL
```

### Monitor Cache Activity
```bash
# Watch real-time commands
redis-cli -h 192.168.1.17 -p 6380 MONITOR

# Get server stats
redis-cli -h 192.168.1.17 -p 6380 INFO stats
```

## Testing Cache Behavior in App

### 1. Test Food Search Caching
1. Start the backend server: `npm run dev`
2. Search for "chicken breast" in the app
3. Check logs for "Cache miss" message
4. Search again for "chicken breast"
5. Check logs for "Cache hit" message (should be instant)

### 2. Test AI Insights Caching
1. Navigate to Reports page
2. View Weekly Coach insight (first load: 5-10 seconds)
3. Check logs for "Cache miss"
4. Reload page or change date range back
5. View Weekly Coach again (should be instant)
6. Check logs for "Cache hit"

### 3. Test Cache Invalidation
1. View Reports page (caches AI insights)
2. Add a food log entry
3. Return to Reports page
4. AI insights should regenerate (cache invalidated)
5. Check logs for new AI API call

## Verifying Performance Improvements

### Food Search (Before vs After)
```bash
# Without cache (first search)
curl -w "@curl-format.txt" -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/foods/search?query=chicken"
# Expected: 1-3 seconds

# With cache (second search)
curl -w "@curl-format.txt" -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/foods/search?query=chicken"
# Expected: <50ms
```

### AI Insights (Before vs After)
```bash
# First load (cache miss)
curl -w "@curl-format.txt" -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/insights/weekly-report?days=7"
# Expected: 5-10 seconds

# Second load (cache hit)
curl -w "@curl-format.txt" -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/insights/weekly-report?days=7"
# Expected: <10ms
```

## Troubleshooting

### Redis Not Connecting
```bash
# Check if Redis is running
docker ps | grep redis

# Test connection
redis-cli -h 192.168.1.17 -p 6380 ping
# Should return: PONG

# Check logs
docker logs <redis-container-id>
```

### Cache Not Working
1. Check `REDIS_URL` in `.env` is correct
2. Verify Redis client connected: Look for "Redis client connected and ready" in logs
3. Check for Redis errors in backend logs
4. Verify `cacheService` is imported in services

### Cache Not Invalidating
1. Check that routes import `cacheService`
2. Verify `invalidateUserAI()` and `invalidateUserReports()` are called
3. Look for "User cache invalidated" log messages
4. Manually check Redis: `KEYS fg:ai:user:123:*` (should be empty after invalidation)

## Expected Log Messages

When caching is working, you should see:

```
✅ Setup:
Redis client connecting...
Redis client connected and ready
💾 Redis caching: enabled

✅ Cache Operations:
Cache miss { key: 'fg:food:search:chicken:25' }
Cache set { key: 'fg:food:search:chicken:25', ttl: 604800 }
Cache hit { key: 'fg:food:search:chicken:25' }

✅ Invalidation:
User AI cache invalidated { userId: '123' }
User reports cache invalidated { userId: '123' }
```

## Performance Metrics

Track these in production:

1. **Cache Hit Rate**: hits / (hits + misses) × 100%
   - Target: >70% for food searches
   - Target: >50% for AI insights

2. **Response Times**:
   - Food search (cached): <50ms
   - AI insights (cached): <10ms
   - Food search (uncached): 1-3 seconds
   - AI insights (uncached): 5-10 seconds

3. **API Call Reduction**:
   - Monitor external API usage before/after
   - Target: 60-80% reduction

## Summary

✅ Quick test: `./test-redis-connection.sh`  
✅ Full test: `node test-cache.js`  
✅ Monitor: `redis-cli MONITOR`  
✅ Production: Watch logs for cache hits/misses

For detailed implementation info, see `DOCS/REDIS_CACHING_IMPLEMENTATION.md`
