import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { ProductProfile } from '../src/product/entities/product.entity';
import { authedRequest, registerTestUser, TestSession } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Runs against the local dev Postgres, same convention as customer.e2e-spec.ts.
// Every request is authenticated as a fresh test artisan (see
// docs/roadmap.md Phase 13); afterAll cleans up via a single
// company.delete() cascade rather than tracking individual product ids.
describe('Product pipeline (e2e)', () => {
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

  it('creates, retrieves, updates, lists and searches a product', async () => {
    const createResponse = await authedRequest(app, session)
      .post('/api/products')
      .send({
        name: 'E2E Parquet chene massif',
        unit: 'SQUARE_METER',
        priceCents: 4500,
        supplierName: 'E2E Supplier',
        supplierUrl: 'https://supplier.example.com/parquet-chene',
        packagingQuantity: 9,
      })
      .expect(201);

    const created = createResponse.body as ProductProfile;
    expect(created.name).toBe('E2E Parquet chene massif');
    expect(created.priceCents).toBe(4500);
    expect(created.packagingQuantity).toBe('9');

    const getResponse = await authedRequest(app, session)
      .get(`/api/products/${created.id}`)
      .expect(200);
    expect((getResponse.body as ProductProfile).id).toBe(created.id);

    const updateResponse = await authedRequest(app, session)
      .patch(`/api/products/${created.id}`)
      .send({ name: 'E2E Parquet chene massif updated', unit: 'SQUARE_METER', priceCents: 4800 })
      .expect(200);
    expect((updateResponse.body as ProductProfile).name).toBe('E2E Parquet chene massif updated');
    expect((updateResponse.body as ProductProfile).priceCents).toBe(4800);
    expect((updateResponse.body as ProductProfile).supplierName).toBeNull();
    // Same "full replace" PATCH contract as supplierName above — omitting
    // packagingQuantity clears it rather than leaving the old value in place.
    expect((updateResponse.body as ProductProfile).packagingQuantity).toBeNull();

    const searchResponse = await authedRequest(app, session)
      .get('/api/products')
      .query({ search: 'parquet chene massif updated' })
      .expect(200);
    const results = searchResponse.body as ProductProfile[];
    expect(results.some((product) => product.id === created.id)).toBe(true);
  });

  it('rejects a product with an invalid supplier URL', () => {
    return authedRequest(app, session)
      .post('/api/products')
      .send({
        name: 'Bad Supplier Product',
        unit: 'UNIT',
        priceCents: 100,
        supplierUrl: 'not-a-url',
      })
      .expect(400);
  });

  it('returns 404 for an unknown product id', () => {
    return authedRequest(app, session)
      .get('/api/products/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  // Regression test for the update() TOCTOU fix: not-found is now reported
  // by catching the repository's NoRowsAffectedError from the write itself,
  // not a separate findById pre-check — this exercises exactly that code path.
  it('returns 404 when patching an unknown product id, not a raw DB error', () => {
    return authedRequest(app, session)
      .patch('/api/products/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Ghost Product', unit: 'UNIT', priceCents: 100 })
      .expect(404);
  });

  describe('POST /products/import', () => {
    // example.com is IANA-reserved specifically for use in documentation
    // and testing — stable, always reachable, and a safe real network
    // target for an end-to-end check of the whole fetch pipeline (real DNS
    // resolution through the SSRF-safe lookup, real TCP connect, real
    // parsing), which no isolated unit test can exercise together.
    it('imports a draft from a reachable public URL', async () => {
      const response = await authedRequest(app, session)
        .post('/api/products/import')
        .send({ url: 'https://example.com' })
        .expect(201);

      const draft = response.body as { name: string | null; supplierUrl: string };
      expect(draft.supplierUrl).toBe('https://example.com');
      expect(draft.name).toBeTruthy();
    });

    it('rejects a malformed URL before attempting any network call', () => {
      return authedRequest(app, session)
        .post('/api/products/import')
        .send({ url: 'not-a-url' })
        .expect(400);
    });

    // The core SSRF regression test: confirms the protection holds through
    // the real HTTP layer (DTO -> controller -> service -> SafeFetcherService
    // -> real DNS lookup), not just against the isolated isBlockedIp unit
    // tests in ip-guard.spec.ts.
    it.each([
      ['http://127.0.0.1:1/', 'IPv4 loopback'],
      ['http://localhost:1/', 'localhost'],
      ['http://169.254.169.254/latest/meta-data/', 'cloud metadata address'],
    ])('rejects a request targeting a blocked address: %s (%s)', (url) => {
      return authedRequest(app, session).post('/api/products/import').send({ url }).expect(400);
    });
  });
});
