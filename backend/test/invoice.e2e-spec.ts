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
            unit: 'SQUARE_METER',
            quantity: 10,
            unitPriceCents: 4500,
            wasteSurcharge: 'TEN',
          },
          {
            description: 'Plinthes',
            unit: 'UNIT',
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
            unit: 'UNIT',
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
            unit: 'UNIT',
            quantity: 1,
            unitPriceCents: 100,
          },
        ],
      })
      .expect(404);
  });

  // Phase 5: service lines, both visibility modes.
  describe('service lines', () => {
    const twoLines = [
      { description: 'Parquet', unit: 'SQUARE_METER', quantity: 10, unitPriceCents: 4500 },
      { description: 'Plinthes', unit: 'UNIT', quantity: 5, unitPriceCents: 800 },
    ];
    const baseSubtotal = 10 * 4500 + 5 * 800;

    it('adds a VISIBLE service line amount to the subtotal without changing any line total', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/invoices')
        .send({
          customerName: 'E2E Visible Service Customer',
          lines: twoLines,
          serviceLines: [{ name: "Main-d'œuvre", amountCents: 10000, visibility: 'VISIBLE' }],
        })
        .expect(201);

      const created = createResponse.body as InvoiceWithTotals;
      createdInvoiceIds.push(created.id);
      expect(created.lines[0].lineTotalExclVatCents).toBe(10 * 4500);
      expect(created.lines[1].lineTotalExclVatCents).toBe(5 * 800);
      expect(created.serviceLines).toHaveLength(1);
      expect(created.serviceLines[0].amountCents).toBe(10000);
      expect(created.serviceLines[0].visibility).toBe('VISIBLE');
      expect(created.subtotalExclVatCents).toBe(baseSubtotal + 10000);
    });

    it('redistributes a REDISTRIBUTED + EQUAL service line evenly across the invoice lines, never losing a cent', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/invoices')
        .send({
          customerName: 'E2E Equal Redistribution Customer',
          lines: twoLines,
          serviceLines: [
            {
              name: 'Savoir-faire',
              amountCents: 10001,
              visibility: 'REDISTRIBUTED',
              redistributionStrategy: 'EQUAL',
            },
          ],
        })
        .expect(201);

      const created = createResponse.body as InvoiceWithTotals;
      createdInvoiceIds.push(created.id);
      // No service line total is shown on its own — it's folded into the lines.
      const lineTotalSum = created.lines.reduce((sum, l) => sum + l.lineTotalExclVatCents, 0);
      expect(lineTotalSum).toBe(baseSubtotal + 10001);
      expect(created.subtotalExclVatCents).toBe(baseSubtotal + 10001);
      // Equal split of an odd amount: one line gets the extra cent, deterministically.
      expect([
        created.lines[0].lineTotalExclVatCents,
        created.lines[1].lineTotalExclVatCents,
      ]).toEqual(expect.arrayContaining([10 * 4500 + 5001, 5 * 800 + 5000]));
    });

    it('redistributes a REDISTRIBUTED + WEIGHTED service line proportionally to the given weights', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/invoices')
        .send({
          customerName: 'E2E Weighted Redistribution Customer',
          lines: twoLines,
          serviceLines: [
            {
              name: 'Savoir-faire',
              amountCents: 10000,
              visibility: 'REDISTRIBUTED',
              redistributionStrategy: 'WEIGHTED',
              weights: [1, 3],
            },
          ],
        })
        .expect(201);

      const created = createResponse.body as InvoiceWithTotals;
      createdInvoiceIds.push(created.id);
      expect(created.lines[0].lineTotalExclVatCents).toBe(10 * 4500 + 2500);
      expect(created.lines[1].lineTotalExclVatCents).toBe(5 * 800 + 7500);
      expect(created.subtotalExclVatCents).toBe(baseSubtotal + 10000);
    });

    it('rejects a REDISTRIBUTED + WEIGHTED service line whose weights do not match the line count', () => {
      return request(app.getHttpServer())
        .post('/api/invoices')
        .send({
          customerName: 'E2E Bad Weights Customer',
          lines: twoLines,
          serviceLines: [
            {
              name: 'Savoir-faire',
              amountCents: 10000,
              visibility: 'REDISTRIBUTED',
              redistributionStrategy: 'WEIGHTED',
              weights: [1, 2, 3],
            },
          ],
        })
        .expect(400);
    });

    it('rejects a VISIBLE service line that also carries redistribution fields', () => {
      return request(app.getHttpServer())
        .post('/api/invoices')
        .send({
          customerName: 'E2E Bad Visibility Customer',
          lines: twoLines,
          serviceLines: [
            {
              name: 'Savoir-faire',
              amountCents: 10000,
              visibility: 'VISIBLE',
              redistributionStrategy: 'EQUAL',
            },
          ],
        })
        .expect(400);
    });

    it('rejects an invoice referencing an unknown serviceId', () => {
      return request(app.getHttpServer())
        .post('/api/invoices')
        .send({
          customerName: 'E2E Unknown Service Link',
          lines: twoLines,
          serviceLines: [
            {
              serviceId: '00000000-0000-0000-0000-000000000000',
              name: 'Savoir-faire',
              amountCents: 10000,
              visibility: 'VISIBLE',
            },
          ],
        })
        .expect(404);
    });
  });

  // Phase 6: preview a draft invoice's PDF without ever saving it.
  describe('preview', () => {
    const twoLines = [
      { description: 'Parquet', unit: 'SQUARE_METER', quantity: 10, unitPriceCents: 4500 },
      { description: 'Plinthes', unit: 'UNIT', quantity: 5, unitPriceCents: 800 },
    ];

    it('renders a PDF for an unsaved draft, without persisting an invoice', async () => {
      const invoiceCountBefore = await prisma.invoice.count();

      const previewResponse = await request(app.getHttpServer())
        .post('/api/invoices/preview')
        .send({
          customerName: 'E2E Preview Customer',
          lines: twoLines,
          serviceLines: [{ name: "Main-d'œuvre", amountCents: 10000, visibility: 'VISIBLE' }],
        })
        .expect(201);

      expect(previewResponse.headers['content-type']).toBe('application/pdf');
      expect((previewResponse.body as Buffer).subarray(0, 4).toString('ascii')).toBe('%PDF');

      expect(await prisma.invoice.count()).toBe(invoiceCountBefore);
    });

    it('rejects a preview of a draft with no lines, same validation as a real create', () => {
      return request(app.getHttpServer())
        .post('/api/invoices/preview')
        .send({ customerName: 'No Lines Customer', lines: [] })
        .expect(400);
    });
  });
});
