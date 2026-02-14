/**
 * Migration script to fix UserProgress.userId field
 * Changes from ObjectId to String to match BaseGeek user ID format
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://192.168.1.17:27018/musicGeek';

async function migrateUserProgress() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // Drop the old index
    console.log('Dropping old userId_1_lessonId_1 index...');
    try {
      await db.collection('userprogresses').dropIndex('userId_1_lessonId_1');
      console.log('Old index dropped');
    } catch (error) {
      console.log('Index already dropped or does not exist:', error.message);
    }

    // Get all documents
    const docs = await db.collection('userprogresses').find({}).toArray();
    console.log(`Found ${docs.length} documents to migrate`);

    // Update each document to convert ObjectId to String
    for (const doc of docs) {
      if (doc.userId && typeof doc.userId === 'object') {
        const userIdString = doc.userId.toString();
        console.log(`Updating document ${doc._id}: ${doc.userId} -> ${userIdString}`);

        await db
          .collection('userprogresses')
          .updateOne({ _id: doc._id }, { $set: { userId: userIdString } });
      }
    }

    // Create new index
    console.log('Creating new index with String userId...');
    await db.collection('userprogresses').createIndex({ userId: 1, lessonId: 1 }, { unique: true });
    console.log('New index created');

    console.log('Migration complete!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateUserProgress();
