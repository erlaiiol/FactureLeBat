import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
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
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(buildWinstonOptions()),
  });
  const config = app.get(ConfigService);

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

  app.use(helmet());
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
