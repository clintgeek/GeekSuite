import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Env first, then the app: ESM hoists static imports, so the modules that
// read env are loaded dynamically below, after dotenv has run. In production
// compose's env_file already set everything; this is for .env.local in dev.
// Both files are optional (dotenv ignores a missing one).
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const { default: logger } = await import('./src/lib/logger.js');
const { installShutdownHooks } = await import('@geeksuite/logger');
const { default: createApp } = await import('./src/app.js');

const PORT = Number(process.env.PORT) || 1840;

const app = createApp();

// Created up front so the shutdown hooks always have a server to close, even
// if a signal arrives before listen(). No database, so nothing else to close.
const server = http.createServer(app);

installShutdownHooks(logger, server);

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`GeekDay server running on port ${PORT}`);
});
