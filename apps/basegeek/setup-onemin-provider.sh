#!/bin/bash

# Setup 1min.ai Provider in BaseGeek Database
# This script adds/updates the 1min.ai configuration in MongoDB

set -e

echo "=========================================="
echo "1min.ai Provider Setup for BaseGeek"
echo "=========================================="
echo ""

# Configuration
MONGO_HOST="${MONGO_HOST:-192.168.1.17}"
MONGO_PORT="${MONGO_PORT:-27018}"
MONGO_DB="${MONGO_DB:-basegeek}"

# Check if API key is provided
if [ -z "$1" ]; then
  echo "❌ Error: API key required"
  echo ""
  echo "Usage: $0 <1MIN_AI_API_KEY>"
  echo ""
  echo "Get your API key from: https://1min.ai/dashboard"
  echo ""
  echo "Example:"
  echo "  $0 sk-1min-xxxxxxxxxxxxxxxx"
  exit 1
fi

API_KEY="$1"

echo "📋 Configuration:"
echo "   MongoDB Host: $MONGO_HOST"
echo "   MongoDB Port: $MONGO_PORT"
echo "   Database: $MONGO_DB"
echo "   Provider: onemin"
echo "   API Key: ${API_KEY:0:10}...${API_KEY: -4}"
echo ""

# Test MongoDB connection
echo "🔍 Testing MongoDB connection..."
if ! mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
  echo "❌ Failed to connect to MongoDB at $MONGO_HOST:$MONGO_PORT"
  echo "   Please check your MongoDB server is running"
  exit 1
fi
echo "✅ MongoDB connection successful"
echo ""

# Check if provider already exists
echo "🔍 Checking if 1min.ai provider exists..."
EXISTING=$(mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" "$MONGO_DB" --quiet --eval "
  db.aiconfigs.countDocuments({provider: 'onemin'})
")

if [ "$EXISTING" -gt 0 ]; then
  echo "⚠️  1min.ai provider already exists, updating..."

  # Update existing
  mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" "$MONGO_DB" --eval "
    db.aiconfigs.updateOne(
      { provider: 'onemin' },
      {
        \$set: {
          provider: 'onemin',
          apiKey: '$API_KEY',
          model: 'deepseek-reasoner',
          enabled: true,
          costPer1kTokens: 0.0,
          maxTokens: 8000,
          temperature: 0.7,
          updatedAt: new Date()
        }
      }
    )
  " > /dev/null

  echo "✅ Updated existing 1min.ai configuration"
else
  echo "➕ Creating new 1min.ai provider..."

  # Insert new
  mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" "$MONGO_DB" --eval "
    db.aiconfigs.insertOne({
      provider: 'onemin',
      apiKey: '$API_KEY',
      model: 'deepseek-reasoner',
      enabled: true,
      costPer1kTokens: 0.0,
      maxTokens: 8000,
      temperature: 0.7,
      createdAt: new Date(),
      updatedAt: new Date()
    })
  " > /dev/null

  echo "✅ Created new 1min.ai configuration"
fi

echo ""
echo "🧪 Testing 1min.ai API key..."

# Test API key with real request
TEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://api.1min.ai/api/features \
  -H "API-KEY: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CODE_GENERATOR",
    "model": "deepseek-chat",
    "conversationId": "TEST",
    "promptObject": {
      "prompt": "Say hello",
      "webSearch": false
    }
  }' 2>&1)

HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$TEST_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ API key is valid and working!"
  echo ""
  echo "📊 Verification Details:"
  mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" "$MONGO_DB" --quiet --eval "
    const doc = db.aiconfigs.findOne({provider: 'onemin'});
    print('   Provider: ' + doc.provider);
    print('   Model: ' + doc.model);
    print('   Enabled: ' + doc.enabled);
    print('   API Key: ' + doc.apiKey.substring(0, 10) + '...' + doc.apiKey.slice(-4));
    print('   Max Tokens: ' + doc.maxTokens);
    print('   Temperature: ' + doc.temperature);
  "
  echo ""
  echo "🎉 1min.ai provider is ready to use!"
  echo ""
  echo "Next steps:"
  echo "1. Restart API server: pm2 restart basegeek-api"
  echo "2. Test smart routing: curl -X POST .../api/ai/call-smart"
  echo "3. Check provider health: curl -X GET .../api/ai/provider-health"
  echo ""
  echo "Supported models:"
  echo "- deepseek-reasoner (default)"
  echo "- deepseek-chat"
  echo "- claude-3-5-sonnet-20240620"
  echo "- claude-3-7-sonnet-20250219"
  echo "- gpt-4o"
  echo "- gpt-5"
  echo "- gpt-5-chat-latest"
  echo ""
  echo "Change model in aiService.js or database."

else
  echo "❌ API key validation failed (HTTP $HTTP_CODE)"
  echo ""
  echo "Response:"
  echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
  echo ""
  echo "Possible issues:"
  echo "- Invalid API key format"
  echo "- API key not activated"
  echo "- Rate limit exceeded"
  echo "- Network connectivity issues"
  echo ""
  echo "Get a valid API key from: https://1min.ai/dashboard"
  exit 1
fi
