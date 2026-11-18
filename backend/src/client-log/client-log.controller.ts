import { Body, Controller, HttpCode, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateClientLogDto } from './dto/create-client-log.dto';

// Client-side failures the server can't see on its own: a request that
// never reached it (status 0 — offline, TLS, CORS, the app's own 20s
// timeout), or a session check that came back "logged out" on app resume.
// The frontend buffers these and flushes them once the network works again
// (see the frontend's ClientLogService), so they land here — tagged with
// the caller's userId whenever their access cookie is still valid — even
// when the original failure itself never did.
//
// Public on purpose: the most interesting reports come from someone whose
// session just broke. Write-only, length-capped by the DTO, tightly
// throttled, and only ever logged (never stored or acted on).
@Controller('client-logs')
export class ClientLogController {
  private readonly logger = new Logger('Client');

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @HttpCode(204)
  report(@Body() dto: CreateClientLogDto, @Req() req: Request): void {
    const user = req.user as AuthenticatedUser | undefined;
    for (const event of dto.events) {
      const target = event.url ? ` ${event.method ?? ''} ${event.url}`.trimEnd() : '';
      const status = event.status !== undefined ? ` status=${event.status}` : '';
      this.logger.warn({
        message: `${event.kind}${target}${status}${event.message ? ` — ${event.message}` : ''}`,
        userId: user?.userId,
        platform: dto.platform,
        appVersion: dto.appVersion,
        failedRequestId: event.requestId,
        durationMs: event.durationMs,
        at: event.at,
      });
    }
  }
}
