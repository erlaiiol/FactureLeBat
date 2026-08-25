import { CompanyService } from '../company/company.service';
import { CustomerService } from '../customer/customer.service';
import { DiscountService } from '../discount/discount.service';
import { PlanGateService } from '../billing/plan-gate.service';
import { ProductService } from '../product/product.service';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CompanySuperPdpService } from './e-invoicing/company-super-pdp.service';
import { CreateInvoiceData, InvoiceRepository } from './invoice.repository';
import { InvoiceMapper } from './invoice.mapper';
import { InvoiceService } from './invoice.service';

// Phase 1.3-3 (2026 e-invoicing reform, workflow automation): focused
// narrowly on the new auto-transmit scheduling logic — create()/
// convertToFacture()'s other ~200 lines of line/service/discount handling
// already have no unit-level coverage in this codebase (verified: no prior
// invoice.service.spec.ts existed) and re-testing all of that is out of
// scope here. Every dependency this scheduling logic doesn't touch is
// stubbed to the minimum that lets create()/convertToFacture() complete.
function buildService(options: { superPdpConnected?: boolean } = {}) {
  const createWithSequentialNumber = jest
    .fn<
      Promise<{ id: string; documentType: string; scheduledTransmitAt: Date | null }>,
      [CreateInvoiceData]
    >()
    .mockImplementation((data) =>
      Promise.resolve({
        id: 'inv-1',
        documentType: data.documentType,
        scheduledTransmitAt: data.scheduledTransmitAt ?? null,
      }),
    );
  const findById = jest.fn().mockResolvedValue({
    id: 'devis-1',
    documentType: 'DEVIS',
    customerName: 'M. Dupont',
    customerFields: [],
    lines: [],
    serviceLines: [],
    discountLines: [],
    manualColumns: [],
    manualRows: [],
    entryMode: 'GUIDED',
  });
  const cancelScheduledTransmit = jest
    .fn()
    .mockResolvedValue({ id: 'inv-1', scheduledTransmitAt: null });
  const invoiceRepository = {
    createWithSequentialNumber,
    findById,
    cancelScheduledTransmit,
  } as unknown as InvoiceRepository;

  const getProfile = jest.fn().mockResolvedValue({
    id: 'company-1',
    legalStatus: 'MICRO_ENTREPRENEUR',
    vatRateBasisPoints: 2000,
    autoTransmitViaPa: true,
  });
  const companyService = { getProfile } as unknown as CompanyService;

  const isConnected = jest.fn().mockResolvedValue(options.superPdpConnected ?? true);
  const companySuperPdp = { isConnected } as unknown as CompanySuperPdpService;

  const toInvoiceWithTotals = jest
    .fn()
    .mockImplementation(
      (invoice: { documentType: string; scheduledTransmitAt: Date | null }) => invoice,
    );
  const mapper = { toInvoiceWithTotals } as unknown as InvoiceMapper;

  const premiumGate = {
    assertCanCreateInvoice: jest.fn().mockResolvedValue(undefined),
    recordInvoiceCreated: jest.fn().mockResolvedValue(undefined),
  } as unknown as PlanGateService;

  const customerService = {} as unknown as CustomerService;
  const serviceCatalogService = {} as unknown as ServiceCatalogService;
  const discountService = {} as unknown as DiscountService;
  const productService = {} as unknown as ProductService;

  const service = new InvoiceService(
    invoiceRepository,
    companyService,
    customerService,
    serviceCatalogService,
    discountService,
    productService,
    mapper,
    premiumGate,
    companySuperPdp,
  );

  return {
    service,
    createWithSequentialNumber,
    findById,
    cancelScheduledTransmit,
    getProfile,
    isConnected,
  };
}

function dtoFixture(overrides: Partial<CreateInvoiceDto> = {}): CreateInvoiceDto {
  return {
    customerName: 'M. Dupont',
    lines: [
      {
        description: 'Parquet',
        unit: 'SQUARE_METER',
        quantity: 10,
        unitPriceCents: 4500,
        wasteSurcharge: 'NONE',
      },
    ],
    ...overrides,
  };
}

describe('InvoiceService.create — auto-transmit scheduling', () => {
  it('schedules a FACTURE when autoTransmitViaPa is on and SUPER PDP is connected', async () => {
    const { service, createWithSequentialNumber } = buildService({ superPdpConnected: true });

    await service.create('company-1', dtoFixture({ documentType: 'FACTURE' }));

    const data = createWithSequentialNumber.mock.calls[0][0];
    expect(data.scheduledTransmitAt).toBeInstanceOf(Date);
    expect(data.scheduledTransmitAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('never schedules a DEVIS, even when autoTransmitViaPa is on', async () => {
    const { service, createWithSequentialNumber } = buildService({ superPdpConnected: true });

    await service.create('company-1', dtoFixture({ documentType: 'DEVIS' }));

    const data = createWithSequentialNumber.mock.calls[0][0];
    expect(data.scheduledTransmitAt).toBeUndefined();
  });

  it('never schedules when SUPER PDP is not connected, even with the toggle on', async () => {
    const { service, createWithSequentialNumber } = buildService({ superPdpConnected: false });

    await service.create('company-1', dtoFixture({ documentType: 'FACTURE' }));

    const data = createWithSequentialNumber.mock.calls[0][0];
    expect(data.scheduledTransmitAt).toBeUndefined();
  });

  it('never schedules when autoTransmitViaPa is off — regression pin for the default', async () => {
    const { service, createWithSequentialNumber, getProfile } = buildService({
      superPdpConnected: true,
    });
    getProfile.mockResolvedValue({
      id: 'company-1',
      legalStatus: 'MICRO_ENTREPRENEUR',
      vatRateBasisPoints: 2000,
      autoTransmitViaPa: false,
    });

    await service.create('company-1', dtoFixture({ documentType: 'FACTURE' }));

    const data = createWithSequentialNumber.mock.calls[0][0];
    expect(data.scheduledTransmitAt).toBeUndefined();
  });
});

describe('InvoiceService.convertToFacture — auto-transmit scheduling', () => {
  it('schedules the resulting facture the same way create() does', async () => {
    const { service, createWithSequentialNumber } = buildService({ superPdpConnected: true });

    await service.convertToFacture('company-1', 'devis-1');

    const data = createWithSequentialNumber.mock.calls[0][0];
    expect(data.scheduledTransmitAt).toBeInstanceOf(Date);
  });
});

describe('InvoiceService.cancelAutoTransmit', () => {
  it('verifies the invoice exists for this company before cancelling', async () => {
    const { service, findById, cancelScheduledTransmit } = buildService();

    await service.cancelAutoTransmit('company-1', 'inv-1');

    expect(findById).toHaveBeenCalledWith('company-1', 'inv-1');
    expect(cancelScheduledTransmit).toHaveBeenCalledWith('company-1', 'inv-1');
  });

  it('throws NotFoundException for a missing/foreign invoice, never reaching the repository cancel call', async () => {
    const { service, findById, cancelScheduledTransmit } = buildService();
    findById.mockResolvedValue(null);

    await expect(service.cancelAutoTransmit('company-1', 'missing')).rejects.toThrow();
    expect(cancelScheduledTransmit).not.toHaveBeenCalled();
  });
});
