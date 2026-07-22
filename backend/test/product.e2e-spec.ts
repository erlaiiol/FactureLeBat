import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { ProductProfile } from '../src/product/entities/product.entity';

// Runs against the local dev Postgres, same convention as customer.e2e-spec.ts.
// There's no DELETE endpoint (not in this phase's roadmap scope), so cleanup
// goes straight through Prisma to keep the dev database free of test rows
// across repeated runs.
describe('Product pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdProductIds: string[] = [];

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
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await app.close();
  });

  it('creates, retrieves, updates, lists and searches a product', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/products')
      .send({
        name: 'E2E Parquet chene massif',
        unit: 'm2',
        priceCents: 4500,
        supplierName: 'E2E Supplier',
        supplierUrl: 'https://supplier.example.com/parquet-chene',
      })
      .expect(201);

    const created = createResponse.body as ProductProfile;
    createdProductIds.push(created.id);
    expect(created.name).toBe('E2E Parquet chene massif');
    expect(created.priceCents).toBe(4500);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/products/${created.id}`)
      .expect(200);
    expect((getResponse.body as ProductProfile).id).toBe(created.id);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/products/${created.id}`)
      .send({ name: 'E2E Parquet chene massif updated', unit: 'm2', priceCents: 4800 })
      .expect(200);
    expect((updateResponse.body as ProductProfile).name).toBe('E2E Parquet chene massif updated');
    expect((updateResponse.body as ProductProfile).priceCents).toBe(4800);
    expect((updateResponse.body as ProductProfile).supplierName).toBeNull();

    const searchResponse = await request(app.getHttpServer())
      .get('/api/products')
      .query({ search: 'parquet chene massif updated' })
      .expect(200);
    const results = searchResponse.body as ProductProfile[];
    expect(results.some((product) => product.id === created.id)).toBe(true);
  });

  it('rejects a product with an invalid supplier URL', () => {
    return request(app.getHttpServer())
      .post('/api/products')
      .send({
        name: 'Bad Supplier Product',
        unit: 'unite',
        priceCents: 100,
        supplierUrl: 'not-a-url',
      })
      .expect(400);
  });

  it('returns 404 for an unknown product id', () => {
    return request(app.getHttpServer())
      .get('/api/products/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  // Regression test for the update() TOCTOU fix: not-found is now reported
  // by catching Prisma's own P2025 from the write itself, not a separate
  // findById pre-check — this exercises exactly that code path.
  it('returns 404 when patching an unknown product id, not a raw DB error', () => {
    return request(app.getHttpServer())
      .patch('/api/products/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Ghost Product', unit: 'unite', priceCents: 100 })
      .expect(404);
  });

  describe('POST /products/import', () => {
    // example.com is IANA-reserved specifically for use in documentation
    // and testing — stable, always reachable, and a safe real network
    // target for an end-to-end check of the whole fetch pipeline (real DNS
    // resolution through the SSRF-safe lookup, real TCP connect, real
    // parsing), which no isolated unit test can exercise together.
    it('imports a draft from a reachable public URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/products/import')
        .send({ url: 'https://example.com' })
        .expect(201);

      const draft = response.body as { name: string | null; supplierUrl: string };
      expect(draft.supplierUrl).toBe('https://example.com');
      expect(draft.name).toBeTruthy();
    });

    it('rejects a malformed URL before attempting any network call', () => {
      return request(app.getHttpServer())
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
      return request(app.getHttpServer()).post('/api/products/import').send({ url }).expect(400);
    });
  });
});
