import { Unit } from '../../../generated/prisma/enums';
import {
  detectDeposit,
  detectDocumentType,
  extractCustomerNameCandidate,
  extractLineCandidates,
  hasNoExtractableContent,
} from './voice-draft-rule-based-parser.util';

describe('detectDocumentType', () => {
  it('detects facture', () => {
    expect(detectDocumentType('Fais-moi une facture pour Xavier Dupont')).toEqual({
      documentType: 'FACTURE',
      confident: true,
    });
  });

  it('detects devis', () => {
    expect(detectDocumentType('Prépare un devis pour Xavier Dupont')).toEqual({
      documentType: 'DEVIS',
      confident: true,
    });
  });

  it('is not confident when both words are said (self-correction)', () => {
    const result = detectDocumentType('Fais un devis... non, en fait une facture pour Dupont');
    expect(result.confident).toBe(false);
    expect(result.documentType).toBe('FACTURE');
  });

  it('is not confident when neither word is said', () => {
    const result = detectDocumentType('Prépare-moi quelque chose pour Dupont');
    expect(result.confident).toBe(false);
  });

  it('does not match a whole word inside another word', () => {
    // "confacture" is not a real word but exercises the \b boundary
    expect(detectDocumentType('confacturex Dupont').confident).toBe(false);
  });
});

describe('detectDeposit', () => {
  it('extracts an explicit percentage', () => {
    expect(detectDeposit('demande-lui un acompte de 30%', null)).toEqual({
      mentioned: true,
      percentageBasisPoints: 3000,
    });
  });

  it('resolves "acompte habituel" against the company default', () => {
    expect(detectDeposit('demande-lui l’acompte habituel', 2500)).toEqual({
      mentioned: true,
      percentageBasisPoints: 2500,
    });
  });

  it('flags "acompte habituel" with no company default', () => {
    expect(detectDeposit('demande-lui l’acompte habituel', null)).toEqual({
      mentioned: true,
      habitualWithNoDefault: true,
    });
  });

  it('flags a bare "acompte" mention with no usable rate', () => {
    expect(detectDeposit('il faut un acompte', null)).toEqual({ mentioned: true });
  });

  it('reports not mentioned when absent', () => {
    expect(detectDeposit('facture pour Dupont, 25m² de parquet', null)).toEqual({
      mentioned: false,
    });
  });
});

describe('extractCustomerNameCandidate', () => {
  it('extracts the name after "pour" up to the next comma', () => {
    expect(
      extractCustomerNameCandidate('Fais-moi une facture pour Xavier Dupont, je mets 25m2'),
    ).toBe('Xavier Dupont');
  });

  it('extracts the name after "pour" up to "je"', () => {
    expect(extractCustomerNameCandidate('facture pour Xavier Dupont je mets 25m2')).toBe(
      'Xavier Dupont',
    );
  });

  it('returns undefined when there is no "pour" clause', () => {
    expect(extractCustomerNameCandidate('25m2 de parquet chêne massif')).toBeUndefined();
  });
});

describe('extractLineCandidates', () => {
  it('extracts a single quantity+unit+description line', () => {
    const lines = extractLineCandidates('25m2 de parquet chêne massif');
    expect(lines).toEqual([
      { quantity: 25, unit: Unit.SQUARE_METER, description: 'parquet chêne massif' },
    ]);
  });

  it('extracts two lines separated by "et"', () => {
    const lines = extractLineCandidates('25m² de parquet chêne massif et 3 heures de pose');
    expect(lines).toEqual([
      { quantity: 25, unit: Unit.SQUARE_METER, description: 'parquet chêne massif' },
      { quantity: 3, unit: Unit.HOUR, description: 'pose' },
    ]);
  });

  it('stops a description at the deposit clause', () => {
    const lines = extractLineCandidates(
      '25m² de parquet chêne massif et demande un acompte de 30%',
    );
    expect(lines).toEqual([
      { quantity: 25, unit: Unit.SQUARE_METER, description: 'parquet chêne massif' },
    ]);
  });

  it('handles a decimal quantity with a comma', () => {
    const lines = extractLineCandidates('12,5 kg de colle');
    expect(lines).toEqual([{ quantity: 12.5, unit: Unit.KILOGRAM, description: 'colle' }]);
  });

  it('defaults a bare "mètres" (no carrés/linéaires/cubes) to LINEAR_METER', () => {
    const lines = extractLineCandidates('10 mètres de lambris exotique');
    expect(lines).toEqual([
      { quantity: 10, unit: Unit.LINEAR_METER, description: 'lambris exotique' },
    ]);
  });

  it('still prefers SQUARE_METER over the bare "mètres" fallback when "carrés" is said', () => {
    const lines = extractLineCandidates('25 mètres carrés de parquet');
    expect(lines).toEqual([{ quantity: 25, unit: Unit.SQUARE_METER, description: 'parquet' }]);
  });

  it('returns no lines for a spelled-out number (documented gap)', () => {
    expect(extractLineCandidates('vingt-cinq mètres carrés de parquet')).toEqual([]);
  });

  it('returns no lines when nothing matches', () => {
    expect(extractLineCandidates('facture pour Xavier Dupont')).toEqual([]);
  });
});

describe('hasNoExtractableContent', () => {
  it('is true for a transcript with nothing invoice-related', () => {
    expect(hasNoExtractableContent('quel temps fait-il aujourd’hui')).toBe(true);
  });

  it('is false when a document type is confidently detected', () => {
    expect(hasNoExtractableContent('fais-moi une facture')).toBe(false);
  });

  it('is false when a customer candidate is found', () => {
    expect(hasNoExtractableContent('quelque chose pour Xavier Dupont')).toBe(false);
  });

  it('is false when a line candidate is found', () => {
    expect(hasNoExtractableContent('25m2 de parquet')).toBe(false);
  });
});
