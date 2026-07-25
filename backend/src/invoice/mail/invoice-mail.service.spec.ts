import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { MailSettingsService } from '../../mail-settings/mail-settings.service';
import { MailerService, SendMailParams } from '../../mailer/mailer.service';
import { InvoiceMapper } from '../invoice.mapper';
import { InvoiceRepository } from '../invoice.repository';
import { PdfService } from '../pdf/pdf.service';
import { InvoiceMailService } from './invoice-mail.service';

const COMPANY_ID = 'company-1';
const RAW_INVOICE = {
  id: 'inv-1',
  status: 'NON_PAYEE',
  company: { name: 'Parquet Dupont' },
} as never;
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
}) {
  const findById = jest.fn().mockResolvedValue(options.found === false ? null : RAW_INVOICE);
  const markSent = jest.fn().mockResolvedValue(RAW_INVOICE);
  const invoiceRepository = { findById, markSent } as unknown as InvoiceRepository;

  const toInvoiceWithTotals = jest.fn().mockReturnValue({
    number: 'F-000001',
    customerName: 'Mme Martin',
    customerEmail:
      options.customerEmail === undefined ? 'client@exemple.fr' : options.customerEmail,
    totalInclVatCents: 12000,
  });
  const toPdfData = jest.fn().mockReturnValue({});
  const mapper = { toInvoiceWithTotals, toPdfData } as unknown as InvoiceMapper;

  const generateInvoicePdf = jest.fn().mockResolvedValue(Buffer.from('pdf'));
  const pdfService = { generateInvoicePdf } as unknown as PdfService;

  const getDecryptedCredentials = jest
    .fn()
    .mockResolvedValue(options.smtp === undefined ? SMTP : options.smtp);
  const mailSettingsService = { getDecryptedCredentials } as unknown as MailSettingsService;

  const send = options.sendError
    ? jest.fn<Promise<void>, [SendMailParams]>().mockRejectedValue(options.sendError)
    : jest.fn<Promise<void>, [SendMailParams]>().mockResolvedValue(undefined);
  const mailerService = { send } as unknown as MailerService;

  const service = new InvoiceMailService(
    invoiceRepository,
    mapper,
    pdfService,
    mailSettingsService,
    mailerService,
  );
  return { service, findById, markSent, send, getDecryptedCredentials };
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

describe('InvoiceMailService.getDefaultTemplate', () => {
  it('returns the same default subject/text send() would use, without requiring SMTP to be configured', async () => {
    const { service } = buildService({ smtp: null });

    const template = await service.getDefaultTemplate(COMPANY_ID, 'inv-1');

    expect(template.subject).toContain('F-000001');
    expect(template.text).toContain('FactureLeBat');
  });

  it('throws NotFoundException for an unknown invoice id', async () => {
    const { service } = buildService({ found: false });

    await expect(service.getDefaultTemplate(COMPANY_ID, 'missing')).rejects.toThrow();
  });
});
