import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { CompanyProfile } from '../src/company/entities/company.entity';
import { OnboardingState } from '../src/onboarding/entities/onboarding-state.entity';
import { LegalStatusConfirmation } from '../src/onboarding/entities/legal-status-confirmation.entity';
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

  // First-invoice-pipeline reversal: the one-time VAT-regime confirmation
  // that replaces the old blocking "Mon entreprise" gate — see
  // docs/roadmap.md's phase for this and InvoiceDraftStore.vatRegimeConfirmed.
  it('confirms legal status, stamping legalStatusConfirmedAt and updating the rate only when sent', async () => {
    const before = await authedRequest(app, session).get('/api/company').expect(200);
    expect((before.body as CompanyProfile).legalStatusConfirmedAt).toBeNull();

    const microResponse = await authedRequest(app, session)
      .post('/api/onboarding/confirm-legal-status')
      .send({ legalStatus: 'MICRO_ENTREPRENEUR' })
      .expect(201);
    expect((microResponse.body as LegalStatusConfirmation).legalStatus).toBe('MICRO_ENTREPRENEUR');
    expect((microResponse.body as LegalStatusConfirmation).legalStatusConfirmedAt).not.toBeNull();
    // vatRateBasisPoints omitted -> left at its existing default, not reset.
    expect((microResponse.body as LegalStatusConfirmation).vatRateBasisPoints).toBe(2000);

    const persisted = await authedRequest(app, session).get('/api/company').expect(200);
    expect((persisted.body as CompanyProfile).legalStatusConfirmedAt).not.toBeNull();

    const companyResponse = await authedRequest(app, session)
      .post('/api/onboarding/confirm-legal-status')
      .send({ legalStatus: 'COMPANY', vatRateBasisPoints: 1000 })
      .expect(201);
    expect((companyResponse.body as LegalStatusConfirmation).legalStatus).toBe('COMPANY');
    expect((companyResponse.body as LegalStatusConfirmation).vatRateBasisPoints).toBe(1000);
  });

  it('rejects an invalid legal status or out-of-range VAT rate', async () => {
    await authedRequest(app, session)
      .post('/api/onboarding/confirm-legal-status')
      .send({ legalStatus: 'NOT_A_REAL_STATUS' })
      .expect(400);

    await authedRequest(app, session)
      .post('/api/onboarding/confirm-legal-status')
      .send({ legalStatus: 'COMPANY', vatRateBasisPoints: 20000 })
      .expect(400);
  });
});
