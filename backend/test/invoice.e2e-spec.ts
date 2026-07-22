import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { InvoiceWithTotals } from '../src/invoice/entities/invoice.entity';

// Runs against the local dev Postgres (same DATABASE_URL as `npm run start:dev`):
// this is a local sanity check for the full pipeline, not an isolated CI gate,
// so it creates real rows rather than requiring a dedicated test database.
// Created invoices/customers are tracked and deleted in afterAll so repeated
// runs don't accumulate test data (invoice numbering itself is NOT rolled
// back — Company.nextInvoiceNumber is shared, real, persistent state).
describe('Invoice pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdInvoiceIds: string[] = [];
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
    // Invoice -> InvoiceLine cascades (onDelete: Cascade in schema.prisma),
    // so deleting the invoices is enough to also clear their lines.
    await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await app.close();
  });

  it('creates an invoice, computes its totals, and generates a downloadable PDF', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/invoices')
      .send({
        customerName: 'E2E Test Customer',
        lines: [
          {
            description: 'Parquet chene massif pose',
            unit: 'm2',
            mode: 'AREA',
            quantity: 10,
            unitPriceCents: 4500,
            wasteSurcharge: 'TEN',
          },
          {
            description: 'Plinthes',
            unit: 'unite',
            mode: 'UNIT',
            quantity: 5,
            unitPriceCents: 800,
          },
        ],
      })
      .expect(201);

    const created = createResponse.body as InvoiceWithTotals;
    createdInvoiceIds.push(created.id);
    expect(created.number).toMatch(/^F-\d{6}$/);
    // 10 m2 * 1.10 waste = 11 m2 * 4500 cents = 49500; 5 * 800 = 4000
    expect(created.subtotalExclVatCents).toBe(49500 + 4000);
    expect(created.totalInclVatCents).toBe(created.subtotalExclVatCents + created.vatAmountCents);

    const invoiceId = created.id;

    const getResponse = await request(app.getHttpServer())
      .get(`/api/invoices/${invoiceId}`)
      .expect(200);
    const fetched = getResponse.body as InvoiceWithTotals;
    expect(fetched.id).toBe(invoiceId);
    expect(fetched.lines).toHaveLength(2);

    const pdfResponse = await request(app.getHttpServer())
      .get(`/api/invoices/${invoiceId}/pdf`)
      .expect(200);
    expect(pdfResponse.headers['content-type']).toBe('application/pdf');
    expect((pdfResponse.body as Buffer).subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('rejects an invoice with no lines', () => {
    return request(app.getHttpServer())
      .post('/api/invoices')
      .send({ customerName: 'No Lines Customer', lines: [] })
      .expect(400);
  });

  it('stores a valid customerId without overwriting the submitted customer text fields', async () => {
    const customerResponse = await request(app.getHttpServer())
      .post('/api/customers')
      .send({ name: 'Saved Customer', address: 'Saved Address' })
      .expect(201);
    const customerId = (customerResponse.body as { id: string }).id;
    createdCustomerIds.push(customerId);

    const createResponse = await request(app.getHttpServer())
      .post('/api/invoices')
      .send({
        customerName: 'Edited At Submit Time',
        customerId,
        lines: [
          {
            description: 'Plinthes',
            unit: 'unite',
            mode: 'UNIT',
            quantity: 1,
            unitPriceCents: 100,
          },
        ],
      })
      .expect(201);

    const created = createResponse.body as InvoiceWithTotals;
    createdInvoiceIds.push(created.id);
    expect(created.customerId).toBe(customerId);
    // The typed value at submit time wins, even though it diverges from the
    // saved customer record — the invoice is never silently rewritten.
    expect(created.customerName).toBe('Edited At Submit Time');
  });

  it('rejects an invoice referencing an unknown customerId', () => {
    return request(app.getHttpServer())
      .post('/api/invoices')
      .send({
        customerName: 'Unknown Customer Link',
        customerId: '00000000-0000-0000-0000-000000000000',
        lines: [
          {
            description: 'Plinthes',
            unit: 'unite',
            mode: 'UNIT',
            quantity: 1,
            unitPriceCents: 100,
          },
        ],
      })
      .expect(404);
  });
});
