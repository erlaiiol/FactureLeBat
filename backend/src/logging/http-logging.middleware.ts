import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

// One line per request, written on `res.on('finish')` so it always carries
// the real status code and total duration — including for requests that
// end in the global exception filter, which runs long before `finish`.
// Level follows the response: a 5xx is this app's fault (error), a 4xx is
// the caller's (warn), everything else is routine (http).
export function httpLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const { statusCode } = res;
    const message = `${req.method} ${req.originalUrl} ${statusCode} ${durationMs.toFixed(1)}ms`;
    // Object form, not `logger.error(message, meta)`: Nest's generic
    // Logger only accepts a trailing *string* context on those calls, so
    // structured meta has to travel as extra keys on a { message } object
    // instead — see nest-winston's WinstonLogger.log/warn/error.
    const payload = { message, ip: req.ip };

    if (statusCode >= 500) {
      logger.error(payload);
    } else if (statusCode >= 400) {
      logger.warn(payload);
    } else {
      logger.log(payload);
    }
  });

  next();
}
