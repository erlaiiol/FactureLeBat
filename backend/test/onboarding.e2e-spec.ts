import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { OnboardingState } from '../src/onboarding/entities/onboarding-state.entity';
import { authedRequest, registerTestUser, TestSession } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Runs against the local dev Postgres, same convention as customer.e2e-spec.ts.
// Onboarding state lives on the Company row belonging to this suite's own
// freshly-registered test artisan (see docs/roadmap.md Phase 13) — no
// longer a shared singleton, so no "restore the default for other suites"
// dance is needed, just the usual company.delete() cleanup.
describe('Onboarding tour state (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    session = await registerTestUser(app);
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: session.companyId } });
    await app.close();
  });

  it('resets, toggles, completes and re-reads onboarding state', async () => {
    await authedRequest(app, session).post('/api/onboarding/reset').expect(201);

    const enabledResponse = await authedRequest(app, session)
      .patch('/api/onboarding')
      .send({ tourEnabled: true })
      .expect(200);
    expect((enabledResponse.body as OnboardingState).tourEnabled).toBe(true);
    expect((enabledResponse.body as OnboardingState).completedTours).toEqual([]);

    const getResponse = await authedRequest(app, session).get('/api/onboarding').expect(200);
    expect(getResponse.body as OnboardingState).toEqual({
      tourEnabled: true,
      completedTours: [],
    });

    const completeResponse = await authedRequest(app, session)
      .post('/api/onboarding/tours/customers/complete')
      .expect(201);
    expect((completeResponse.body as OnboardingState).completedTours).toEqual(['customers']);

    // Completing an already-completed tour is idempotent, not a duplicate entry.
    const repeatCompleteResponse = await authedRequest(app, session)
      .post('/api/onboarding/tours/customers/complete')
      .expect(201);
    expect((repeatCompleteResponse.body as OnboardingState).completedTours).toEqual(['customers']);

    const disableResponse = await authedRequest(app, session)
      .patch('/api/onboarding')
      .send({ tourEnabled: false })
      .expect(200);
    expect((disableResponse.body as OnboardingState).tourEnabled).toBe(false);

    const resetResponse = await authedRequest(app, session)
      .post('/api/onboarding/reset')
      .expect(201);
    expect((resetResponse.body as OnboardingState).completedTours).toEqual([]);
  });

  it('rejects an unknown tour id', () => {
    return authedRequest(app, session)
      .post('/api/onboarding/tours/not-a-real-tour/complete')
      .expect(400);
  });
});
