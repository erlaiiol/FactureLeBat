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

  it('rejects a negative value', () => {
    expect(parseManualDecimalCell('-5')).toBeNull();
  });

  it('rejects a currency symbol or thousands separator', () => {
    expect(parseManualDecimalCell('45,90 €')).toBeNull();
    expect(parseManualDecimalCell('1 000')).toBeNull();
  });

  it('rejects non-numeric free text', () => {
    expect(parseManualDecimalCell('beaucoup')).toBeNull();
  });

  it('rejects a value above the generous upper bound', () => {
    expect(parseManualDecimalCell('2000000')).toBeNull();
  });
});
