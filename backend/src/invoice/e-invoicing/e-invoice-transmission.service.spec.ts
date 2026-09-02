import { BadRequestException, ConflictException } from '@nestjs/common';
import { CompanySuperPdpService } from './company-super-pdp.service';
import { EInvoiceTransmissionService } from './e-invoice-transmission.service';
import { SuperPdpProvider } from './super-pdp-provider.service';
import { SuperPdpUnavailableError } from './super-pdp-unavailable.error';
import { PlanGateService } from '../../billing/plan-gate.service';
import { FacturXService } from '../facturx/facturx.service';
import { InvoiceMapper } from '../invoice.mapper';
import { InvoiceRepository } from '../invoice.repository';
import { InvoiceService } from '../invoice.service';
import { PdfService } from '../pdf/pdf.service';

function buildService(
  options: {
    documentType?: 'FACTURE' | 'DEVIS';
    superPdpInvoiceId?: string | null;
    eInvoiceTransmissionStatus?: string;
  } = {},
) {
  const findByIdService = jest.fn().mockResolvedValue({
    id: 'inv-1',
    documentType: options.documentType ?? 'FACTURE',
    eInvoiceTransmissionStatus: options.eInvoiceTransmissionStatus ?? 'NOT_SENT',
  });
  const invoiceService = {
    findById: findByIdService,
    getPdfData: jest.fn().mockResolvedValue({ number: 'F-000001' }),
  } as unknown as InvoiceService;

  const findByIdRepo = jest.fn().mockResolvedValue({
    id: 'inv-1',
    superPdpInvoiceId: 'superPdpInvoiceId' in options ? options.superPdpInvoiceId : '999',
  });
  const updateEInvoiceTransmission = jest.fn().mockImplementation(
    (
      _c: string,
      _id: string,
      data: {
        status: string;
        transmittedAt?: Date;
        superPdpInvoiceId?: string;
        rejectionReason: string | null;
      },
    ) => ({
      id: 'inv-1',
      ...data,
    }),
  );
  const invoiceRepository = {
    findById: findByIdRepo,
    updateEInvoiceTransmission,
  } as unknown as InvoiceRepository;

  const toInvoiceWithTotals = jest.fn().mockImplementation((row: unknown) => row);
  const invoiceMapper = { toInvoiceWithTotals } as unknown as InvoiceMapper;

  const pdfService = {
    generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
  } as unknown as PdfService;

  const facturXService = {
    generateHybridPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-hybrid')),
  } as unknown as FacturXService;

  const getValidAccessToken = jest.fn().mockResolvedValue('access-token-abc');
  const companySuperPdp = { getValidAccessToken } as unknown as CompanySuperPdpService;

  const transmit = jest.fn().mockResolvedValue({ providerReference: 'super-pdp-id-42' });
  const getStatus = jest.fn().mockResolvedValue({ status: 'ACCEPTED', rejectionReason: null });
  const provider = { transmit, getStatus } as unknown as SuperPdpProvider;

  const planGate = {
    assertCanUseFacturX: jest.fn().mockResolvedValue(undefined),
    recordFacturXUsed: jest.fn().mockResolvedValue(undefined),
  } as unknown as PlanGateService;

  const service = new EInvoiceTransmissionService(
    invoiceService,
    invoiceRepository,
    invoiceMapper,
    pdfService,
    facturXService,
    companySuperPdp,
    provider,
    planGate,
  );
  return { service, updateEInvoiceTransmission, transmit, getStatus, findByIdRepo, planGate };
}

describe('EInvoiceTransmissionService', () => {
  describe('transmit', () => {
    it('rejects a DEVIS before ever generating or submitting anything', async () => {
      const { service, transmit } = buildService({ documentType: 'DEVIS' });
      await expect(service.transmit('company-1', 'inv-1')).rejects.toThrow(BadRequestException);
      expect(transmit).not.toHaveBeenCalled();
    });

    it('submits a FACTURE and persists SENT + the provider reference', async () => {
      const { service, updateEInvoiceTransmission } = buildService({ documentType: 'FACTURE' });
      await service.transmit('company-1', 'inv-1');

      expect(updateEInvoiceTransmission).toHaveBeenCalledWith(
        'company-1',
        'inv-1',
        expect.objectContaining({
          status: 'SENT',
          superPdpInvoiceId: 'super-pdp-id-42',
          rejectionReason: null,
        }),
      );
    });

    it('resubmits a REJECTED invoice as a new PA-side submission', async () => {
      const { service, transmit } = buildService({ eInvoiceTransmissionStatus: 'REJECTED' });
      await service.transmit('company-1', 'inv-1');
      expect(transmit).toHaveBeenCalled();
    });

    // Bug fix (2026-08-25 pipeline review + Phase 1.3-3): backend-level
    // backstop against re-transmitting an invoice SUPER PDP already has a
    // live copy of — closes the gap a stale tab, a double-click, or the
    // auto-transmit cron racing a manual click could otherwise hit.
    it.each(['SENT', 'VALIDATED', 'DELIVERED', 'ACCEPTED'])(
      'refuses to re-transmit an invoice already %s, never calling the provider',
      async (status) => {
        const { service, transmit } = buildService({ eInvoiceTransmissionStatus: status });
        await expect(service.transmit('company-1', 'inv-1')).rejects.toThrow(ConflictException);
        expect(transmit).not.toHaveBeenCalled();
      },
    );
  });

  describe('refreshStatus', () => {
    it('throws SuperPdpUnavailableError for an invoice never transmitted', async () => {
      const { service } = buildService({ superPdpInvoiceId: null });
      await expect(service.refreshStatus('company-1', 'inv-1')).rejects.toThrow(
        SuperPdpUnavailableError,
      );
    });

    it('fetches and persists the latest status for a transmitted invoice', async () => {
      const { service, getStatus, updateEInvoiceTransmission } = buildService({
        superPdpInvoiceId: '999',
      });
      await service.refreshStatus('company-1', 'inv-1');

      expect(getStatus).toHaveBeenCalledWith({
        accessToken: 'access-token-abc',
        providerReference: '999',
      });
      expect(updateEInvoiceTransmission).toHaveBeenCalledWith(
        'company-1',
        'inv-1',
        expect.objectContaining({ status: 'ACCEPTED', rejectionReason: null }),
      );
    });
  });
});
