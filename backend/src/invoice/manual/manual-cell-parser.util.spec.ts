import { parseManualDecimalCell } from './manual-cell-parser.util';

describe('parseManualDecimalCell', () => {
  it('parses a plain integer', () => {
    expect(parseManualDecimalCell('10')?.toString()).toBe('10');
  });

  it('parses a dot decimal separator', () => {
    expect(parseManualDecimalCell('45.90')?.toString()).toBe('45.9');
  });

  it('parses a comma decimal separator, same as a dot', () => {
    expect(parseManualDecimalCell('45,90')?.toString()).toBe('45.9');
  });

  it('trims surrounding whitespace', () => {
    expect(parseManualDecimalCell('  12  ')?.toString()).toBe('12');
  });

  it('rejects an empty cell', () => {
    expect(parseManualDecimalCell('')).toBeNull();
  });

  it('accepts a negative value — a remise/acompte line on the manual canvas', () => {
    expect(parseManualDecimalCell('-5')?.toString()).toBe('-5');
    expect(parseManualDecimalCell('-150,00 €')?.toString()).toBe('-150');
  });

  it('accepts a typographic minus sign and a space after the sign', () => {
    expect(parseManualDecimalCell('−150')?.toString()).toBe('-150');
    expect(parseManualDecimalCell('- 150,50')?.toString()).toBe('-150.5');
  });

  it('rejects a sign anywhere but the front', () => {
    expect(parseManualDecimalCell('150-')).toBeNull();
    expect(parseManualDecimalCell('--150')).toBeNull();
  });

  it('applies the upper bound to the magnitude of a negative value', () => {
    expect(parseManualDecimalCell('-2000000')).toBeNull();
  });

  it('accepts a trailing € sign — formatManualPrice/format() add one to every UNIT_PRICE/LINE_TOTAL cell', () => {
    expect(parseManualDecimalCell('45,90 €')?.toString()).toBe('45.9');
    expect(parseManualDecimalCell('45,90€')?.toString()).toBe('45.9');
  });

  it('rejects a thousands separator', () => {
    expect(parseManualDecimalCell('1 000')).toBeNull();
  });

  it('rejects non-numeric free text', () => {
    expect(parseManualDecimalCell('beaucoup')).toBeNull();
  });

  it('rejects a value above the generous upper bound', () => {
    expect(parseManualDecimalCell('2000000')).toBeNull();
  });
});
