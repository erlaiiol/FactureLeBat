import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SourcingSearchKind, Unit } from '../../generated/prisma/enums';
import { PlanFeatureLockedException } from '../billing/plan-feature-locked.exception';
import { PlanGateService } from '../billing/plan-gate.service';
import { GroqClientService } from './groq/groq-client.service';
import { GroqUnavailableError } from './groq/groq-unavailable.error';
import { SourcingRepository } from './sourcing.repository';
import { SourcingService } from './sourcing.service';

function buildService(options: {
  cap?: number;
  cachedResult?: unknown[] | null;
  usedToday?: number;
  groqConfigured?: boolean;
  groqResponse?: string;
  groqError?: Error;
  planAllowed?: boolean;
}) {
  const findFresh = jest.fn().mockResolvedValue(options.cachedResult ?? null);
  const countToday = jest.fn().mockResolvedValue(options.usedToday ?? 0);
  const save = jest.fn().mockResolvedValue(undefined);
  const repository = { findFresh, countToday, save } as unknown as SourcingRepository;

  const isConfigured = jest.fn().mockReturnValue(options.groqConfigured ?? true);
  const complete = options.groqError
    ? jest.fn().mockRejectedValue(options.groqError)
    : jest.fn().mockResolvedValue(options.groqResponse ?? JSON.stringify({ candidates: [] }));
  const groqClient = { isConfigured, complete } as unknown as GroqClientService;

  const assertFeatureAccess = jest
    .fn()
    .mockImplementation(() =>
      (options.planAllowed ?? true)
        ? Promise.resolve()
        : Promise.reject(new PlanFeatureLockedException('aiSourcing')),
    );
  const planGateService = { assertFeatureAccess } as unknown as PlanGateService;

  const configGet = jest.fn().mockReturnValue(options.cap ?? 20);
  const config = { get: configGet } as unknown as ConfigService;

  const service = new SourcingService(repository, groqClient, planGateService, config);
  return { service, findFresh, countToday, save, isConfigured, complete, assertFeatureAccess };
}

const COMPANY_ID = 'company-1';
function searchDto() {
  return { productName: 'Parquet chêne massif', quantity: 20, unit: Unit.SQUARE_METER };
}

describe('SourcingService.searchSuppliers', () => {
  it('returns cached results without calling Groq when a fresh cache entry exists', async () => {
    const cachedCandidates = [
      { name: 'Point P', priceRaw: null, priceCents: null, sourceName: null, sourceUrl: null },
    ];
    const { service, complete, save } = buildService({
      cachedResult: cachedCandidates,
      usedToday: 3,
    });

    const result = await service.searchSuppliers(COMPANY_ID, searchDto());

    expect(result.cached).toBe(true);
    expect(result.results).toEqual(cachedCandidates);
    expect(complete).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException when Groq has no API key configured', async () => {
    const { service } = buildService({ groqConfigured: false });

    await expect(service.searchSuppliers(COMPANY_ID, searchDto())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws a 429 once the daily cap is reached', async () => {
    const { service } = buildService({ cap: 5, usedToday: 5 });

    await expect(service.searchSuppliers(COMPANY_ID, searchDto())).rejects.toMatchObject({
      status: 429,
    });
  });

  it('calls Groq, persists the parsed result, and reports one fewer search remaining', async () => {
    const groqResponse = JSON.stringify({
      candidates: [{ name: 'Leroy Merlin', priceRaw: '45€', sourceName: null, sourceUrl: null }],
    });
    const { service, save, complete } = buildService({ cap: 20, usedToday: 4, groqResponse });

    const result = await service.searchSuppliers(COMPANY_ID, searchDto());

    expect(complete).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.any(String),
      SourcingSearchKind.SUPPLIER_SEARCH,
      expect.any(String),
      [
        {
          name: 'Leroy Merlin',
          priceRaw: '45€',
          priceCents: 4500,
          sourceName: null,
          sourceUrl: null,
        },
      ],
    );
    expect(result.cached).toBe(false);
    expect(result.searchesRemainingToday).toBe(20 - 4 - 1);
  });

  it('surfaces a Groq failure as a generic ServiceUnavailableException, never the raw error', async () => {
    const { service } = buildService({ groqError: new GroqUnavailableError('boom') });

    await expect(service.searchSuppliers(COMPANY_ID, searchDto())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('blocks a company whose tier does not include the AI assistant, before even checking the cache', async () => {
    const { service, findFresh } = buildService({ planAllowed: false });

    await expect(service.searchSuppliers(COMPANY_ID, searchDto())).rejects.toBeInstanceOf(
      PlanFeatureLockedException,
    );
    expect(findFresh).not.toHaveBeenCalled();
  });

  it('never counts a cache hit against the daily cap', async () => {
    const { service, save } = buildService({
      cap: 1,
      usedToday: 1,
      cachedResult: [
        { name: 'Cached', priceRaw: null, priceCents: null, sourceName: null, sourceUrl: null },
      ],
    });

    await expect(service.searchSuppliers(COMPANY_ID, searchDto())).resolves.toMatchObject({
      cached: true,
    });
    expect(save).not.toHaveBeenCalled();
  });
});
