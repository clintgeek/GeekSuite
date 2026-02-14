const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitnessgeek?authSource=admin';

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Migration function
async function migrateUserIds() {
  try {
    console.log('🔄 Starting user ID migration...');

    const db = mongoose.connection.db;

    // Collections to migrate
    const collections = [
      { name: 'weights', field: 'userId' },
      { name: 'bloodpressures', field: 'userId' },
      { name: 'foodlogs', field: 'user_id' },
      { name: 'fooditems', field: 'user_id' },
      { name: 'meals', field: 'user_id' },
      { name: 'dailysummaries', field: 'user_id' },
      { name: 'nutritiongoals', field: 'user_id' },
      { name: 'weightgoals', field: 'user_id' }
    ];

    for (const collection of collections) {
      console.log(`\n📊 Processing collection: ${collection.name}`);

      // Get all documents in the collection
      const documents = await db.collection(collection.name).find({}).toArray();
      console.log(`   Found ${documents.length} documents`);

      let updatedCount = 0;

      for (const doc of documents) {
        const userIdField = doc[collection.field];

        // Skip if no user ID field or if it's already a string
        if (!userIdField || typeof userIdField === 'string') {
          continue;
        }

        // Convert ObjectId to string
        const userIdString = userIdField.toString();

        // Update the document
        await db.collection(collection.name).updateOne(
          { _id: doc._id },
          { $set: { [collection.field]: userIdString } }
        );

        updatedCount++;
      }

      console.log(`   ✅ Updated ${updatedCount} documents`);
    }

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await connectDB();
    await migrateUserIds();
    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run migration
if (require.main === module) {
  main();
}

module.exports = { migrateUserIds };