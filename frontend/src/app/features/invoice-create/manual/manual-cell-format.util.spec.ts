import {
  formatManualPrice,
  formatManualQuantity,
  formatManualText,
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

  it('returns null for a negative value', () => {
    expect(parseManualNumber('-5')).toBeNull();
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
  it('formats to exactly two decimals with a comma separator', () => {
    expect(formatManualPrice('1500')).toBe('1500,00');
    expect(formatManualPrice('45,9')).toBe('45,90');
  });

  it('leaves an unparseable cell untouched (trimmed)', () => {
    expect(formatManualPrice('gratuit')).toBe('gratuit');
  });
});

describe('formatManualText', () => {
  it('trims and collapses internal whitespace', () => {
    expect(formatManualText('  Parquet   chêne  massif  ')).toBe('Parquet chêne massif');
  });
});
