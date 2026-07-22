import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context';

const REQUEST_ID_HEADER = 'x-request-id';

// Reuses an inbound x-request-id if a reverse proxy (Caddy/Nginx) or a
// caller already set one, so a request can be traced across the whole
// chain rather than getting a new id at every hop. Runs first in the
// middleware stack (see main.ts) so every log line for this request —
// including ones written deep inside a service via AsyncLocalStorage,
// with no access to `req` — carries the same id.
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers[REQUEST_ID_HEADER] as string | undefined) ?? randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);

  RequestContext.run({ requestId }, () => next());
}
