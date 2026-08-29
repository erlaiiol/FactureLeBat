import { CompanyRepository } from '../../company/company.repository';
import { CustomerService } from '../../customer/customer.service';
import { ProductService } from '../../product/product.service';
import { ServiceCatalogService } from '../../service-catalog/service-catalog.service';
import { REJECTED_MESSAGE } from '../invoice-voice-draft.constants';
import { RuleBasedDraftResolverService } from './rule-based-draft-resolver.service';

const COMPANY_ID = 'company-1';

function buildResolver(options: {
  defaultDepositPercentageBasisPoints?: number | null;
  customerMatches?: unknown[];
  productMatches?: unknown[];
  serviceMatches?: unknown[];
}) {
  const customerService = {
    searchFuzzy: jest.fn().mockResolvedValue(options.customerMatches ?? []),
  } as unknown as CustomerService;
  const productService = {
    searchFuzzy: jest.fn().mockResolvedValue(options.productMatches ?? []),
  } as unknown as ProductService;
  const serviceCatalogService = {
    searchFuzzy: jest.fn().mockResolvedValue(options.serviceMatches ?? []),
  } as unknown as ServiceCatalogService;
  const companyRepository = {
    findById: jest.fn().mockResolvedValue({
      defaultDepositPercentageBasisPoints: options.defaultDepositPercentageBasisPoints ?? null,
    }),
  } as unknown as CompanyRepository;

  return new RuleBasedDraftResolverService(
    customerService,
    productService,
    serviceCatalogService,
    companyRepository,
  );
}

describe('RuleBasedDraftResolverService.resolve', () => {
  it('is always available (no config, no external dependency)', () => {
    expect(buildResolver({}).isAvailable()).toBe(true);
  });

  it('rejects a transcript with nothing invoice-related in it', async () => {
    const resolver = buildResolver({});

    const outcome = await resolver.resolve(COMPANY_ID, 'quel temps fait-il aujourd’hui');

    expect(outcome).toEqual({ status: 'rejected', message: REJECTED_MESSAGE });
  });

  it('resolves a clean draft: confident customer, confident product, explicit deposit', async () => {
    const resolver = buildResolver({
      customerMatches: [{ row: { id: 'cust-1', name: 'Xavier Dupont' }, score: 0.9 }],
      productMatches: [
        {
          row: {
            id: 'prod-1',
            name: 'Parquet chêne massif',
            unit: 'SQUARE_METER',
            priceCents: 4500,
          },
          score: 0.85,
        },
      ],
    });

    const outcome = await resolver.resolve(
      COMPANY_ID,
      'Fais-moi une facture pour Xavier Dupont, 25m² de parquet chêne massif, et demande-lui un acompte de 30%.',
    );

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.draft.documentType).toBe('FACTURE');
    expect(outcome.draft.documentTypeNeedsReview).toBeUndefined();
    expect(outcome.draft.customer).toEqual({
      customerId: 'cust-1',
      customerName: 'Xavier Dupont',
      customerAddress: undefined,
      customerEmail: undefined,
      customerPhone: undefined,
    });
    expect(outcome.draft.lines).toEqual([
      {
        description: 'parquet chêne massif',
        unit: 'SQUARE_METER',
        quantity: 25,
        unitPriceCents: 4500,
        productId: 'prod-1',
      },
    ]);
    expect(outcome.draft.depositPercentageBasisPoints).toBe(3000);
  });

  it('flags ambiguous_match on the customer when two candidates are close', async () => {
    const resolver = buildResolver({
      customerMatches: [
        { row: { id: 'cust-1', name: 'Xavier Dupont' }, score: 0.7 },
        { row: { id: 'cust-2', name: 'Xavier Dupond' }, score: 0.68 },
      ],
    });

    const outcome = await resolver.resolve(COMPANY_ID, 'Fais un devis pour Xavier Dupont');

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.draft.customer.customerId).toBeUndefined();
    expect(outcome.draft.customer.needsReview).toEqual({
      reason: 'ambiguous_match',
      suggestion: { label: 'Xavier Dupont', value: 'cust-1' },
    });
  });

  it('flags no_match on the customer field when no "pour" clause is found', async () => {
    const resolver = buildResolver({});

    const outcome = await resolver.resolve(COMPANY_ID, 'facture, 25m2 de parquet');

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.draft.customer).toEqual({
      customerName: '',
      needsReview: { reason: 'no_match' },
    });
  });

  it('flags no_match on a line whose description matches nothing in the catalog', async () => {
    const resolver = buildResolver({});

    const outcome = await resolver.resolve(
      COMPANY_ID,
      'facture pour Xavier Dupont, 10 mètres de lambris exotique',
    );

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    // Bare "mètres" (no "carrés"/"linéaires"/"cubes") defaults to
    // LINEAR_METER — caught live 2026-08-29 (see the parser's own
    // comment): this used to silently drop the line entirely instead of
    // flagging it.
    expect(outcome.draft.lines).toEqual([
      {
        description: 'lambris exotique',
        unit: 'LINEAR_METER',
        quantity: 10,
        unitPriceCents: 0,
        needsReview: { reason: 'no_match' },
      },
    ]);
  });

  it('flags a line no_match when neither catalog matches, but keeps the dictated unit/quantity', async () => {
    const resolver = buildResolver({});

    const outcome = await resolver.resolve(
      COMPANY_ID,
      'facture pour Xavier Dupont, 10kg de mystère',
    );

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.draft.lines).toEqual([
      {
        description: 'mystère',
        unit: 'KILOGRAM',
        quantity: 10,
        unitPriceCents: 0,
        needsReview: { reason: 'no_match' },
      },
    ]);
  });

  it('prefers the service catalog over the product catalog when it scores higher', async () => {
    const resolver = buildResolver({
      productMatches: [
        { row: { id: 'prod-1', name: 'Pose', unit: 'HOUR', priceCents: 1000 }, score: 0.3 },
      ],
      serviceMatches: [
        {
          row: { id: 'svc-1', name: 'Pose parquet', pricingMode: 'FIXED', priceCents: 5000 },
          score: 0.8,
        },
      ],
    });

    const outcome = await resolver.resolve(
      COMPANY_ID,
      'facture pour Xavier Dupont, 3 heures de pose',
    );

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.draft.lines).toEqual([]);
    expect(outcome.draft.serviceLines).toEqual([
      {
        name: 'Pose parquet',
        description: 'pose',
        amountCents: 5000,
        serviceId: 'svc-1',
        needsReview: undefined,
      },
    ]);
  });

  it('flags a PERCENTAGE-priced service match as needsReview (no trustworthy amount)', async () => {
    const resolver = buildResolver({
      serviceMatches: [
        {
          row: { id: 'svc-1', name: 'Pose', pricingMode: 'PERCENTAGE', priceCents: null },
          score: 0.9,
        },
      ],
    });

    const outcome = await resolver.resolve(
      COMPANY_ID,
      'facture pour Xavier Dupont, 3 heures de pose',
    );

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.draft.serviceLines).toEqual([
      {
        name: 'Pose',
        description: 'pose',
        amountCents: 0,
        serviceId: 'svc-1',
        needsReview: { reason: 'no_match' },
      },
    ]);
  });

  it('resolves "acompte habituel" against the company default with no flag', async () => {
    const resolver = buildResolver({ defaultDepositPercentageBasisPoints: 2500 });

    const outcome = await resolver.resolve(
      COMPANY_ID,
      'facture pour Xavier Dupont et demande-lui l’acompte habituel',
    );

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.draft.depositPercentageBasisPoints).toBe(2500);
    expect(outcome.draft.depositNeedsReview).toBeUndefined();
  });

  it('surfaces a dictated remise as a notice, never as an applied field', async () => {
    const resolver = buildResolver({});

    const outcome = await resolver.resolve(
      COMPANY_ID,
      'facture pour Xavier Dupont, 25m2 de parquet, avec une remise de 10%',
    );

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.draft.notices).toEqual([expect.objectContaining({ detail: 'remise' })]);
  });
});
