import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.DB_URI, {
    authSource: 'admin',
  });
  logger.info({ host: conn.connection.host }, 'MongoDB connected');
};

export default connectDB;
