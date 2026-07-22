import * as path from 'node:path';
import { transports, type LoggerOptions } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { coloredLineFormat } from './logging.format';

export const LOG_LEVELS = ['error', 'warn', 'info', 'http', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_DIR = path.resolve(process.cwd(), 'logs');

// Built directly from `process.env` (not `ConfigService`) because this runs
// before Nest's DI container exists — it's handed to `NestFactory.create()`
// as the `logger` option, so it has to be ready before the app itself is.
// Same bootstrap-time exception as `import 'dotenv/config'` in main.ts.
export function buildWinstonOptions(): LoggerOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const level = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

  return {
    levels: { error: 0, warn: 1, info: 2, http: 3, debug: 4 },
    level,
    format: coloredLineFormat,
    transports: [
      new transports.Console(),

      // Everything at the configured level and above — the day-to-day
      // "what has the app been doing" file, rotated so a forgotten
      // artisan-scale VPS never fills its disk from logs alone.
      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: 'combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
      }),

      // Errors only, kept longer — the file an operator greps first when
      // something broke, without wading through routine request logs.
      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: '20m',
        maxFiles: '30d',
      }),
    ],
    // A malformed log call (e.g. a circular object passed as meta) must
    // never take the process down — logging is a side channel, not a
    // business-critical path.
    exitOnError: false,
  };
}
