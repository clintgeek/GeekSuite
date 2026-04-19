import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { request as httpRequest } from 'node:http';

// Import routes
import templateRoutes from './src/routes/templateRoutes.js';
import journalRoutes from './src/routes/journalRoutes.js';
import taskRoutes from './src/routes/taskRoutes.js';
import authRoutes from './src/routes/authRoutes.js';
import { authenticate } from './src/middleware/authMiddleware.js';
import { meHandler } from '@geeksuite/user/server';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const app = express();
const PORT = process.env.PORT || 5001;

// Required for Express behind Nginx reverse proxy (correct req.secure, req.ip, etc.)
app.set('trust proxy', 1);

// Middleware
const hardcodedOrigins = [
  'https://bujogeek.clintgeek.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5001',
  'http://localhost:3000',
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : hardcodedOrigins;

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));

// Serve static files from frontend build
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Routes
app.use('/api/auth', authRoutes);

app.get('/api/me', (req, res, next) => {
  const hasCookie = !!req.headers.cookie?.includes('geek_token');
  const hasAuth = !!req.headers.authorization;
  console.log(`[DEBUG /api/me] cookie=${ hasCookie } auth=${ hasAuth }`);
  next();
}, authenticate, (req, res, next) => {
  console.log(`[DEBUG /api/me] after auth: geek.user=${ !!req.geek?.user }`);
  next();
}, meHandler());

app.use('/api/templates', templateRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/tasks', taskRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});



// SPA fallback - serve index.html for all non-API routes (must be LAST)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/graphql')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// MongoDB Connection
const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB at:', process.env.DB_URI?.replace(/:\/\/(.*)@/, '://******:******@'));

    await mongoose.connect(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Create database if it doesn't exist (MongoDB creates it automatically)
    console.log('MongoDB connected');
    console.log('Using database:', mongoose.connection.db.databaseName);

  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Start server
app.listen(PORT, async () => {
  await connectDB();
  console.log(`Server running on port ${ PORT }`);
});