import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const initDb = async () => {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Create collections if they don't exist
    const collections = ['tasks', 'templates', 'users', 'settings'];
    const db = mongoose.connection.db;

    for (const collection of collections) {
      // Check if collection exists
      const exists = await db.listCollections({ name: collection }).hasNext();

      if (!exists) {
        console.log(`Creating collection: ${collection}`);
        await db.createCollection(collection);

        // If creating the settings collection, add default settings
        if (collection === 'settings') {
          await db.collection('settings').insertOne({
            name: 'default',
            theme: 'light',
            dateFormat: 'MM/DD/YYYY',
            defaultView: 'daily',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      } else {
        console.log(`Collection ${collection} already exists`);
      }
    }

    console.log('Database initialization completed');

  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  }
};

// Run the initialization
initDb();