# Phase 3 Deployment Guide

**Target**: Production deployment of stateful conversation system
**Estimated Time**: 30 minutes
**Downtime**: Zero (backward compatible)

---

## Pre-Deployment Checklist

### 1. Prerequisites
- [ ] MongoDB running and accessible
- [ ] Redis running (for future caching)
- [ ] InfluxDB v2.7 service running (docker container `datageek_influxdb`)
- [ ] BaseGeek API running on port 8987
- [ ] API keys configured in `.env.production`
- [ ] Backup of current database

### 2. Environment Variables

Add to `.env.production`:
```bash
# Phase 3: Enable incremental conversations
AIGEEK_INCREMENTAL=true

# MongoDB (already configured)
MONGODB_URI=mongodb://localhost:27017/datageek?authSource=admin

# Redis (already configured)
REDIS_HOST=192.168.1.17
REDIS_PORT=6380

# API Configuration
PORT=8987
NODE_ENV=production

# InfluxDB (new)
INFLUXDB_URL=http://192.168.1.17:8086
INFLUXDB_ORG=basegeek
INFLUXDB_BUCKET=datageek_metrics
INFLUXDB_TOKEN=<scoped_app_token>
INFLUXDB_SETUP_USERNAME=datageek_influx_admin
INFLUXDB_SETUP_PASSWORD=CHANGE_ME_SET_INFLUXDB_PASSWORD
INFLUXDB_ADMIN_TOKEN=<bootstrap_setup_token>
```

> Tip: use `.env.example` as the canonical template when updating per-environment files.

---

## Deployment Steps

### Step 1: Deploy BaseGeek

```bash
# Navigate to baseGeek directory
cd /Users/ccrocker/projects/baseGeek

# Stop current containers
docker-compose down

# Rebuild containers (includes new code)
docker-compose build

# Start services
docker-compose up -d

# Watch logs
docker-compose logs -f basegeek_app
docker-compose logs -f datageek_influxdb
```

**Expected log output:**
```
MongoDB connected
aiGeek database connected
✅ Phase 2A health monitoring started
✅ Phase 3: Conversation service initialized
[ConversationService] Found 0 existing conversations
[ConversationService] Cleanup job started (runs every hour)
API server running on port 8987
```

### Step 2: Verify Base Geek API

```bash
# Test health
curl http://192.168.1.17:8987/api/health

# Test capabilities endpoint (Phase 1 fix)
curl http://192.168.1.17:8987/api/ai/capabilities \
  -H "Authorization: Bearer bg_a51e3d6350d8cfe876635cce67fab8d72bdaf0a54c5fa84e5626c867407acf5a"

# Test conversation API (Phase 3)
curl http://192.168.1.17:8987/api/ai/conversations \
  -H "Authorization: Bearer bg_a51e3d6350d8cfe876635cce67fab8d72bdaf0a54c5fa84e5626c867407acf5a"

# Test Influx status endpoint
curl http://192.168.1.17:8987/api/influx/status \
  -H "Authorization: Bearer bg_a51e3d6350d8cfe876635cce67fab8d72bdaf0a54c5fa84e5626c867407acf5a"
```

**Expected responses:**
- Health: `{"status":"ok"}`
- Capabilities: Provider info with limits
- Conversations: `{"success":true,"data":[],"count":0}`
- Influx: `{"status":"connected","config":{...},"measurements":{"count":N}}`

### Step 3: Deploy CodeGeek

```bash
# Navigate to codeGeek directory
cd /Users/ccrocker/projects/codeGeek

# Install dependencies (if needed)
pnpm install

# Build extension
pnpm build

# Package extension
cd src
npx vsce package
```

This creates `code-geek-{version}.vsix` in the `bin/` directory.

### Step 4: Install Updated Extension

**Option A: VS Code Marketplace (production)**
1. Upload `.vsix` to marketplace
2. Users auto-update

**Option B: Manual Install (testing)**
```bash
code --install-extension ../bin/code-geek-{version}.vsix --force
```

**Option C: Development Mode**
1. Open codeGeek in VS Code
2. Press F5 to launch Extension Development Host
3. Test in the development window

---

## Verification Tests

### Test 1: Legacy Mode (Backward Compatibility)

```bash
# Ensure AIGEEK_INCREMENTAL is NOT set
unset AIGEEK_INCREMENTAL

# Start codeGeek
# Open a task
# Should work exactly as before
```

**Expected**: Full context sent, existing behavior maintained

### Test 2: Incremental Mode

```bash
# Enable incremental mode
export AIGEEK_INCREMENTAL=true

# Start codeGeek
# Open a task
# Send first message
```

**Expected logs:**
```
[AiGeekIncremental] Sending incremental message to conversation task-abc123
[AiGeekIncremental] Message role: user, length: 245 chars
```

**Expected baseGeek logs:**
```
--- /api/ai/conversation/message invoked (Phase 3) ---
[Phase3] Conversation task-abc123: 1 messages, 245 tokens
```

### Test 3: Conversation Continuity

```bash
# Send multiple messages in same task
# Each message should reference same conversationId
```

**Expected:**
- ConversationId remains constant
- Context grows incrementally
- No 50K+ token requests

### Test 4: Automatic Summarization

```bash
# Send many messages to exceed 70% of context window
# For 32K context, this is ~22,400 tokens
```

**Expected logs:**
```
[ConversationService] Context at 22500/32000 tokens, triggering summarization
[ConversationService] ✅ Summarized 8 messages: 19000 → 1200 tokens
```

### Test 5: Provider Health

```bash
# Check current provider status
curl http://192.168.1.17:8987/api/ai/capabilities \
  -H "Authorization: Bearer $API_KEY"
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "currentProvider": "cerebras",
    "maxContextTokens": 128000,
    "recommendedContextTokens": 76800,
    "rateLimitStatus": {
      "tokensUsed": 1234,
      "tokensAvailable": 58766,
      "requestsUsed": 2,
      "requestsAvailable": 28,
      "isRateLimited": false
    }
  }
}
```

---

## Rollback Plan

### If Issues Occur

**Step 1: Revert baseGeek**
```bash
cd /Users/ccrocker/projects/baseGeek
git log --oneline -10
git revert <commit-hash>  # or git reset --hard <previous-commit>
docker-compose down
docker-compose up -d
```

**Step 2: Revert codeGeek**
```bash
cd /Users/ccrocker/projects/codeGeek
git revert <commit-hash>
pnpm build
# Reinstall previous version
```

**Step 3: Disable Incremental Mode**
```bash
# Remove from .env.production
# OR set to false
AIGEEK_INCREMENTAL=false
```

**Step 4: Verify Legacy Mode**
```bash
# Test that old API still works
curl -X POST http://192.168.1.17:8987/api/ai/call \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}],"stream":false}'
```

---

## Monitoring

### Key Metrics to Watch

1. **Request Size Distribution**
   ```bash
   # Check logs for payload sizes
   grep "Estimated payload size" logs/basegeek_app.log
   ```
   - Before: 50K+ common
   - After: <2K typical

2. **Provider Success Rate**
   ```bash
   # Check for fallback attempts
   grep "fallback" logs/basegeek_app.log | wc -l
   ```
   - Before: 5+ attempts per request
   - After: <1 attempt per request

3. **Conversation Stats**
   ```bash
   curl http://192.168.1.17:8987/api/ai/conversations \
     -H "Authorization: Bearer $API_KEY"
   ```
   - Monitor active conversation count
   - Check token utilization
   - Watch for summarization events

4. **Error Rate**
   ```bash
   # Check for errors
   grep "ERROR\|Failed" logs/basegeek_app.log
   ```
   - Target: <0.1% error rate

### Dashboard (Future)

Access at: `http://192.168.1.17:8988` (basegeek_ui container)

Metrics to display:
- Active conversations
- Average tokens per conversation
- Summarization frequency
- Provider distribution
- Response times
- Error rates

---

## Performance Tuning

### If Context Still Growing Too Large

**Option 1: Lower summarization threshold**
```javascript
// In conversationService.js
this.config.summarizationThreshold = 0.5  // From 0.7 to 0.5 (50%)
```

**Option 2: More aggressive target**
```javascript
this.config.targetContextAfterSummary = 0.3  // From 0.4 to 0.3 (30%)
```

**Option 3: Keep fewer messages**
```javascript
this.config.minMessagesToKeep = 2  // From 4 to 2
```

### If Summarization Failing

**Option 1: Change provider selection**
```javascript
// In conversationService.js
selectSummarizationProvider() {
  // Add your preferred provider first
  const providers = ['groq', 'gemini', 'cerebras', 'together'];
  // ...
}
```

**Option 2: Fallback to truncation**
Already implemented — automatically falls back if summarization fails.

### If Response Times High

**Option 1: Check provider health**
```bash
curl http://192.168.1.17:8987/api/ai/capabilities \
  -H "Authorization: Bearer $API_KEY"
```

**Option 2: Enable Redis caching (future)**
```javascript
// Coming in Phase 4
this.config.enableRedisCache = true
```

---

## Database Maintenance

### Conversation Cleanup

Automatic cleanup runs hourly. Manual cleanup:

```javascript
// Connect to MongoDB
mongosh mongodb://localhost:27017/datageek

// Check expired conversations
db.conversations.find({ expiresAt: { $lt: new Date() } }).count()

// Manual cleanup (if needed)
db.conversations.deleteMany({ expiresAt: { $lt: new Date() } })

// Check active conversations
db.conversations.find({ state: 'active' }).count()

// Check token distribution
db.conversations.aggregate([
  { $match: { state: 'active' } },
  { $group: {
      _id: null,
      avgTokens: { $avg: '$currentContextTokens' },
      maxTokens: { $max: '$currentContextTokens' },
      totalConversations: { $sum: 1 }
  }}
])
```

### Indexes

Verify indexes are created:
```javascript
db.conversations.getIndexes()
```

Expected indexes:
- `conversationId_1` (unique)
- `userId_1_state_1_updatedAt_-1`
- `appName_1_state_1_updatedAt_-1`
- `expiresAt_1` (TTL)

### Backup

```bash
# Backup conversations collection
docker exec datageek_mongodb mongodump \
  --uri="mongodb://datageek_admin:CHANGE_ME@localhost:27017/datageek?authSource=admin" \
  --collection=conversations \
  --out=/tmp/backup

# Copy backup to host
docker cp datageek_mongodb:/tmp/backup ./backups/
```

---

## Security Considerations

### 1. API Key Validation
All conversation endpoints require authentication:
```javascript
router.use(authenticateJWTOrAPIKey());
```

### 2. User Isolation
Conversations are isolated by userId:
```javascript
{ conversationId, userId, state: 'active' }
```

### 3. Data Expiration
Automatic cleanup prevents data accumulation:
- Active: 7 days
- Archived: 30 days
- Deleted: 24 hours

### 4. Rate Limiting
Provider-level rate limits still apply via `aiService.rateLimits`

---

## Support

### Common Issues

**Issue**: Cannot connect to MongoDB
**Solution**: Check MongoDB status: `docker ps | grep mongodb`

**Issue**: Conversation not found
**Solution**: May have expired. Check `expiresAt` field.

**Issue**: High memory usage
**Solution**: Check active conversation count. May need to reduce TTL.

**Issue**: Slow summarization
**Solution**: Check which provider is being used. May need to switch.

### Logs Location

```bash
# BaseGeek logs
docker-compose logs -f basegeek_app

# Specific service
docker logs basegeek_app --tail 100 -f

# Save logs to file
docker logs basegeek_app > logs/basegeek_app.log 2>&1
```

### Contact

For issues or questions:
- Check: `/Users/ccrocker/projects/baseGeek/DOCS/PHASE_3_IMPLEMENTATION.md`
- Review: `/Users/ccrocker/projects/baseGeek/DOCS/CONTEXT_OVERFLOW_ANALYSIS.md`
- Logs: `docker-compose logs basegeek_app`

---

## Post-Deployment

### Week 1: Monitor Closely

- [ ] Check logs daily
- [ ] Monitor conversation count
- [ ] Watch for errors
- [ ] Verify summarization working
- [ ] Track token usage

### Week 2: Optimize

- [ ] Analyze conversation patterns
- [ ] Tune summarization thresholds
- [ ] Optimize provider selection
- [ ] Review cleanup frequency

### Month 1: Evaluate

- [ ] Compare before/after metrics
- [ ] User feedback collection
- [ ] Performance analysis
- [ ] Plan Phase 4 enhancements

---

## Success Criteria

### Deployment Successful If:

✅ No increase in error rate
✅ Request sizes <24K tokens
✅ Response times <5s average
✅ Provider success rate >90%
✅ Backward compatibility maintained
✅ Automatic summarization working
✅ Conversation cleanup running
✅ No database performance issues

### Ready for Full Rollout If:

✅ 1 week of stable operation
✅ Performance metrics met
✅ No critical bugs reported
✅ User acceptance positive
✅ Monitoring in place

---

**Deployment prepared. System ready. Let's ship it.**

— Sage & Chef


