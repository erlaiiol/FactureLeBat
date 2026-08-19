import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { WinstonModule } from 'nest-winston';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { httpLoggingMiddleware } from './logging/http-logging.middleware';
import { requestIdMiddleware } from './logging/request-id.middleware';
import { buildWinstonOptions } from './logging/winston.config';

async function bootstrap() {
  // Installed as `logger` right at creation (not `app.useLogger()` after)
  // so bootstrap-time logs — module init, route mapping — go through it
  // too, not just request-time logs.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger(buildWinstonOptions()),
    // Phase 14: exposes req.rawBody (the exact, untouched request bytes)
    // alongside Nest's normal JSON-parsed req.body — BillingController's
    // webhook route needs the raw bytes to verify Stripe's signature
    // (StripeClientService.constructWebhookEvent), since re-serializing the
    // already-parsed body is not guaranteed byte-identical to what Stripe
    // actually signed.
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Without this, Express's req.ip (what ThrottlerGuard keys its per-IP
  // buckets on) is always the immediate socket peer — nginx's container IP
  // in prod, the *same* value for every real visitor — so the login/
  // forgot-password throttles would collapse into one shared bucket instead
  // of actually isolating abusive IPs. `2` is the exact hop count of prod's
  // topology (see docs/deployment.md#topology): Caddy sets X-Forwarded-For
  // to the true client IP, nginx appends its own peer (Caddy) on top, so
  // Express must trust exactly 2 hops to unwrap back to the real visitor.
  // Bump to 3 (and see docs/deployment.md's Cloudflare section) if a proxy
  // ever gets added in front of Caddy — an unchanged value there would trust
  // one hop too few and key throttling on Cloudflare's edge IP instead.
  app.set('trust proxy', 2);

  // Order matters: request-id must run before anything else logs, and
  // http-logging must wrap the entire stack (including the exception
  // filter) to report the real final status code and total duration.
  app.use(requestIdMiddleware);
  app.use(httpLoggingMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter());

  // Without this, Nest never listens for SIGTERM/SIGINT, so OnModuleDestroy
  // hooks (PrismaService's $disconnect, SafeFetcherService's Agent.close)
  // never run on a real shutdown — only when app.close() is called directly
  // (e.g. in tests). A `docker stop`/redeploy would otherwise kill the
  // process mid-request instead of draining connections cleanly.
  app.enableShutdownHooks();

  // helmet's default Cross-Origin-Resource-Policy: same-origin blocks a
  // browser from loading any resource (an <img src>, notably
  // CompanyService.logoUrl/InvoiceService.signatureUrl) served by this API
  // from a page on a different origin — correct and left alone in prod
  // (Caddy/nginx proxy this API under the page's own origin, see
  // infra/Caddyfile) and the Capacitor bundle (capacitor.config.ts's
  // server.hostname trick, same reasoning), but it also silently blocks
  // those same images in local dev, where Angular (:4200) and Nest (:3000)
  // are genuinely different origins (same reasoning as enableCors below).
  // Same isProduction convention as PrismaService/AuthController.
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: isProduction ? 'same-origin' : 'cross-origin' },
    }),
  );
  // Phase 13: JwtStrategy/CsrfGuard read cookies off the request — without
  // this middleware req.cookies is always undefined.
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? 'http://localhost:4200',
    // Phase 13: auth cookies must be allowed to travel cross-origin in dev
    // (Angular on :4200, Nest on :3000 — different origins for CORS
    // purposes even though both are "localhost", see architecture.md) —
    // without this, the browser silently drops Set-Cookie on the response
    // and every login appears to succeed but never actually persists.
    credentials: true,
  });

  await app.listen(config.get<number>('PORT', 3000));
}

// Registered before bootstrap() runs, so even a crash during startup itself
// (a bad DB connection string, a Prisma adapter failure) is logged instead
// of silently dumping a raw stack to an unstructured stderr. The process is
// left in an undefined state after either event — per this app's own
// Reliability-first priority order (development-rules.md), it exits loudly
// rather than limping on. The short delay gives the winston file transports
// (async stream writes) a chance to flush before the process disappears.
const processLogger = new Logger('Process');

process.on('uncaughtException', (error) => {
  processLogger.error({ message: 'Uncaught exception — terminating', stack: error.stack });
  setTimeout(() => process.exit(1), 200);
});

process.on('unhandledRejection', (reason) => {
  const stack = reason instanceof Error ? reason.stack : String(reason);
  processLogger.error({ message: 'Unhandled promise rejection — terminating', stack });
  setTimeout(() => process.exit(1), 200);
});

void bootstrap();
