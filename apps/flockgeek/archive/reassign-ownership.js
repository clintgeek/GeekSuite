import mongoose from 'mongoose';

// Connect to your MongoDB database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flockgeek';

async function reassignOwnership() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const oldOwnerId = 'demo-owner';
    const newOwnerId = '6818c2bddcf626909f6a93a1';

    const collections = [
      'birds',
      'groups',
      'groupmemberships',
      'healthrecords',
      'eggproduction',
      'events',
      'hatchevents',
      'pairings',
      'birdnotes',
      'birdtraits'
    ];

    for (const collectionName of collections) {
      const collection = mongoose.connection.db.collection(collectionName);
      const result = await collection.updateMany(
        { ownerId: oldOwnerId },
        { $set: { ownerId: newOwnerId } }
      );

      console.log(`${collectionName}: Updated ${result.modifiedCount} documents`);
    }

    console.log('Ownership reassignment completed successfully!');
  } catch (error) {
    console.error('Error reassigning ownership:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

reassignOwnership();