import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { attachUser, meHandler } from '@geeksuite/user/server';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import authRoutes from './routes/auth.js';
import storyRoutes from './routes/stories.js';
import exportRoutes from './routes/export.js';
import characterRoutes from './routes/characters.js';

const app = express();
const PORT = process.env.PORT || 9977;

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://192.168.1.17:9977',
  'http://192.168.1.17:3000',
  'https://storygeek.clintgeek.com',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    console.log('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB (DataGeek instance)'))
.catch(err => console.error('MongoDB connection error:', err));

// Auth proxy routes (me, refresh, logout → baseGeek)
app.use('/api/auth', authRoutes);

// /api/me endpoint via @geeksuite/user/server
app.get('/api/me', attachUser({ basegeekUrl: process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com' }), meHandler());

// API Routes
app.use('/api/stories', storyRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/characters', characterRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), service: 'StoryGeek Backend' });
});

// Serve static frontend from /public
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA catch-all — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/graphql')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`StoryGeek backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
