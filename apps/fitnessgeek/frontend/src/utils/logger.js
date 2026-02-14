// Lightweight client-side logger with level control
// Levels: debug < info < warn < error < silent

const env = (import.meta && import.meta.env) || {};
const isDev = Boolean(env?.DEV);

const levelFromEnv = (env?.VITE_LOG_LEVEL || '').toString().toLowerCase();
const levelRank = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

// Default: quieter console by default
// - dev: warn
// - prod: error
const defaultLevel = isDev ? 'warn' : 'error';
const activeLevel = levelFromEnv in levelRank ? levelFromEnv : defaultLevel;
const threshold = levelRank[activeLevel];

const shouldLog = (rank) => rank >= threshold;

const logger = {
  debug: (...args) => shouldLog(levelRank.debug) && console.debug(...args),
  info: (...args) => shouldLog(levelRank.info) && console.info(...args),
  warn: (...args) => shouldLog(levelRank.warn) && console.warn(...args),
  error: (...args) => shouldLog(levelRank.error) && console.error(...args),
};

export default logger;


