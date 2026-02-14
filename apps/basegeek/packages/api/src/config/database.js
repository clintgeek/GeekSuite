import mongoose from 'mongoose';

// AI Geek Database Connection
const AIGEEK_MONGODB_URI = process.env.AIGEEK_MONGODB_URI || 'mongodb://localhost:27017/aiGeek?authSource=admin';

export const connectAIGeekDB = async () => {
  try {
    await mongoose.createConnection(AIGEEK_MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to aiGeek database');
  } catch (error) {
    console.error('Failed to connect to aiGeek database:', error);
    throw error;
  }
};

export const getAIGeekConnection = () => {
  const existingConnection = mongoose.connections.find(conn => conn.name === 'aiGeek');
  if (existingConnection) {
    console.log('🔗 Using existing aiGeek connection');
    return existingConnection;
  }
  console.log('🔗 Creating new aiGeek connection');
  return mongoose.createConnection(AIGEEK_MONGODB_URI);
};
