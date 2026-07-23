import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { CustomerProfile } from '../src/customer/entities/customer.entity';
import { authedRequest, registerTestUser, TestSession } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Runs against the local dev Postgres, same convention as invoice.e2e-spec.ts.
// Every request is authenticated as a fresh test artisan (see
// docs/roadmap.md Phase 13 — JwtAuthGuard is global); afterAll cleans up via
// a single company.delete() cascade rather than tracking individual rows.
describe('Customer pipeline (e2e)', () => {
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

  it('creates, retrieves, updates, lists and searches a customer', async () => {
    const createResponse = await authedRequest(app, session)
      .post('/api/customers')
      .send({ name: 'E2E Dupont', address: '5 avenue des Clients', phone: '0600000000' })
      .expect(201);

    const created = createResponse.body as CustomerProfile;
    expect(created.name).toBe('E2E Dupont');
    expect(created.companyName).toBeNull();

    const getResponse = await authedRequest(app, session)
      .get(`/api/customers/${created.id}`)
      .expect(200);
    expect((getResponse.body as CustomerProfile).id).toBe(created.id);

    const updateResponse = await authedRequest(app, session)
      .patch(`/api/customers/${created.id}`)
      .send({ name: 'E2E Dupont Updated', companyName: 'Dupont SARL' })
      .expect(200);
    expect((updateResponse.body as CustomerProfile).name).toBe('E2E Dupont Updated');
    expect((updateResponse.body as CustomerProfile).companyName).toBe('Dupont SARL');

    const searchResponse = await authedRequest(app, session)
      .get('/api/customers')
      .query({ search: 'dupont updated' })
      .expect(200);
    const results = searchResponse.body as CustomerProfile[];
    expect(results.some((customer) => customer.id === created.id)).toBe(true);
  });

  it('returns 404 for an unknown customer id', () => {
    return authedRequest(app, session)
      .get('/api/customers/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  // Regression test for the update() TOCTOU fix: not-found is now reported
  // by catching the repository's NoRowsAffectedError from the write itself,
  // not a separate findById pre-check — this exercises exactly that code path.
  it('returns 404 when patching an unknown customer id, not a raw DB error', () => {
    return authedRequest(app, session)
      .patch('/api/customers/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Ghost Customer' })
      .expect(404);
  });
});
