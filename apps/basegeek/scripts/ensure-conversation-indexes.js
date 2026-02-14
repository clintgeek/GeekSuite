#!/usr/bin/env node
/**
 * Ensure Phase 3 conversation indexes are properly set up
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = 'mongodb://localhost:27017';
const DB_NAME = 'aiGeek';

async function ensureIndexes() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected');
    
    const db = client.db(DB_NAME);
    const collection = db.collection('conversations');
    
    console.log('\n🔧 Creating Phase 3 indexes...');
    
    // Unique index on conversationId
    await collection.createIndex({ conversationId: 1 }, { unique: true });
    console.log('✅ conversationId_1 (unique)');
    
    console.log('\n📋 All indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(idx => {
      const unique = idx.unique ? ' [UNIQUE]' : '';
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key) + unique);
    });
    
    console.log('\n✨ Phase 3 indexes ready!');
    
  } catch (error) {
    if (error.code === 85) {
      console.log('✅ Index already exists');
    } else {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}

ensureIndexes();


