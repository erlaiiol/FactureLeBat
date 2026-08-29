import { FuzzyMatch } from '../../common/fuzzy-match';
import { pickBestMatch } from './fuzzy-confidence.util';

function match(id: string, score: number): FuzzyMatch<{ id: string }> {
  return { row: { id }, score };
}

describe('pickBestMatch', () => {
  it('flags no_match when there are no candidates', () => {
    expect(pickBestMatch([])).toEqual({ reason: 'no_match' });
  });

  it('picks a single confident candidate outright', () => {
    const result = pickBestMatch([match('a', 0.8)]);
    expect(result.picked).toEqual(match('a', 0.8));
    expect(result.reason).toBeUndefined();
  });

  it('flags low_confidence_match for a single weak candidate', () => {
    const result = pickBestMatch([match('a', 0.3)]);
    expect(result.picked).toBeUndefined();
    expect(result.reason).toBe('low_confidence_match');
    expect(result.suggestionCandidate).toEqual(match('a', 0.3));
  });

  it('flags ambiguous_match when the top two candidates are close', () => {
    const result = pickBestMatch([match('a', 0.7), match('b', 0.65)]);
    expect(result.picked).toBeUndefined();
    expect(result.reason).toBe('ambiguous_match');
    expect(result.suggestionCandidate).toEqual(match('a', 0.7));
  });

  it('picks the top candidate when it clearly outscores the rest', () => {
    const result = pickBestMatch([match('a', 0.9), match('b', 0.3)]);
    expect(result.picked).toEqual(match('a', 0.9));
    expect(result.reason).toBeUndefined();
  });
});
