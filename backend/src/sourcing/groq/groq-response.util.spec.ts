import { parseComplementarySuggestions, parseSupplierCandidates } from './groq-response.util';
import { GroqUnavailableError } from './groq-unavailable.error';

describe('parseSupplierCandidates', () => {
  it('parses a well-formed candidate list', () => {
    const raw = JSON.stringify({
      candidates: [
        {
          name: 'Point P',
          priceRaw: '45,00 €/m²',
          sourceName: 'Point P',
          sourceUrl: 'https://pointp.fr/x',
        },
      ],
    });

    expect(parseSupplierCandidates(raw)).toEqual([
      {
        name: 'Point P',
        priceRaw: '45,00 €/m²',
        priceCents: 4500,
        sourceName: 'Point P',
        sourceUrl: 'https://pointp.fr/x',
      },
    ]);
  });

  it('throws GroqUnavailableError when the response is not valid JSON', () => {
    expect(() => parseSupplierCandidates('not json')).toThrow(GroqUnavailableError);
  });

  it('returns an empty array when the "candidates" key is absent', () => {
    expect(parseSupplierCandidates(JSON.stringify({ foo: 'bar' }))).toEqual([]);
  });

  it('drops an individual candidate with no name instead of failing the whole search', () => {
    const raw = JSON.stringify({
      candidates: [{ priceRaw: '10€' }, { name: 'Leroy Merlin', priceRaw: null }],
    });

    expect(parseSupplierCandidates(raw)).toEqual([
      { name: 'Leroy Merlin', priceRaw: null, priceCents: null, sourceName: null, sourceUrl: null },
    ]);
  });

  it('never lets an unsafe URL scheme through as sourceUrl', () => {
    const raw = JSON.stringify({
      candidates: [{ name: 'Suspect', sourceUrl: 'javascript:alert(1)' }],
    });

    expect(parseSupplierCandidates(raw)[0].sourceUrl).toBeNull();
  });

  it('caps the result at 5 candidates even if the model returns more', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({ name: `Fournisseur ${i}` }));
    const raw = JSON.stringify({ candidates });

    expect(parseSupplierCandidates(raw)).toHaveLength(5);
  });
});

describe('parseComplementarySuggestions', () => {
  it('parses a well-formed suggestion list', () => {
    const raw = JSON.stringify({
      suggestions: [
        { name: 'Colle PU', reason: 'Nécessaire pour la pose collée', category: 'Colle' },
      ],
    });

    expect(parseComplementarySuggestions(raw)).toEqual([
      { name: 'Colle PU', reason: 'Nécessaire pour la pose collée', category: 'Colle' },
    ]);
  });

  it('defaults a missing reason to an empty string rather than dropping the suggestion', () => {
    const raw = JSON.stringify({ suggestions: [{ name: 'Plinthes' }] });

    expect(parseComplementarySuggestions(raw)).toEqual([
      { name: 'Plinthes', reason: '', category: null },
    ]);
  });

  it('throws GroqUnavailableError on malformed JSON', () => {
    expect(() => parseComplementarySuggestions('{broken')).toThrow(GroqUnavailableError);
  });
});
