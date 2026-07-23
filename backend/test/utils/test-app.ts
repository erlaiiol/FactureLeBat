import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

// Every e2e spec builds its Nest app directly from AppModule rather than
// running the real main.ts bootstrap() — which means anything bootstrap()
// wires up (setGlobalPrefix, the global ValidationPipe, and now
// cookie-parser) has to be replicated here too, or it silently never
// applies. Missing cookie-parser specifically means req.cookies is always
// undefined, so JwtStrategy's cookie extractor never finds the access
// token and every authenticated request 401s regardless of how correct the
// test's own Cookie header is — this is what actually broke every e2e spec
// when Phase 13's global JwtAuthGuard first landed.
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.use(cookieParser());
  await app.init();
  return app;
}
