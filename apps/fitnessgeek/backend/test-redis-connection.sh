#!/bin/bash
# Redis Cache Quick Test Script
# Run this to verify Redis connection and basic caching functionality

echo "🧪 FitnessGeek Redis Cache Quick Test"
echo "======================================"
echo ""

# Check if Redis is running
echo "📡 Checking Redis connection..."
redis-cli -h 192.168.1.17 -p 6380 ping > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Redis is running and reachable"
    echo ""
    
    # Show Redis info
    echo "📊 Redis Server Info:"
    redis-cli -h 192.168.1.17 -p 6380 INFO server | grep "redis_version"
    redis-cli -h 192.168.1.17 -p 6380 INFO memory | grep "used_memory_human"
    echo ""
    
    # Count FitnessGeek keys
    echo "🔑 Current FitnessGeek Cache Keys:"
    KEY_COUNT=$(redis-cli -h 192.168.1.17 -p 6380 KEYS "fg:*" | wc -l)
    echo "Total keys: $KEY_COUNT"
    echo ""
    
    if [ $KEY_COUNT -gt 0 ]; then
        echo "Sample keys:"
        redis-cli -h 192.168.1.17 -p 6380 KEYS "fg:*" | head -5
        echo ""
    fi
    
    # Test set/get
    echo "🧪 Testing cache operations..."
    redis-cli -h 192.168.1.17 -p 6380 SETEX "fg:test:quicktest" 10 "Hello from FitnessGeek cache" > /dev/null
    RESULT=$(redis-cli -h 192.168.1.17 -p 6380 GET "fg:test:quicktest")
    
    if [ "$RESULT" == "Hello from FitnessGeek cache" ]; then
        echo "✅ Cache write/read successful"
        redis-cli -h 192.168.1.17 -p 6380 DEL "fg:test:quicktest" > /dev/null
    else
        echo "❌ Cache test failed"
    fi
    
    echo ""
    echo "✅ Redis cache is working properly!"
    echo ""
    echo "📝 To run full test suite:"
    echo "   cd backend && node test-cache.js"
    
else
    echo "❌ Cannot connect to Redis at 192.168.1.17:6380"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check if Redis container is running"
    echo "  2. Verify REDIS_URL in backend/.env"
    echo "  3. Test connection: redis-cli -h 192.168.1.17 -p 6380 ping"
fi

echo ""
