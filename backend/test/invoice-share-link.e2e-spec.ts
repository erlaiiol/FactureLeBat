import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PlanTier } from '../generated/prisma/enums';
import { PrismaService } from '../src/database/prisma.service';
import { InvoiceWithTotals } from '../src/invoice/entities/invoice.entity';
import { authedRequest, registerTestUser, TestSession } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Phase 1.3-7 "Partager": a share link (/partage/:token) is meant to be sent
// to someone with no FactureLe account at all — by SMS, WhatsApp, email —
// and opened in whatever browser their phone hands it to (iOS Safari,
// Android Chrome, desktop). That browser never has the artisan's session
// cookie, so the only thing that must matter here is the token. This suite
// pins exactly that, and the contrast with the cookie-gated /:id/pdf route
// whose 401 in a cookie-less context is what broke the native shells'
// download buttons on 2026-10-06 (see the frontend's FileDownloadService).
//
// Same local-dev-Postgres posture as invoice.e2e-spec.ts.
describe('Invoice share link — opened by a non-user (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;

  // Deliberately a bare supertest agent: no cookie, no XSRF header —
  // exactly what a recipient's browser sends.
  const anonymous = () => request(app.getHttpServer());

  const createDocument = async (documentType: 'FACTURE' | 'DEVIS'): Promise<InvoiceWithTotals> => {
    const response = await authedRequest(app, session)
      .post('/api/invoices')
      .send({
        documentType,
        customerName: 'Destinataire sans compte',
        lines: [
          { description: 'Pose carrelage', unit: 'UNIT', quantity: 1, unitPriceCents: 12000 },
        ],
      })
      .expect(201);
    return response.body as InvoiceWithTotals;
  };

  const shareTokenFor = async (invoiceId: string): Promise<string> => {
    const response = await authedRequest(app, session)
      .post(`/api/invoices/${invoiceId}/share-link`)
      .expect(201);
    const { url } = response.body as { url: string };
    const match = url.match(/\/partage\/([^/?#]+)$/);
    expect(match).not.toBeNull();
    return match![1];
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    session = await registerTestUser(app);
    // Same free-trial opt-out as invoice.e2e-spec.ts — this suite is about
    // the share link, not the plan gate.
    await prisma.company.update({
      where: { id: session.companyId },
      data: {
        premiumGrantedUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        grantedPlanTier: PlanTier.PREMIUM,
      },
    });
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: session.companyId } });
    await app.close();
  });

  it('refuses the authenticated PDF route without a session cookie', async () => {
    const invoice = await createDocument('FACTURE');
    await anonymous().get(`/api/invoices/${invoice.id}/pdf`).expect(401);
  });

  it('builds the share URL on the public /partage/:token page', async () => {
    const invoice = await createDocument('FACTURE');
    const response = await authedRequest(app, session)
      .post(`/api/invoices/${invoice.id}/share-link`)
      .expect(201);
    const { url } = response.body as { url: string };
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    expect(url.startsWith(`${frontendUrl}/partage/`)).toBe(true);
  });

  it.each(['FACTURE', 'DEVIS'] as const)(
    'serves a %s PDF to a visitor with no session at all',
    async (documentType) => {
      const invoice = await createDocument(documentType);
      const token = await shareTokenFor(invoice.id);

      const response = await anonymous()
        .get(`/api/invoices/share/${token}/pdf`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      const prefix = documentType === 'DEVIS' ? 'devis' : 'facture';
      expect(response.headers['content-disposition']).toContain(
        `filename="${prefix}-${invoice.number}.pdf"`,
      );
      expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    },
  );

  it('ignores a stale or invalid session cookie on the recipient side', async () => {
    const invoice = await createDocument('FACTURE');
    const token = await shareTokenFor(invoice.id);
    await anonymous()
      .get(`/api/invoices/share/${token}/pdf`)
      .set('Cookie', 'access_token=expired-or-forged.jwt.value')
      .expect(200);
  });

  it('keeps the same link when shared again, so an already-sent SMS stays valid', async () => {
    const invoice = await createDocument('FACTURE');
    const first = await shareTokenFor(invoice.id);
    const second = await shareTokenFor(invoice.id);
    expect(second).toBe(first);
    await anonymous().get(`/api/invoices/share/${first}/pdf`).expect(200);
  });

  it('stops serving the PDF once the link is revoked', async () => {
    const invoice = await createDocument('FACTURE');
    const token = await shareTokenFor(invoice.id);
    await authedRequest(app, session).delete(`/api/invoices/${invoice.id}/share-link`).expect(200);
    await anonymous().get(`/api/invoices/share/${token}/pdf`).expect(404);
  });

  it('answers 404 for an unknown token', async () => {
    await anonymous().get('/api/invoices/share/not-a-real-token/pdf').expect(404);
  });
});
