import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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
void bootstrap();
