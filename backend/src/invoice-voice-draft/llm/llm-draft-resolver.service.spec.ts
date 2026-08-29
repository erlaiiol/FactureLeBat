import { ConfigService } from '@nestjs/config';
import { CompanyRepository } from '../../company/company.repository';
import { CustomerService } from '../../customer/customer.service';
import { ProductService } from '../../product/product.service';
import { ServiceCatalogService } from '../../service-catalog/service-catalog.service';
import { DraftResolverOutcome } from '../draft-resolver.interface';
import { REJECTED_MESSAGE } from '../invoice-voice-draft.constants';
import { InvoiceVoiceDraftRepository } from '../invoice-voice-draft.repository';
import { MAX_TOOL_ITERATIONS } from './llm-draft-resolver.constants';
import { LlmDraftResolverService } from './llm-draft-resolver.service';
import { LlmClient, LlmResponse } from './llm-client.interface';
import { LlmUnavailableError } from './llm-unavailable.error';

const COMPANY_ID = 'company-1';

function resolveDraftResponse(input: Record<string, unknown>): LlmResponse {
  return { toolCalls: [{ id: 'tool-1', name: 'resolve_draft', input }] };
}

function rejectResponse(): LlmResponse {
  return { toolCalls: [{ id: 'tool-1', name: 'reject', input: {} }] };
}

function searchToolResponse(toolName: string, query: string): LlmResponse {
  return { toolCalls: [{ id: 'tool-1', name: toolName, input: { query } }] };
}

function baseDraftInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    documentType: 'FACTURE',
    customer: { customerName: 'Xavier Dupont' },
    lines: [],
    serviceLines: [],
    notices: [],
    ...overrides,
  };
}

function buildResolver(options: {
  cap?: number;
  usedToday?: number;
  llmConfigured?: boolean;
  sendMessageImpl?: jest.Mock;
  customers?: unknown[];
}) {
  const countToday = jest.fn().mockResolvedValue(options.usedToday ?? 0);
  const recordUsage = jest.fn().mockResolvedValue(undefined);
  const usageRepository = { countToday, recordUsage } as unknown as InvoiceVoiceDraftRepository;

  const isConfigured = jest.fn().mockReturnValue(options.llmConfigured ?? true);
  const sendMessage = options.sendMessageImpl ?? jest.fn();
  const llmClient = { isConfigured, sendMessage } as unknown as LlmClient;

  const customerService = {
    searchFuzzy: jest.fn().mockResolvedValue(options.customers ?? []),
  } as unknown as CustomerService;
  const productService = {
    searchFuzzy: jest.fn().mockResolvedValue([]),
  } as unknown as ProductService;
  const serviceCatalogService = {
    searchFuzzy: jest.fn().mockResolvedValue([]),
  } as unknown as ServiceCatalogService;

  const companyRepository = {
    findById: jest.fn().mockResolvedValue({ defaultDepositPercentageBasisPoints: null }),
  } as unknown as CompanyRepository;

  const config = { get: jest.fn().mockReturnValue(options.cap ?? 30) } as unknown as ConfigService;

  const resolver = new LlmDraftResolverService(
    llmClient,
    usageRepository,
    customerService,
    productService,
    serviceCatalogService,
    companyRepository,
    config,
  );

  return { resolver, sendMessage, countToday, recordUsage };
}

function expectResolved(outcome: DraftResolverOutcome) {
  if (outcome.status !== 'resolved') {
    throw new Error(`expected a resolved outcome, got: ${JSON.stringify(outcome)}`);
  }
  return outcome.draft;
}

describe('LlmDraftResolverService.resolve', () => {
  it('resolves a clean draft in one round-trip', async () => {
    const sendMessage = jest.fn().mockResolvedValueOnce(resolveDraftResponse(baseDraftInput()));
    const { resolver } = buildResolver({ sendMessageImpl: sendMessage });

    const draft = expectResolved(await resolver.resolve(COMPANY_ID, 'x'));

    expect(draft.customer.customerName).toBe('Xavier Dupont');
  });

  it('runs a search-tool round-trip before resolving', async () => {
    const sendMessage = jest
      .fn()
      .mockResolvedValueOnce(searchToolResponse('search_customers', 'Dupont'))
      .mockResolvedValueOnce(resolveDraftResponse(baseDraftInput()));
    const { resolver } = buildResolver({
      sendMessageImpl: sendMessage,
      customers: [{ row: { id: 'cust-1', name: 'Xavier Dupont' }, score: 0.6 }],
    });

    const outcome = await resolver.resolve(COMPANY_ID, 'x');

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(outcome.status).toBe('resolved');
  });

  it('returns rejected when the model calls reject', async () => {
    const sendMessage = jest.fn().mockResolvedValueOnce(rejectResponse());
    const { resolver } = buildResolver({ sendMessageImpl: sendMessage });

    const outcome = await resolver.resolve(COMPANY_ID, 'bruit de fond');

    expect(outcome).toEqual({ status: 'rejected', message: REJECTED_MESSAGE });
  });

  it('rejects gracefully when resolve_draft input is structurally malformed', async () => {
    const sendMessage = jest
      .fn()
      .mockResolvedValueOnce(resolveDraftResponse({ documentType: 'FACTURE' }));
    const { resolver } = buildResolver({ sendMessageImpl: sendMessage });

    const outcome = await resolver.resolve(COMPANY_ID, 'x');

    expect(outcome.status).toBe('rejected');
  });

  it('throws a 503 when no LlmClient is configured', async () => {
    const { resolver } = buildResolver({ llmConfigured: false });

    await expect(resolver.resolve(COMPANY_ID, 'x')).rejects.toMatchObject({ status: 503 });
  });

  it('throws a 429 once the daily cap is reached', async () => {
    const { resolver, sendMessage } = buildResolver({ cap: 5, usedToday: 5 });

    await expect(resolver.resolve(COMPANY_ID, 'x')).rejects.toMatchObject({ status: 429 });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('maps a mid-loop LlmUnavailableError to a 503', async () => {
    const sendMessage = jest.fn().mockRejectedValue(new LlmUnavailableError('boom'));
    const { resolver } = buildResolver({ sendMessageImpl: sendMessage });

    await expect(resolver.resolve(COMPANY_ID, 'x')).rejects.toMatchObject({ status: 503 });
  });

  it('rejects gracefully after exceeding the max tool iterations instead of looping forever', async () => {
    const sendMessage = jest.fn().mockResolvedValue(searchToolResponse('search_customers', 'x'));
    const { resolver, sendMessage: sm } = buildResolver({
      sendMessageImpl: sendMessage,
      customers: [],
    });

    const outcome = await resolver.resolve(COMPANY_ID, 'x');

    expect(outcome.status).toBe('rejected');
    expect(sm).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS);
  });

  it('records usage once per attempt regardless of outcome', async () => {
    const sendMessage = jest.fn().mockResolvedValueOnce(rejectResponse());
    const { resolver, recordUsage } = buildResolver({ sendMessageImpl: sendMessage });

    await resolver.resolve(COMPANY_ID, 'x');

    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith(COMPANY_ID);
  });
});
