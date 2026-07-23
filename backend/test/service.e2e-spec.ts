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
