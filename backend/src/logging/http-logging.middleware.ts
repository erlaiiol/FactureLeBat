import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

const logger = new Logger('HTTP');

// Sent by the frontend's clientInfoInterceptor on every API call — see
// that file. Untrusted (any caller can set them), so they're only ever
// logged, never used for a decision, and clipped so a hostile value can't
// bloat a log line.
const PLATFORM_HEADER = 'x-app-platform';
const APP_VERSION_HEADER = 'x-app-version';
const MAX_CLIENT_HEADER_LENGTH = 32;

function clientHeader(req: Request, name: string): string | undefined {
  const value = req.get(name);
  return value ? value.slice(0, MAX_CLIENT_HEADER_LENGTH) : undefined;
}

// Who/what made this request — the bare `ip` this line used to carry alone
// made "find every request from this one artisan" impossible (a phone on 4G
// changes IP constantly). `userId` is read at log time, not request start:
// req.user is only populated later, by the global JwtAuthGuard, but it's the
// same req object by the time `finish`/`close` fires.
export function buildHttpLogMeta(req: Request): Record<string, string | undefined> {
  const user = req.user as AuthenticatedUser | undefined;
  return {
    ip: req.ip,
    userId: user?.userId,
    platform: clientHeader(req, PLATFORM_HEADER),
    appVersion: clientHeader(req, APP_VERSION_HEADER),
  };
}

// One line per request, written on `res.on('finish')` so it always carries
// the real status code and total duration — including for requests that
// end in the global exception filter, which runs long before `finish`.
// Level follows the response: a 5xx is this app's fault (error), a 4xx is
// the caller's (warn), everything else is routine (http).
//
// `close` without a prior `finish` = the client hung up before we answered
// (the frontend's 20s timeoutInterceptor giving up on a slow PDF render, the
// app being backgrounded mid-request, a dropped 4G connection). Without this
// branch those requests left no trace at all — exactly the "the artisan says
// it failed but there's nothing in the logs" case.
export function httpLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  const elapsed = () => (Number(process.hrtime.bigint() - startedAt) / 1_000_000).toFixed(1);

  res.on('finish', () => {
    const { statusCode } = res;
    const message = `${req.method} ${req.originalUrl} ${statusCode} ${elapsed()}ms`;
    // Object form, not `logger.error(message, meta)`: Nest's generic
    // Logger only accepts a trailing *string* context on those calls, so
    // structured meta has to travel as extra keys on a { message } object
    // instead — see nest-winston's WinstonLogger.log/warn/error.
    const payload = { message, ...buildHttpLogMeta(req) };

    if (statusCode >= 500) {
      logger.error(payload);
    } else if (statusCode >= 400) {
      logger.warn(payload);
    } else {
      logger.log(payload);
    }
  });

  res.on('close', () => {
    if (res.writableFinished) {
      return;
    }
    logger.warn({
      message: `${req.method} ${req.originalUrl} ABORTED by client after ${elapsed()}ms`,
      ...buildHttpLogMeta(req),
    });
  });

  next();
}
