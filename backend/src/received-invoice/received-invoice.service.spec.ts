import { NotFoundException } from '@nestjs/common';
import { CompanySuperPdpService } from '../invoice/e-invoicing/company-super-pdp.service';
import { SuperPdpClientService } from '../invoice/e-invoicing/super-pdp-client.service';
import { ReceivedInvoiceRepository } from './received-invoice.repository';
import { ReceivedInvoiceService } from './received-invoice.service';

function buildService(
  options: {
    maxSyncedId?: string | null;
    listPages?: { invoices: { id: number }[]; hasAfter: boolean }[];
    storedInvoice?: { id: string; superPdpInvoiceId: string } | null;
  } = {},
) {
  const findAll = jest.fn().mockResolvedValue([]);
  const findMaxSuperPdpInvoiceId = jest.fn().mockResolvedValue(options.maxSyncedId ?? null);
  const upsertMany = jest.fn().mockResolvedValue(undefined);
  const findById = jest
    .fn()
    .mockResolvedValue(
      'storedInvoice' in options ? options.storedInvoice : { id: 'ri-1', superPdpInvoiceId: '42' },
    );
  const repository = {
    findAll,
    findMaxSuperPdpInvoiceId,
    upsertMany,
    findById,
  } as unknown as ReceivedInvoiceRepository;

  const getValidAccessToken = jest.fn().mockResolvedValue('access-token-abc');
  const companySuperPdp = { getValidAccessToken } as unknown as CompanySuperPdpService;

  let pageIndex = 0;
  const pages = options.listPages ?? [{ invoices: [], hasAfter: false }];
  const listIncomingInvoices = jest.fn().mockImplementation(() => {
    const page = pages[Math.min(pageIndex, pages.length - 1)];
    pageIndex++;
    return Promise.resolve(page);
  });
  const downloadInvoiceDocument = jest.fn().mockResolvedValue(Buffer.from('%PDF-fake'));
  const superPdpClient = {
    listIncomingInvoices,
    downloadInvoiceDocument,
  } as unknown as SuperPdpClientService;

  const service = new ReceivedInvoiceService(repository, companySuperPdp, superPdpClient);
  return {
    service,
    findAll,
    findMaxSuperPdpInvoiceId,
    upsertMany,
    listIncomingInvoices,
    downloadInvoiceDocument,
    findById,
  };
}

describe('ReceivedInvoiceService', () => {
  describe('sync', () => {
    it('starts paging from the highest already-synced id', async () => {
      const { service, listIncomingInvoices } = buildService({ maxSyncedId: '100' });
      await service.sync('company-1');
      expect(listIncomingInvoices).toHaveBeenCalledWith({
        accessToken: 'access-token-abc',
        startingAfterId: '100',
      });
    });

    it('starts from the beginning when nothing has ever been synced', async () => {
      const { service, listIncomingInvoices } = buildService({ maxSyncedId: null });
      await service.sync('company-1');
      expect(listIncomingInvoices).toHaveBeenCalledWith({
        accessToken: 'access-token-abc',
        startingAfterId: undefined,
      });
    });

    it('pages forward until hasAfter is false, upserting each page', async () => {
      const { service, upsertMany, listIncomingInvoices } = buildService({
        listPages: [
          { invoices: [{ id: 1 }, { id: 2 }], hasAfter: true },
          { invoices: [{ id: 3 }], hasAfter: false },
        ],
      });
      await service.sync('company-1');

      expect(listIncomingInvoices).toHaveBeenCalledTimes(2);
      expect(upsertMany).toHaveBeenCalledTimes(2);
      // Second page must page forward from the last id of the first page.
      expect(listIncomingInvoices).toHaveBeenNthCalledWith(2, {
        accessToken: 'access-token-abc',
        startingAfterId: '2',
      });
    });

    it('does not call upsertMany for an empty page', async () => {
      const { service, upsertMany } = buildService({
        listPages: [{ invoices: [], hasAfter: false }],
      });
      await service.sync('company-1');
      expect(upsertMany).not.toHaveBeenCalled();
    });
  });

  describe('downloadDocument', () => {
    it('throws NotFoundException when the received invoice does not belong to this company', async () => {
      const { service } = buildService({ storedInvoice: null });
      await expect(service.downloadDocument('company-1', 'ri-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('fetches the document using the stored superPdpInvoiceId', async () => {
      const { service, downloadInvoiceDocument } = buildService({
        storedInvoice: { id: 'ri-1', superPdpInvoiceId: '42' },
      });
      const buffer = await service.downloadDocument('company-1', 'ri-1');

      expect(downloadInvoiceDocument).toHaveBeenCalledWith({
        accessToken: 'access-token-abc',
        superPdpInvoiceId: '42',
      });
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });
});
