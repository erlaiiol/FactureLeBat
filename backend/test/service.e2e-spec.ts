import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { ServiceProfile } from '../src/service-catalog/entities/service.entity';

// Runs against the local dev Postgres, same convention as product.e2e-spec.ts.
// There's no DELETE endpoint (not in this phase's roadmap scope), so cleanup
// goes straight through Prisma to keep the dev database free of test rows
// across repeated runs.
describe('Service catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdServiceIds: string[] = [];

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
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await app.close();
  });

  it('creates, retrieves, updates, lists and searches a service', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/services')
      .send({
        name: 'E2E Pose de parquet',
        description: "Main-d'œuvre de pose",
        priceCents: 25000,
        defaultVisibility: 'VISIBLE',
      })
      .expect(201);

    const created = createResponse.body as ServiceProfile;
    createdServiceIds.push(created.id);
    expect(created.name).toBe('E2E Pose de parquet');
    expect(created.priceCents).toBe(25000);
    expect(created.defaultVisibility).toBe('VISIBLE');

    const getResponse = await request(app.getHttpServer())
      .get(`/api/services/${created.id}`)
      .expect(200);
    expect((getResponse.body as ServiceProfile).id).toBe(created.id);

    const updateResponse = await request(app.getHttpServer())
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

    const searchResponse = await request(app.getHttpServer())
      .get('/api/services')
      .query({ search: 'parquet updated' })
      .expect(200);
    const results = searchResponse.body as ServiceProfile[];
    expect(results.some((service) => service.id === created.id)).toBe(true);
  });

  it('rejects a service with a negative price', () => {
    return request(app.getHttpServer())
      .post('/api/services')
      .send({ name: 'Bad Service', priceCents: -100, defaultVisibility: 'VISIBLE' })
      .expect(400);
  });

  it('returns 404 for an unknown service id', () => {
    return request(app.getHttpServer())
      .get('/api/services/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('returns 404 when patching an unknown service id, not a raw DB error', () => {
    return request(app.getHttpServer())
      .patch('/api/services/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Ghost Service', priceCents: 100, defaultVisibility: 'VISIBLE' })
      .expect(404);
  });
});
