import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { OnboardingState } from '../src/onboarding/entities/onboarding-state.entity';

// Runs against the local dev Postgres, same convention as customer.e2e-spec.ts.
// Onboarding state lives on the singleton Company row (see company.constants.ts)
// shared with every other e2e suite, so every test here establishes its own
// known baseline via /reset rather than assuming a pristine default.
describe('Onboarding tour state (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    // Leave the shared singleton row in its default state for other suites.
    await request(app.getHttpServer()).post('/api/onboarding/reset');
    await request(app.getHttpServer()).patch('/api/onboarding').send({ tourEnabled: true });
    await app.close();
  });

  it('resets, toggles, completes and re-reads onboarding state', async () => {
    await request(app.getHttpServer()).post('/api/onboarding/reset').expect(201);

    const enabledResponse = await request(app.getHttpServer())
      .patch('/api/onboarding')
      .send({ tourEnabled: true })
      .expect(200);
    expect((enabledResponse.body as OnboardingState).tourEnabled).toBe(true);
    expect((enabledResponse.body as OnboardingState).completedTours).toEqual([]);

    const getResponse = await request(app.getHttpServer()).get('/api/onboarding').expect(200);
    expect(getResponse.body as OnboardingState).toEqual({
      tourEnabled: true,
      completedTours: [],
    });

    const completeResponse = await request(app.getHttpServer())
      .post('/api/onboarding/tours/customers/complete')
      .expect(201);
    expect((completeResponse.body as OnboardingState).completedTours).toEqual(['customers']);

    // Completing an already-completed tour is idempotent, not a duplicate entry.
    const repeatCompleteResponse = await request(app.getHttpServer())
      .post('/api/onboarding/tours/customers/complete')
      .expect(201);
    expect((repeatCompleteResponse.body as OnboardingState).completedTours).toEqual(['customers']);

    const disableResponse = await request(app.getHttpServer())
      .patch('/api/onboarding')
      .send({ tourEnabled: false })
      .expect(200);
    expect((disableResponse.body as OnboardingState).tourEnabled).toBe(false);

    const resetResponse = await request(app.getHttpServer())
      .post('/api/onboarding/reset')
      .expect(201);
    expect((resetResponse.body as OnboardingState).completedTours).toEqual([]);
  });

  it('rejects an unknown tour id', () => {
    return request(app.getHttpServer())
      .post('/api/onboarding/tours/not-a-real-tour/complete')
      .expect(400);
  });
});
