import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequestContext } from '../../logging/request-context';

interface HttpExceptionBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// Catches everything (`@Catch()` with no argument) so no thrown value —
// whether a deliberate HttpException or a genuine bug (a null-pointer deep
// in a service, a Prisma error that slipped through) — ever reaches the
// client, or disappears, without being logged with full context first.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const request = httpContext.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // A deliberate HttpException keeps Nest's own response shape exactly
    // as the throwing code produced it (including class-validator's
    // string[] `message` on a 400) — nothing already reading `error.error`
    // on the frontend should see any difference. Anything else is a real
    // bug: never leak its internals (stack, Prisma error shape, ...) to
    // the client — the full detail still goes to the logs below.
    const rawBody = isHttpException ? exception.getResponse() : undefined;
    const body: HttpExceptionBody =
      typeof rawBody === 'string'
        ? { statusCode: status, message: rawBody }
        : ((rawBody as HttpExceptionBody | undefined) ?? {
            statusCode: status,
            message: 'Internal server error',
          });

    const summary = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    const logPayload = {
      message: `${request.method} ${request.originalUrl} -> ${status} ${summary}`,
    };

    // A 4xx is the caller's fault (bad input, missing resource) — routine,
    // and its message already says what's wrong, so a stack trace would
    // just be noise on every ordinary validation rejection. A 5xx is this
    // app's fault: worth an "error"-level entry with the full stack, since
    // that's the one an operator actually needs to debug.
    if (status >= 500) {
      this.logger.error({
        ...logPayload,
        ...(exception instanceof Error ? { stack: exception.stack } : {}),
      });
    } else {
      this.logger.warn(logPayload);
    }

    response.status(status).json({
      ...body,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: RequestContext.getRequestId(),
    });
  }
}
