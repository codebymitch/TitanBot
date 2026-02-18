import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, errors, json } = format;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const validLogLevels = new Set(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']);
const defaultLogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
const logLevelAliases = {
  warning: 'warn',
  warnings: 'warn',
  warns: 'warn',
  err: 'error',
  information: 'info',
};
const rawRequestedLogLevel = process.env.LOG_LEVEL?.toLowerCase().trim();
const requestedLogLevel = logLevelAliases[rawRequestedLogLevel] || rawRequestedLogLevel;

const resolvedLogLevel = validLogLevels.has(requestedLogLevel)
  ? requestedLogLevel
  : defaultLogLevel;

if (requestedLogLevel && !validLogLevels.has(requestedLogLevel)) {
  console.warn(
    `[logger] Invalid LOG_LEVEL "${process.env.LOG_LEVEL}". Falling back to "${defaultLogLevel}".`
  );
}

const shouldPromoteStartupLogs = process.env.NODE_ENV === 'production' && resolvedLogLevel === 'warn';

const logFormat = printf(({ level, message, timestamp, stack, displayLevel }) => {
  const visibleLevel = displayLevel || level;
  const logMessage = `[${timestamp}] [${visibleLevel}]: ${stack || message}`;
  return logMessage;
});

const logger = createLogger({
  level: resolvedLogLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'titan-bot' },
  transports: [
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/combined-%DATE%.log'),
      maxSize: '20m',
      maxFiles: '7d',
      zippedArchive: true,
    }),
  ],
  exceptionHandlers: [
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/exceptions-%DATE%.log'),
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
  rejectionHandlers: [
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/rejections-%DATE%.log'),
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
    level: resolvedLogLevel,
  }));
} else {
  logger.add(new transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
    level: resolvedLogLevel,
  }));
}

logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

function startupLog(message) {
  if (shouldPromoteStartupLogs) {
    logger.log({
      level: 'warn',
      message,
      displayLevel: 'startup',
    });
    return;
  }

  logger.log({
    level: 'info',
    message,
    displayLevel: 'startup',
  });
}

export { logger, startupLog };

export default logger;


