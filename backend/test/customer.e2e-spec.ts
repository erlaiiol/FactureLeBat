import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CustomerProfile } from '../src/customer/entities/customer.entity';

// Runs against the local dev Postgres, same convention as invoice.e2e-spec.ts.
// There's no DELETE endpoint (not in this phase's roadmap scope), so cleanup
// goes straight through Prisma to keep the dev database free of test rows
// across repeated runs.
describe('Customer pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdCustomerIds: string[] = [];

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
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await app.close();
  });

  it('creates, retrieves, updates, lists and searches a customer', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/customers')
      .send({ name: 'E2E Dupont', address: '5 avenue des Clients', phone: '0600000000' })
      .expect(201);

    const created = createResponse.body as CustomerProfile;
    createdCustomerIds.push(created.id);
    expect(created.name).toBe('E2E Dupont');
    expect(created.companyName).toBeNull();

    const getResponse = await request(app.getHttpServer())
      .get(`/api/customers/${created.id}`)
      .expect(200);
    expect((getResponse.body as CustomerProfile).id).toBe(created.id);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/customers/${created.id}`)
      .send({ name: 'E2E Dupont Updated', companyName: 'Dupont SARL' })
      .expect(200);
    expect((updateResponse.body as CustomerProfile).name).toBe('E2E Dupont Updated');
    expect((updateResponse.body as CustomerProfile).companyName).toBe('Dupont SARL');

    const searchResponse = await request(app.getHttpServer())
      .get('/api/customers')
      .query({ search: 'dupont updated' })
      .expect(200);
    const results = searchResponse.body as CustomerProfile[];
    expect(results.some((customer) => customer.id === created.id)).toBe(true);
  });

  it('returns 404 for an unknown customer id', () => {
    return request(app.getHttpServer())
      .get('/api/customers/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  // Regression test for the update() TOCTOU fix: not-found is now reported
  // by catching Prisma's own P2025 from the write itself, not a separate
  // findById pre-check — this exercises exactly that code path.
  it('returns 404 when patching an unknown customer id, not a raw DB error', () => {
    return request(app.getHttpServer())
      .patch('/api/customers/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Ghost Customer' })
      .expect(404);
  });
});
