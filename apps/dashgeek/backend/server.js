import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4090;
const BASEGEEK_URL = process.env.BASEGEEK_URL;
const CORS_ORIGINS = process.env.CORS_ORIGINS?.split(',').map(s => s.trim());

if (!BASEGEEK_URL) {
  console.error('FATAL: BASEGEEK_URL environment variable is not set.');
  process.exit(1);
}

if (!CORS_ORIGINS?.length) {
  console.error('FATAL: CORS_ORIGINS environment variable is not set.');
  process.exit(1);
}

app.use(morgan('combined'));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
}));

// Proxy auth + identity requests to BaseGeek.
// NOTE: http-proxy-middleware v3 + Express 5 strip the Express mount path
// from req.url before the proxy runs, so we mount at root and use
// `pathFilter` / `pathRewrite` (which see the full original path).
app.use(createProxyMiddleware({
  target: BASEGEEK_URL,
  changeOrigin: true,
  cookieDomainRewrite: { '*': '' },
  pathFilter: '/api/auth',
}));

app.use(createProxyMiddleware({
  target: BASEGEEK_URL,
  changeOrigin: true,
  pathFilter: '/api/me',
  pathRewrite: { '^/api/me': '/api/users/me' },
}));

app.use(createProxyMiddleware({
  target: BASEGEEK_URL,
  changeOrigin: true,
  pathFilter: '/api/users/me',
}));

// Serve static frontend
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// SPA fallback
app.get('/{*path}', (req, res) => {
  return res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DashGeek server running on port ${PORT}`);
});
