import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTraceContext } from './traceContext.js';

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

const pendingInvalidLevelWarning = requestedLogLevel && !validLogLevels.has(requestedLogLevel)
  ? `[logger] Invalid LOG_LEVEL "${process.env.LOG_LEVEL}". Falling back to "${defaultLogLevel}".`
  : null;

const shouldPromoteUserFacingLogs = process.env.NODE_ENV === 'production' && resolvedLogLevel === 'warn';

const LOG_SCHEMA_DEFAULTS = Object.freeze({
  event: 'application.log',
  guildId: null,
  userId: null,
  command: null,
  errorCode: null,
  traceId: null,
});

const logFormat = printf(({ level, message, timestamp, stack, displayLevel }) => {
  const visibleLevel = displayLevel || level;
  const logMessage = `[${timestamp}] [${visibleLevel}]: ${stack || message}`;
  return logMessage;
});

const attachTraceContext = format((info) => {
  const traceContext = getTraceContext();
  if (!traceContext) {
    return info;
  }

  info.traceId = info.traceId || traceContext.traceId;
  info.guildId = info.guildId || traceContext.guildId;
  info.userId = info.userId || traceContext.userId;
  info.command = info.command || traceContext.command;
  info.interactionId = info.interactionId || traceContext.interactionId;

  return info;
});

function deriveErrorCode(info) {
  if (info.errorCode) {
    return info.errorCode;
  }

  if (typeof info.code === 'string' || typeof info.code === 'number') {
    return String(info.code);
  }

  if (typeof info.type === 'string') {
    return info.type;
  }

  if (info.error && (typeof info.error.code === 'string' || typeof info.error.code === 'number')) {
    return String(info.error.code);
  }

  return null;
}

function normalizeEvent(info) {
  if (typeof info.event === 'string' && info.event.trim()) {
    return info.event;
  }

  const displayLevel = typeof info.displayLevel === 'string' ? info.displayLevel.toLowerCase().trim() : null;
  if (displayLevel === 'startup') {
    return 'system.startup';
  }

  if (displayLevel === 'status') {
    return 'system.status';
  }

  return `log.${info.level || 'info'}`;
}

const enforceLogSchema = format((info) => {
  info.event = normalizeEvent(info);
  info.guildId = info.guildId ?? LOG_SCHEMA_DEFAULTS.guildId;
  info.userId = info.userId ?? LOG_SCHEMA_DEFAULTS.userId;
  info.command = info.command ?? LOG_SCHEMA_DEFAULTS.command;
  info.traceId = info.traceId ?? LOG_SCHEMA_DEFAULTS.traceId;
  info.errorCode = deriveErrorCode(info);
  return info;
});

const logger = createLogger({
  level: resolvedLogLevel,
  format: combine(
    attachTraceContext(),
    enforceLogSchema(),
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

if (pendingInvalidLevelWarning) {
  logger.warn(pendingInvalidLevelWarning);
}

function startupLog(message) {
  if (shouldPromoteUserFacingLogs) {
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

function shutdownLog(message) {
  if (shouldPromoteUserFacingLogs) {
    logger.log({
      level: 'warn',
      message,
      displayLevel: 'status',
    });
    return;
  }

  logger.log({
    level: 'info',
    message,
    displayLevel: 'status',
  });
}

export { logger, startupLog, shutdownLog };

export default logger;


