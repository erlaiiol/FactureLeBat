import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CompanyService } from '../../company/company.service';
import { MailSettingsService } from '../../mail-settings/mail-settings.service';
import { MailerService, SendMailParams } from '../../mailer/mailer.service';
import { FacturXService } from '../facturx/facturx.service';
import { InvoiceMapper } from '../invoice.mapper';
import { InvoiceRepository } from '../invoice.repository';
import { PdfService } from '../pdf/pdf.service';
import { InvoiceMailService } from './invoice-mail.service';

const COMPANY_ID = 'company-1';
function rawInvoice(autoAttachFacturX = false) {
  return {
    id: 'inv-1',
    status: 'NON_PAYEE',
    company: { name: 'Parquet Dupont', autoAttachFacturX },
  } as never;
}
const SMTP = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'moi@exemple.fr',
  password: 'x',
};

function buildService(options: {
  found?: boolean;
  customerEmail?: string | null;
  smtp?: typeof SMTP | null;
  sendError?: Error;
  autoAttachFacturX?: boolean;
  documentType?: 'FACTURE' | 'DEVIS';
  generateHybridPdfError?: Error;
}) {
  const raw = rawInvoice(options.autoAttachFacturX ?? false);
  const findById = jest.fn().mockResolvedValue(options.found === false ? null : raw);
  const markSent = jest.fn().mockResolvedValue(raw);
  const findSignatureImage = jest.fn().mockResolvedValue(null);
  const invoiceRepository = {
    findById,
    markSent,
    findSignatureImage,
  } as unknown as InvoiceRepository;

  const toInvoiceWithTotals = jest.fn().mockReturnValue({
    number: 'F-000001',
    documentType: options.documentType ?? 'FACTURE',
    customerName: 'Mme Martin',
    customerEmail:
      options.customerEmail === undefined ? 'client@exemple.fr' : options.customerEmail,
    totalInclVatCents: 12000,
  });
  const toPdfData = jest.fn().mockReturnValue({});
  const mapper = { toInvoiceWithTotals, toPdfData } as unknown as InvoiceMapper;

  const generateInvoicePdf = jest.fn().mockResolvedValue(Buffer.from('pdf'));
  const pdfService = { generateInvoicePdf } as unknown as PdfService;

  const getLogo = jest.fn().mockResolvedValue(null);
  const companyService = { getLogo } as unknown as CompanyService;

  const getDecryptedCredentials = jest
    .fn()
    .mockResolvedValue(options.smtp === undefined ? SMTP : options.smtp);
  const mailSettingsService = { getDecryptedCredentials } as unknown as MailSettingsService;

  const send = options.sendError
    ? jest.fn<Promise<void>, [SendMailParams]>().mockRejectedValue(options.sendError)
    : jest.fn<Promise<void>, [SendMailParams]>().mockResolvedValue(undefined);
  const mailerService = { send } as unknown as MailerService;

  const generateHybridPdf = options.generateHybridPdfError
    ? jest.fn().mockRejectedValue(options.generateHybridPdfError)
    : jest.fn().mockResolvedValue(Buffer.from('factur-x-pdf'));
  const facturXService = { generateHybridPdf } as unknown as FacturXService;

  const service = new InvoiceMailService(
    invoiceRepository,
    mapper,
    pdfService,
    companyService,
    mailSettingsService,
    mailerService,
    facturXService,
  );
  return {
    service,
    raw,
    findById,
    markSent,
    send,
    getDecryptedCredentials,
    toPdfData,
    findSignatureImage,
    generateHybridPdf,
  };
}

describe('InvoiceMailService.send', () => {
  it('sends to the invoice customerEmail and records the send when no override is given', async () => {
    const { service, send, markSent } = buildService({});

    await service.send(COMPANY_ID, 'inv-1', {});

    const sentParams = send.mock.calls[0][0];
    expect(sentParams.to).toBe('client@exemple.fr');
    expect(sentParams.from.address).toBe('moi@exemple.fr');
    expect(markSent).toHaveBeenCalledWith(COMPANY_ID, 'inv-1', 'client@exemple.fr', {
      bumpReminder: true,
    });
  });

  // Phase 1.1-1: the emailed PDF must go through the exact same signature
  // compositing as download/"Partager" — see InvoiceMapper.toPdfData's third
  // param. A regression here would silently email an unsigned copy of a
  // document the artisan believes is signed.
  it('fetches and forwards the attached signature to the PDF render, keyed by this invoice', async () => {
    const { service, raw, findSignatureImage, toPdfData } = buildService({});
    findSignatureImage.mockResolvedValue({ image: Buffer.from('sig'), mimeType: 'image/png' });

    await service.send(COMPANY_ID, 'inv-1', {});

    expect(findSignatureImage).toHaveBeenCalledWith(COMPANY_ID, 'inv-1');
    expect(toPdfData).toHaveBeenCalledWith(raw, null, {
      image: Buffer.from('sig'),
      mimeType: 'image/png',
    });
  });

  it('uses the dto.to override instead of the invoice customerEmail', async () => {
    const { service, send, markSent } = buildService({});

    await service.send(COMPANY_ID, 'inv-1', { to: 'autre@exemple.fr' });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'autre@exemple.fr' }));
    expect(markSent).toHaveBeenCalledWith(COMPANY_ID, 'inv-1', 'autre@exemple.fr', {
      bumpReminder: true,
    });
  });

  it('throws BadRequestException when neither dto.to nor customerEmail is set', async () => {
    const { service } = buildService({ customerEmail: null });

    await expect(service.send(COMPANY_ID, 'inv-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws ServiceUnavailableException when no SMTP is configured', async () => {
    const { service } = buildService({ smtp: null });

    await expect(service.send(COMPANY_ID, 'inv-1', {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propagates the delivery error and never marks the invoice as sent', async () => {
    const { service, markSent } = buildService({ sendError: new Error('SMTP refused') });

    await expect(service.send(COMPANY_ID, 'inv-1', {})).rejects.toThrow('SMTP refused');
    expect(markSent).not.toHaveBeenCalled();
  });
});

// Phase 1.3-2 (2026 e-invoicing reform, workflow automation)
describe('InvoiceMailService.send — autoAttachFacturX', () => {
  it('attaches the plain PDF by default (autoAttachFacturX off)', async () => {
    const { service, send, generateHybridPdf } = buildService({});

    await service.send(COMPANY_ID, 'inv-1', {});

    expect(generateHybridPdf).not.toHaveBeenCalled();
    const attachment = send.mock.calls[0][0].attachments![0];
    expect(attachment.filename).toBe('facture-F-000001.pdf');
    expect(attachment.content.toString()).toBe('pdf');
  });

  it('attaches the Factur-X hybrid for a FACTURE when the company opted in', async () => {
    const { service, send, generateHybridPdf } = buildService({
      autoAttachFacturX: true,
      documentType: 'FACTURE',
    });

    await service.send(COMPANY_ID, 'inv-1', {});

    expect(generateHybridPdf).toHaveBeenCalledWith(Buffer.from('pdf'), {});
    const attachment = send.mock.calls[0][0].attachments![0];
    expect(attachment.filename).toBe('facture-F-000001-factur-x.pdf');
    expect(attachment.content.toString()).toBe('factur-x-pdf');
  });

  it('never attaches Factur-X for a DEVIS, even when the company opted in', async () => {
    const { service, send, generateHybridPdf } = buildService({
      autoAttachFacturX: true,
      documentType: 'DEVIS',
    });

    await service.send(COMPANY_ID, 'inv-1', {});

    expect(generateHybridPdf).not.toHaveBeenCalled();
    const attachment = send.mock.calls[0][0].attachments![0];
    expect(attachment.filename).toBe('devis-F-000001.pdf');
  });

  it('falls back to the plain PDF and still sends when Factur-X generation fails', async () => {
    const { service, send, markSent } = buildService({
      autoAttachFacturX: true,
      documentType: 'FACTURE',
      generateHybridPdfError: new Error('Schematron validation failed'),
    });

    await service.send(COMPANY_ID, 'inv-1', {});

    const attachment = send.mock.calls[0][0].attachments![0];
    expect(attachment.filename).toBe('facture-F-000001.pdf');
    expect(attachment.content.toString()).toBe('pdf');
    expect(markSent).toHaveBeenCalled();
  });
});

describe('InvoiceMailService.getDefaultTemplate', () => {
  it('returns the same default subject/text send() would use, without requiring SMTP to be configured', async () => {
    const { service } = buildService({ smtp: null });

    const template = await service.getDefaultTemplate(COMPANY_ID, 'inv-1');

    expect(template.subject).toContain('F-000001');
    expect(template.text).toContain('FactureLe');
  });

  it('throws NotFoundException for an unknown invoice id', async () => {
    const { service } = buildService({ found: false });

    await expect(service.getDefaultTemplate(COMPANY_ID, 'missing')).rejects.toThrow();
  });
});
