import { CreateInvoiceServiceLineDto } from './dto/create-invoice-service-line.dto';
import { RedistributionStrategy } from './dto/redistribution-strategy.enum';
import { expandServiceLineWeights } from './redistribution.util';

function serviceLineFixture(
  overrides: Partial<CreateInvoiceServiceLineDto> = {},
): CreateInvoiceServiceLineDto {
  return {
    name: 'Savoir-faire',
    amountCents: 10000,
    visibility: 'VISIBLE',
    ...overrides,
  };
}

describe('expandServiceLineWeights', () => {
  it('returns undefined for a VISIBLE service line, since it has no redistribution', () => {
    const weights = expandServiceLineWeights(serviceLineFixture({ visibility: 'VISIBLE' }), 3);
    expect(weights).toBeUndefined();
  });

  it('expands an EQUAL strategy into a weight of 1 per invoice line', () => {
    const weights = expandServiceLineWeights(
      serviceLineFixture({
        visibility: 'REDISTRIBUTED',
        redistributionStrategy: RedistributionStrategy.EQUAL,
      }),
      3,
    );
    expect(weights).toEqual([1, 1, 1]);
  });

  it('returns an empty array for an EQUAL strategy against zero invoice lines', () => {
    const weights = expandServiceLineWeights(
      serviceLineFixture({
        visibility: 'REDISTRIBUTED',
        redistributionStrategy: RedistributionStrategy.EQUAL,
      }),
      0,
    );
    expect(weights).toEqual([]);
  });

  it('passes a WEIGHTED strategy through unchanged', () => {
    const weights = expandServiceLineWeights(
      serviceLineFixture({
        visibility: 'REDISTRIBUTED',
        redistributionStrategy: RedistributionStrategy.WEIGHTED,
        weights: [3, 1, 2],
      }),
      3,
    );
    expect(weights).toEqual([3, 1, 2]);
  });
});
