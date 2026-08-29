import { CustomerService } from '../customer/customer.service';
import { ProductService } from '../product/product.service';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { DraftResolver, RawVoiceDraftInput } from './draft-resolver.interface';
import { VoiceDraftResult } from './entities/voice-invoice-draft.entity';
import { InvoiceVoiceDraftService } from './invoice-voice-draft.service';

const COMPANY_ID = 'company-1';

function rawDraft(overrides: Partial<RawVoiceDraftInput> = {}): RawVoiceDraftInput {
  return {
    documentType: 'FACTURE',
    customer: { customerName: 'Xavier Dupont' },
    lines: [],
    serviceLines: [],
    notices: [],
    ...overrides,
  };
}

function buildService(options: {
  resolveImpl?: jest.Mock;
  resolverAvailable?: boolean;
  findCustomerById?: (id: string) => Record<string, unknown> | null;
  findProductById?: (id: string) => Record<string, unknown> | null;
  findServiceById?: (id: string) => Record<string, unknown> | null;
}) {
  // A test double for DraftResolver — never a specific engine. This spec
  // only exercises InvoiceVoiceDraftService's own job (the shared
  // re-validation pass), the same regardless of which real resolver
  // produced the raw draft; see rule-based/ and llm/ for each engine's own
  // tests.
  const isAvailable = jest.fn().mockReturnValue(options.resolverAvailable ?? true);
  const resolve =
    options.resolveImpl ?? jest.fn().mockResolvedValue({ status: 'resolved', draft: rawDraft() });
  const draftResolver = { isAvailable, resolve } as unknown as DraftResolver;

  const customerService = {
    findByIdOrNull: jest
      .fn()
      .mockImplementation((_companyId: string, id: string) =>
        Promise.resolve(options.findCustomerById ? options.findCustomerById(id) : null),
      ),
  } as unknown as CustomerService;

  const productService = {
    findByIdOrNull: jest
      .fn()
      .mockImplementation((_companyId: string, id: string) =>
        Promise.resolve(options.findProductById ? options.findProductById(id) : null),
      ),
  } as unknown as ProductService;

  const serviceCatalogService = {
    findByIdOrNull: jest
      .fn()
      .mockImplementation((_companyId: string, id: string) =>
        Promise.resolve(options.findServiceById ? options.findServiceById(id) : null),
      ),
  } as unknown as ServiceCatalogService;

  const service = new InvoiceVoiceDraftService(
    draftResolver,
    customerService,
    productService,
    serviceCatalogService,
  );

  return { service, resolve };
}

function expectResolved(result: VoiceDraftResult) {
  if (result.status !== 'resolved') {
    throw new Error(`expected a resolved draft, got: ${JSON.stringify(result)}`);
  }
  return result.draft;
}

describe('InvoiceVoiceDraftService.resolveDraft', () => {
  it('passes through a rejected outcome from the resolver unchanged', async () => {
    const resolve = jest.fn().mockResolvedValue({ status: 'rejected', message: 'nope' });
    const { service } = buildService({ resolveImpl: resolve });

    const result = await service.resolveDraft(COMPANY_ID, { transcript: 'bruit de fond' });

    expect(result).toEqual({ status: 'rejected', message: 'nope' });
  });

  it('resolves a clean draft with no needsReview when every reference matches confidently', async () => {
    const resolve = jest.fn().mockResolvedValue({
      status: 'resolved',
      draft: rawDraft({
        customer: { customerId: 'cust-1', customerName: 'Xavier Dupont' },
        lines: [
          {
            description: 'Parquet chêne massif',
            unit: 'SQUARE_METER',
            quantity: 25,
            unitPriceCents: 999,
            productId: 'prod-1',
          },
        ],
        depositPercentageBasisPoints: 3000,
      }),
    });
    const { service } = buildService({
      resolveImpl: resolve,
      findCustomerById: (id) => (id === 'cust-1' ? { id: 'cust-1' } : null),
      findProductById: (id) =>
        id === 'prod-1' ? { id: 'prod-1', unit: 'SQUARE_METER', priceCents: 4500 } : null,
    });

    const draft = expectResolved(await service.resolveDraft(COMPANY_ID, { transcript: 'x' }));

    expect(draft.customer.customerId).toBe('cust-1');
    expect(draft.customer.needsReview).toBeUndefined();
    expect(draft.lines[0].productId).toBe('prod-1');
    expect(draft.lines[0].needsReview).toBeUndefined();
    // Price/unit are overwritten from the real Product row, never trusted
    // from the resolving engine's own echoed values.
    expect(draft.lines[0].unitPriceCents).toBe(4500);
    expect(draft.depositPercentageBasisPoints).toBe(3000);
  });

  it('drops a customerId that does not belong to this company and flags needsReview instead of trusting it', async () => {
    const resolve = jest.fn().mockResolvedValue({
      status: 'resolved',
      draft: rawDraft({
        customer: { customerId: 'other-company-customer', customerName: 'Xavier Dupont' },
      }),
    });
    const { service } = buildService({ resolveImpl: resolve, findCustomerById: () => null });

    const draft = expectResolved(await service.resolveDraft(COMPANY_ID, { transcript: 'x' }));

    expect(draft.customer.customerId).toBeUndefined();
    expect(draft.customer.needsReview).toEqual({ reason: 'no_match' });
  });

  it('flags document_type_conflict on a deposit requested on a devis even if the engine forgot to', async () => {
    const resolve = jest.fn().mockResolvedValue({
      status: 'resolved',
      draft: rawDraft({ documentType: 'DEVIS', depositPercentageBasisPoints: 2000 }),
    });
    const { service } = buildService({ resolveImpl: resolve });

    const draft = expectResolved(await service.resolveDraft(COMPANY_ID, { transcript: 'x' }));

    expect(draft.depositPercentageBasisPoints).toBe(2000);
    expect(draft.depositNeedsReview).toEqual({ reason: 'document_type_conflict' });
  });

  it('flags a line with no matched product as needsReview even if the engine omitted it', async () => {
    const resolve = jest.fn().mockResolvedValue({
      status: 'resolved',
      draft: rawDraft({
        lines: [
          {
            description: 'Lambris exotique édition limitée',
            unit: 'SQUARE_METER',
            quantity: 10,
            unitPriceCents: 0,
          },
        ],
      }),
    });
    const { service } = buildService({ resolveImpl: resolve });

    const draft = expectResolved(await service.resolveDraft(COMPANY_ID, { transcript: 'x' }));

    expect(draft.lines[0].productId).toBeUndefined();
    expect(draft.lines[0].needsReview).toEqual({ reason: 'no_match' });
  });

  it('drops a forged needsReview.suggestion id that does not belong to this company', async () => {
    const resolve = jest.fn().mockResolvedValue({
      status: 'resolved',
      draft: rawDraft({
        customer: {
          customerName: 'Dupont',
          needsReview: {
            reason: 'ambiguous_match',
            suggestion: { label: 'Someone Else', value: 'other-company-customer' },
          },
        },
      }),
    });
    const { service } = buildService({ resolveImpl: resolve, findCustomerById: () => null });

    const draft = expectResolved(await service.resolveDraft(COMPANY_ID, { transcript: 'x' }));

    expect(draft.customer.needsReview).toEqual({ reason: 'ambiguous_match' });
  });
});
