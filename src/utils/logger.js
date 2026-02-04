import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, errors, json } = format;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  const logMessage = `[${timestamp}] [${level}]: ${stack || message}`;
  return logMessage;
});

// Create logger instance
const logger = createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'titan-bot' },
  transports: [
    // Write all logs with level `error` and below to `error.log`
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
    // Write all logs with level `info` and below to `combined.log`
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/combined-%DATE%.log'),
      maxSize: '20m',
      maxFiles: '7d',
      zippedArchive: true,
    }),
  ],
  // Handle exceptions and rejections
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

// If we're not in production, also log to console with colors
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
    level: 'debug',
  }));
} else {
  // In production, only log warnings and errors to console
  logger.add(new transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
    level: 'warn',
  }));
}

// Create a stream for morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

export { logger };

export default logger;
