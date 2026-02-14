#!/usr/bin/env node
/**
 * Drop the old sessionId_1 index from conversations collection
 * This index is from a previous schema and conflicts with Phase 3
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = 'mongodb://localhost:27017';
const DB_NAME = 'aiGeek';

async function dropIndex() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected');
    
    const db = client.db(DB_NAME);
    const collection = db.collection('conversations');
    
    // List current indexes
    console.log('\n📋 Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
    });
    
    // Check if sessionId_1 exists
    const hasSessionIdIndex = indexes.some(idx => idx.name === 'sessionId_1');
    
    if (hasSessionIdIndex) {
      console.log('\n🗑️  Dropping sessionId_1 index...');
      await collection.dropIndex('sessionId_1');
      console.log('✅ Index dropped successfully');
    } else {
      console.log('\n⚠️  sessionId_1 index not found (already dropped?)');
    }
    
    // List indexes after
    console.log('\n📋 Indexes after cleanup:');
    const indexesAfter = await collection.indexes();
    indexesAfter.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
    });
    
    console.log('\n✨ Done!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

dropIndex();


