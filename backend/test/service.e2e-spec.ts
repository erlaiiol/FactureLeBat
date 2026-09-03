import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { ServiceProfile } from '../src/service-catalog/entities/service.entity';
import { authedRequest, registerTestUser, TestSession } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Runs against the local dev Postgres, same convention as product.e2e-spec.ts.
// Every request is authenticated as a fresh test artisan (see
// docs/roadmap.md Phase 13); afterAll cleans up via a single
// company.delete() cascade rather than tracking individual service ids.
describe('Service catalog (e2e)', () => {
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

  it('creates, retrieves, updates, lists and searches a service', async () => {
    const createResponse = await authedRequest(app, session)
      .post('/api/services')
      .send({
        name: 'E2E Pose de parquet',
        description: "Main-d'œuvre de pose",
        priceCents: 25000,
        defaultVisibility: 'VISIBLE',
      })
      .expect(201);

    const created = createResponse.body as ServiceProfile;
    expect(created.name).toBe('E2E Pose de parquet');
    expect(created.priceCents).toBe(25000);
    expect(created.defaultVisibility).toBe('VISIBLE');

    const getResponse = await authedRequest(app, session)
      .get(`/api/services/${created.id}`)
      .expect(200);
    expect((getResponse.body as ServiceProfile).id).toBe(created.id);

    const updateResponse = await authedRequest(app, session)
      .patch(`/api/services/${created.id}`)
      .send({
        name: 'E2E Pose de parquet updated',
        priceCents: 26000,
        defaultVisibility: 'REDISTRIBUTED',
      })
      .expect(200);
    expect((updateResponse.body as ServiceProfile).name).toBe('E2E Pose de parquet updated');
    expect((updateResponse.body as ServiceProfile).priceCents).toBe(26000);
    expect((updateResponse.body as ServiceProfile).defaultVisibility).toBe('REDISTRIBUTED');
    expect((updateResponse.body as ServiceProfile).description).toBeNull();

    const searchResponse = await authedRequest(app, session)
      .get('/api/services')
      .query({ search: 'parquet updated' })
      .expect(200);
    const results = searchResponse.body as ServiceProfile[];
    expect(results.some((service) => service.id === created.id)).toBe(true);
  });

  // Phase 1.6: round-trips both margin modes, and the "Marge 30%"
  // pure-markup case (Phase 5) that legitimately declares 100% margin on a
  // PERCENTAGE-priced service with no priceCents to bound against.
  it('creates and updates a service margin, switching mode nulls the unused field', async () => {
    const createResponse = await authedRequest(app, session)
      .post('/api/services')
      .send({
        name: 'E2E Margin Service',
        priceCents: 25000,
        defaultVisibility: 'VISIBLE',
        marginMode: 'NET_AMOUNT',
        marginAmountCents: 10000,
      })
      .expect(201);
    const created = createResponse.body as ServiceProfile;
    expect(created.marginMode).toBe('NET_AMOUNT');
    expect(created.marginAmountCents).toBe(10000);
    expect(created.marginPercentageBasisPoints).toBeNull();

    const updateResponse = await authedRequest(app, session)
      .patch(`/api/services/${created.id}`)
      .send({
        name: 'E2E Margin Service',
        priceCents: 25000,
        defaultVisibility: 'VISIBLE',
        marginMode: 'PERCENTAGE',
        marginPercentageBasisPoints: 7000,
      })
      .expect(200);
    const updated = updateResponse.body as ServiceProfile;
    expect(updated.marginMode).toBe('PERCENTAGE');
    expect(updated.marginPercentageBasisPoints).toBe(7000);
    expect(updated.marginAmountCents).toBeNull();
  });

  it('accepts a pure-markup service: PERCENTAGE pricing with a 100% margin', () => {
    return authedRequest(app, session)
      .post('/api/services')
      .send({
        name: 'E2E Marge 30%',
        pricingMode: 'PERCENTAGE',
        percentageBasisPoints: 3000,
        defaultVisibility: 'REDISTRIBUTED',
        marginMode: 'PERCENTAGE',
        marginPercentageBasisPoints: 10000,
      })
      .expect(201);
  });

  it('rejects a service margin above a FIXED priceCents', () => {
    return authedRequest(app, session)
      .post('/api/services')
      .send({
        name: 'E2E Bad Margin Service',
        priceCents: 1000,
        defaultVisibility: 'VISIBLE',
        marginMode: 'NET_AMOUNT',
        marginAmountCents: 1001,
      })
      .expect(400);
  });

  it('rejects a service with a negative price', () => {
    return authedRequest(app, session)
      .post('/api/services')
      .send({ name: 'Bad Service', priceCents: -100, defaultVisibility: 'VISIBLE' })
      .expect(400);
  });

  it('returns 404 for an unknown service id', () => {
    return authedRequest(app, session)
      .get('/api/services/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('returns 404 when patching an unknown service id, not a raw DB error', () => {
    return authedRequest(app, session)
      .patch('/api/services/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Ghost Service', priceCents: 100, defaultVisibility: 'VISIBLE' })
      .expect(404);
  });
});
