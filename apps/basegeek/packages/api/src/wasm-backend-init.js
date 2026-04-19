/**
 * WASM Backend Initialization for Docker
 * Forces @xenova/transformers to ONLY use WASM backend
 */

// Set environment before any imports
process.env.ONNX_RUNTIME_WEB_ONLY = '1';

import { env } from '@xenova/transformers';
import logger from './lib/logger.js';

// Force WASM backend - disable native
env.backends.onnx.wasm.numThreads = 1;
env.allowLocalModels = false;
env.useBrowserCache = false;
env.allowRemoteModels = true;
env.useFSCache = true;

logger.info('WASM backend configured (native disabled)');

export { env };