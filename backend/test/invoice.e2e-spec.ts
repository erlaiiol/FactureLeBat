import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { InvoiceWithTotals } from '../src/invoice/entities/invoice.entity';
import { authedRequest, registerTestUser, TestSession } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Runs against the local dev Postgres (same DATABASE_URL as `npm run start:dev`):
// this is a local sanity check for the full pipeline, not an isolated CI gate,
// so it creates real rows rather than requiring a dedicated test database.
// Every request is authenticated as a fresh test artisan (see
// docs/roadmap.md Phase 13); afterAll cleans up via a single
// company.delete() cascade (Invoice -> InvoiceLine and Customer both
// cascade from Company, so this alone clears everything this suite touched
// — invoice numbering itself is NOT rolled back, Company.nextInvoiceNumber
// is real, persistent per-company state, but it's scoped to this suite's
// own disposable company either way).
describe('Invoice pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    session = await registerTestUser(app);
    // Phase 14: this suite exercises the invoice pipeline itself across
    // many `it` blocks sharing one company — granting premium up front
    // (the same field an admin grant/promo-code redemption would set) opts
    // this company out of the free-trial gate so those tests aren't
    // coupled to it. The gate itself is covered separately, in its own
    // fresh-company test below and in premium-gate.service.spec.ts.
    await prisma.company.update({
      where: { id: session.companyId },
      data: { premiumGrantedUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    });
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: session.companyId } });
    await app.close();
  });

  it('creates an invoice, computes its totals, and generates a downloadable PDF', async () => {
    const createResponse = await authedRequest(app, session)
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
    expect(created.number).toMatch(/^F-\d{6}$/);
    // 10 m2 * 1.10 waste = 11 m2 * 4500 cents = 49500; 5 * 800 = 4000
    expect(created.subtotalExclVatCents).toBe(49500 + 4000);
    expect(created.totalInclVatCents).toBe(created.subtotalExclVatCents + created.vatAmountCents);

    const invoiceId = created.id;

    const getResponse = await authedRequest(app, session)
      .get(`/api/invoices/${invoiceId}`)
      .expect(200);
    const fetched = getResponse.body as InvoiceWithTotals;
    expect(fetched.id).toBe(invoiceId);
    expect(fetched.lines).toHaveLength(2);

    const pdfResponse = await authedRequest(app, session)
      .get(`/api/invoices/${invoiceId}/pdf`)
      .expect(200);
    expect(pdfResponse.headers['content-type']).toBe('application/pdf');
    expect((pdfResponse.body as Buffer).subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('bills a packaged line for whole packages, rounding the site quantity up when it does not land on an exact box count', async () => {
    const createResponse = await authedRequest(app, session)
      .post('/api/invoices')
      .send({
        customerName: 'E2E Packaging Customer',
        lines: [
          {
            description: 'Parquet bambou en boite de 9m2',
            unit: 'SQUARE_METER',
            quantity: 23,
            unitPriceCents: 4500,
            packagingQuantity: 9,
          },
        ],
      })
      .expect(201);

    const created = createResponse.body as InvoiceWithTotals;
    // 23 m2 needed -> rounds up to 3 boxes of 9 m2 = 27 m2 billed (roundUpToPackaging
    // defaults to true), priced at 27 * 4500 rather than the raw 23 m2 site quantity.
    expect(created.lines[0].quantity).toBe('23');
    expect(created.lines[0].billedQuantity).toBe('27');
    expect(created.subtotalExclVatCents).toBe(27 * 4500);
  });

  it('rejects an invoice with no lines', () => {
    return authedRequest(app, session)
      .post('/api/invoices')
      .send({ customerName: 'No Lines Customer', lines: [] })
      .expect(400);
  });

  it('stores a valid customerId without overwriting the submitted customer text fields', async () => {
    const customerResponse = await authedRequest(app, session)
      .post('/api/customers')
      .send({ name: 'Saved Customer', address: 'Saved Address' })
      .expect(201);
    const customerId = (customerResponse.body as { id: string }).id;

    const createResponse = await authedRequest(app, session)
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
    expect(created.customerId).toBe(customerId);
    // The typed value at submit time wins, even though it diverges from the
    // saved customer record — the invoice is never silently rewritten.
    expect(created.customerName).toBe('Edited At Submit Time');
  });

  it('rejects an invoice referencing an unknown customerId', () => {
    return authedRequest(app, session)
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
      const createResponse = await authedRequest(app, session)
        .post('/api/invoices')
        .send({
          customerName: 'E2E Visible Service Customer',
          lines: twoLines,
          serviceLines: [{ name: "Main-d'œuvre", amountCents: 10000, visibility: 'VISIBLE' }],
        })
        .expect(201);

      const created = createResponse.body as InvoiceWithTotals;
      expect(created.lines[0].lineTotalExclVatCents).toBe(10 * 4500);
      expect(created.lines[1].lineTotalExclVatCents).toBe(5 * 800);
      expect(created.serviceLines).toHaveLength(1);
      expect(created.serviceLines[0].amountCents).toBe(10000);
      expect(created.serviceLines[0].visibility).toBe('VISIBLE');
      expect(created.subtotalExclVatCents).toBe(baseSubtotal + 10000);
    });

    it('redistributes a REDISTRIBUTED + EQUAL service line evenly across the invoice lines, never losing a cent', async () => {
      const createResponse = await authedRequest(app, session)
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
      const createResponse = await authedRequest(app, session)
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
      expect(created.lines[0].lineTotalExclVatCents).toBe(10 * 4500 + 2500);
      expect(created.lines[1].lineTotalExclVatCents).toBe(5 * 800 + 7500);
      expect(created.subtotalExclVatCents).toBe(baseSubtotal + 10000);
    });

    it('rejects a REDISTRIBUTED + WEIGHTED service line whose weights do not match the line count', () => {
      return authedRequest(app, session)
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
      return authedRequest(app, session)
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
      return authedRequest(app, session)
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

      const previewResponse = await authedRequest(app, session)
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
      return authedRequest(app, session)
        .post('/api/invoices/preview')
        .send({ customerName: 'No Lines Customer', lines: [] })
        .expect(400);
    });
  });

  // Phase 9.5: the free-form canvas is an alternate input surface for the
  // same Invoice — same numbering sequence, same /invoices list, same PDF
  // endpoint, just a different line-item shape underneath.
  describe('manual invoice mode (Phase 9.5)', () => {
    const manualTable = {
      columns: [
        { role: 'DESCRIPTION', label: 'Désignation' },
        { role: 'QUANTITY', label: 'Quantité' },
        { role: 'UNIT_PRICE', label: 'Prix unitaire' },
        { role: 'LINE_TOTAL', label: 'Total' },
      ],
      rows: [
        // LINE_TOTAL is the artisan's own freehand cell, not derived from
        // QUANTITY x UNIT_PRICE (see manual-table-calculation.util.ts) — set
        // here to the same product so the assertions below still hold.
        { cells: ['Parquet chêne massif', '10', '45.00', '450.00'] },
        { cells: ['Plinthes', '5', '8.00', '40.00'] },
      ],
    };

    it('creates a manual invoice, prices each row like a GUIDED UNIT-mode line, and generates a PDF', async () => {
      const createResponse = await authedRequest(app, session)
        .post('/api/invoices')
        .send({
          customerName: 'E2E Manual Customer',
          entryMode: 'MANUAL',
          manualTable,
        })
        .expect(201);

      const created = createResponse.body as InvoiceWithTotals;
      expect(created.number).toMatch(/^F-\d{6}$/);
      expect(created.entryMode).toBe('MANUAL');
      expect(created.lines).toEqual([]);
      expect(created.serviceLines).toEqual([]);
      expect(created.manualTable?.rows).toHaveLength(2);
      // 10 * 4500 + 5 * 800, no waste surcharge (not a manual-mode concept).
      expect(created.subtotalExclVatCents).toBe(45000 + 4000);

      const getResponse = await authedRequest(app, session)
        .get(`/api/invoices/${created.id}`)
        .expect(200);
      const fetched = getResponse.body as InvoiceWithTotals;
      expect(fetched.manualTable?.rows.map((row) => row.lineTotalExclVatCents)).toEqual([
        45000, 4000,
      ]);

      const pdfResponse = await authedRequest(app, session)
        .get(`/api/invoices/${created.id}/pdf`)
        .expect(200);
      expect(pdfResponse.headers['content-type']).toBe('application/pdf');
      expect((pdfResponse.body as Buffer).subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('rejects a manual invoice that also carries GUIDED lines', () => {
      return authedRequest(app, session)
        .post('/api/invoices')
        .send({
          customerName: 'E2E Manual Customer',
          entryMode: 'MANUAL',
          manualTable,
          lines: [{ description: 'Parquet', unit: 'UNIT', quantity: 1, unitPriceCents: 100 }],
        })
        .expect(400);
    });

    it('rejects a manual table missing the required UNIT_PRICE column', () => {
      return authedRequest(app, session)
        .post('/api/invoices')
        .send({
          customerName: 'E2E Manual Customer',
          entryMode: 'MANUAL',
          manualTable: {
            columns: manualTable.columns.filter((column) => column.role !== 'UNIT_PRICE'),
            rows: [{ cells: ['Parquet chêne massif', '10'] }],
          },
        })
        .expect(400);
    });

    it('previews a manual draft PDF without persisting an invoice', async () => {
      const invoiceCountBefore = await prisma.invoice.count();

      const previewResponse = await authedRequest(app, session)
        .post('/api/invoices/preview')
        .send({
          customerName: 'E2E Manual Preview Customer',
          entryMode: 'MANUAL',
          manualTable,
        })
        .expect(201);

      expect(previewResponse.headers['content-type']).toBe('application/pdf');
      expect((previewResponse.body as Buffer).subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(await prisma.invoice.count()).toBe(invoiceCountBefore);
    });
  });

  describe('Phase 14 free-trial gate', () => {
    let freeSession: TestSession;

    beforeAll(async () => {
      freeSession = await registerTestUser(app);
      // Invoice.number is unique across the whole table, not per company —
      // a pre-existing, unrelated schema quirk (every company defaults to
      // prefix "F" starting at 1). Giving this company its own prefix keeps
      // its invoice numbers from colliding with the outer describe block's
      // shared `session` company, which already owns "F-000001".
      await prisma.company.update({
        where: { id: freeSession.companyId },
        data: { invoiceNumberPrefix: 'FT' },
      });
    });

    afterAll(async () => {
      await prisma.company.delete({ where: { id: freeSession.companyId } });
    });

    it('allows a brand-new company its first invoice and preview for free, then blocks a 2nd with 402', async () => {
      const body = {
        customerName: 'Free Trial Customer',
        lines: [{ description: 'Parquet', unit: 'UNIT', quantity: 1, unitPriceCents: 1000 }],
      };

      await authedRequest(app, freeSession).post('/api/invoices/preview').send(body).expect(201);
      await authedRequest(app, freeSession).post('/api/invoices').send(body).expect(201);

      const blockedPreview = await authedRequest(app, freeSession)
        .post('/api/invoices/preview')
        .send(body)
        .expect(402);
      expect((blockedPreview.body as { error: string }).error).toBe('PremiumRequired');

      await authedRequest(app, freeSession).post('/api/invoices').send(body).expect(402);

      await prisma.company.update({
        where: { id: freeSession.companyId },
        data: { premiumGrantedUntil: new Date(Date.now() + 60_000) },
      });
      await authedRequest(app, freeSession).post('/api/invoices').send(body).expect(201);
    });
  });
});
