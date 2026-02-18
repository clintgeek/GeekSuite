import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js'; // Import database connection
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import noteRoutes from './routes/notes.js'; // Import note routes
import tagRoutes from './routes/tags.js'; // Import tag routes
import searchRoutes from './routes/search.js'; // Import search routes
import { protect } from './middleware/authMiddleware.js';
import { meHandler } from '@geeksuite/user/server';

// Import route files
import authRoutes from './routes/auth.js';

// Load environment variables
// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construct the path to .env.local relative to the current file
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
// Load .env if .env.local is not found or doesn't contain all variables
dotenv.config(); // Loads .env by default

// Connect to Database
connectDB();

// Initialize Express app
const app = express();

// Trust NGINX proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API server
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 auth requests per windowMs
  message: { message: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/', authLimiter);

// Enable CORS for all routes
const allowedOrigins = [
  'http://localhost:5173',    // Vite dev server
  'http://localhost:5001',    // Backend dev server
  'http://localhost:9988',    // Unified container runtime
  'https://notegeek.clintgeek.com',  // Production domain
  'http://192.168.1.26:5173'  // Local network access
];

// Body parser middleware - MUST come before request logging
app.use(express.json({ limit: '50mb' })); // Parse JSON request bodies
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Parse URL-encoded request bodies

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials'
  ],
  exposedHeaders: ['Content-Range'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Add request origin logging
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`${ req.method } ${ req.path }`);
  }
  next();
});


// HTTP request logger middleware (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Mount Routers
app.use('/api/auth', authRoutes);

// Canonical auth check (cookie-first)
app.get('/api/me', protect, meHandler());

app.use('/api/notes', noteRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/search', searchRoutes);

// Serve built frontend assets from backend container
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// SPA fallback for non-API routes
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return next();
  }

  return res.sendFile(path.join(publicPath, 'index.html'));
});

// Error handling middleware (must be after all routes)
app.use(notFound);
app.use(errorHandler);

// Define port
const PORT = process.env.PORT || 9988;

// Add version check at the top of the file
// Ensure Node.js version is compatible
const requiredNodeVersion = '16.0.0';

function compareVersions(v1, v2) {
  const v1parts = v1.split('.').map(Number);
  const v2parts = v2.split('.').map(Number);

  for (let i = 0; i < v1parts.length; ++i) {
    if (v2parts.length === i) {
      return 1; // v1 is longer, so greater
    }
    if (v1parts[i] > v2parts[i]) {
      return 1;
    }
    if (v1parts[i] < v2parts[i]) {
      return -1;
    }
  }

  if (v1parts.length !== v2parts.length) {
    return -1; // v2 is longer, so greater
  }

  return 0;
}

if (compareVersions(process.version.substring(1), requiredNodeVersion) < 0) {
  console.error(`\n\n\x1b[31m=========== ERROR: INCOMPATIBLE NODE.JS VERSION ===========\x1b[0m`);
  console.error(`\x1b[31mYou are running Node.js ${ process.version }, but NoteGeek requires at least v${ requiredNodeVersion }\x1b[0m`);
  console.error(`\x1b[31mPlease run: \x1b[33mnvm use --lts\x1b[31m and try again.\x1b[0m`);
  console.error(`\x1b[31m=========================================================\x1b[0m\n`);
  process.exit(1);
}

// Start the server
app.listen(PORT, () => {
  console.log(`NoteGeek server running on port ${ PORT }`);
});

export default app;