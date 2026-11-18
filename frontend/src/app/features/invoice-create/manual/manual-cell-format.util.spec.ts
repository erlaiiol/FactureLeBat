import {
  formatManualPrice,
  formatManualQuantity,
  formatManualText,
  parseManualCellNumber,
  parseManualNumber,
} from './manual-cell-format.util';

describe('parseManualNumber', () => {
  it('parses a plain integer', () => {
    expect(parseManualNumber('10')).toBe(10);
  });

  it('accepts a comma or dot decimal separator identically', () => {
    expect(parseManualNumber('10,5')).toBe(10.5);
    expect(parseManualNumber('10.5')).toBe(10.5);
  });

  it('returns null for non-numeric text', () => {
    expect(parseManualNumber('beaucoup')).toBeNull();
  });

  it('returns null for an empty cell', () => {
    expect(parseManualNumber('')).toBeNull();
  });

  it('returns null for a negative value by default (the totals override fields stay ≥ 0)', () => {
    expect(parseManualNumber('-5')).toBeNull();
  });

  it('accepts a negative value when allowed — a remise/acompte table cell', () => {
    expect(parseManualNumber('-5', { allowNegative: true })).toBe(-5);
    expect(parseManualCellNumber('-150,00 €')).toBe(-150);
  });

  it('normalizes a typographic minus and a space after the sign', () => {
    expect(parseManualCellNumber('−150')).toBe(-150);
    expect(parseManualCellNumber('- 12,5')).toBe(-12.5);
  });

  it('rejects a sign anywhere but the front', () => {
    expect(parseManualCellNumber('150-')).toBeNull();
    expect(parseManualCellNumber('--150')).toBeNull();
  });

  it('strips a "€" sign — formatManualPrice adds one to every price cell automatically', () => {
    expect(parseManualNumber('45,90 €')).toBe(45.9);
    expect(parseManualNumber('45,90€')).toBe(45.9);
  });
});

describe('formatManualQuantity', () => {
  it('drops trailing zeros', () => {
    expect(formatManualQuantity('10,500')).toBe('10,5');
    expect(formatManualQuantity('10.000')).toBe('10');
  });

  it('uses a comma decimal separator in the output', () => {
    expect(formatManualQuantity('2.75')).toBe('2,75');
  });

  it('leaves an unparseable cell untouched (trimmed), rather than discarding the typo', () => {
    expect(formatManualQuantity('  beaucoup  ')).toBe('beaucoup');
  });
});

describe('formatManualPrice', () => {
  it('formats to exactly two decimals with a comma separator and a trailing €', () => {
    expect(formatManualPrice('1500')).toBe('1500,00 €');
    expect(formatManualPrice('45,9')).toBe('45,90 €');
  });

  it('re-formats a cell that already carries a €, instead of doubling it', () => {
    expect(formatManualPrice('45,90 €')).toBe('45,90 €');
  });

  it('leaves an unparseable cell untouched (trimmed)', () => {
    expect(formatManualPrice('gratuit')).toBe('gratuit');
  });

  it('keeps the sign of a negative amount', () => {
    expect(formatManualPrice('-150')).toBe('-150,00 €');
    expect(formatManualPrice('− 45,9 €')).toBe('-45,90 €');
  });

  it('forces a negative amount on a deduction row, whatever sign was typed', () => {
    expect(formatManualPrice('150', { forceNegative: true })).toBe('-150,00 €');
    expect(formatManualPrice('-150', { forceNegative: true })).toBe('-150,00 €');
  });

  it('never prints "-0,00 €"', () => {
    expect(formatManualPrice('0', { forceNegative: true })).toBe('0,00 €');
  });
});

describe('formatManualText', () => {
  it('trims and collapses internal whitespace', () => {
    expect(formatManualText('  Parquet   chêne  massif  ')).toBe('Parquet chêne massif');
  });
});
