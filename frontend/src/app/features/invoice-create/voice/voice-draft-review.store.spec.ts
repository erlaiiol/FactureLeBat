import { VoiceInvoiceDraft } from '../../../core/models/voice-draft.model';
import { VoiceDraftReviewStore } from './voice-draft-review.store';

function draft(overrides: Partial<VoiceInvoiceDraft> = {}): VoiceInvoiceDraft {
  return {
    documentType: 'FACTURE',
    customer: { customerName: 'Xavier Dupont' },
    lines: [],
    serviceLines: [],
    notices: [],
    ...overrides,
  };
}

describe('VoiceDraftReviewStore', () => {
  it('starts inactive with every flag unset', () => {
    const store = new VoiceDraftReviewStore();
    expect(store.active()).toBe(false);
    expect(store.customerNeedsReview()).toBeUndefined();
    expect(store.lineNeedsReview()).toEqual([]);
  });

  it('activate() copies every needsReview flag from the resolved draft', () => {
    const store = new VoiceDraftReviewStore();
    store.activate(
      draft({
        documentTypeNeedsReview: { reason: 'no_match' },
        customer: { customerName: 'Dupont', needsReview: { reason: 'ambiguous_match' } },
        lines: [
          {
            description: 'x',
            unit: 'SQUARE_METER',
            quantity: 1,
            unitPriceCents: 0,
            needsReview: { reason: 'no_match' },
          },
          { description: 'y', unit: 'HOUR', quantity: 1, unitPriceCents: 100 },
        ],
        depositPercentageBasisPoints: 2000,
        depositNeedsReview: { reason: 'document_type_conflict' },
        notices: [{ detail: 'remise', message: 'non pris en charge' }],
      }),
    );

    expect(store.active()).toBe(true);
    expect(store.documentTypeNeedsReview()).toEqual({ reason: 'no_match' });
    expect(store.customerNeedsReview()).toEqual({ reason: 'ambiguous_match' });
    expect(store.depositNeedsReview()).toEqual({ reason: 'document_type_conflict' });
    expect(store.lineNeedsReview()).toEqual([{ reason: 'no_match' }, undefined]);
    expect(store.notices()).toEqual([{ detail: 'remise', message: 'non pris en charge' }]);
  });

  it('clearLine() unsets only the targeted index, leaving the others untouched', () => {
    const store = new VoiceDraftReviewStore();
    store.activate(
      draft({
        lines: [
          {
            description: 'a',
            unit: 'UNIT',
            quantity: 1,
            unitPriceCents: 0,
            needsReview: { reason: 'no_match' },
          },
          {
            description: 'b',
            unit: 'UNIT',
            quantity: 1,
            unitPriceCents: 0,
            needsReview: { reason: 'no_match' },
          },
        ],
      }),
    );

    store.clearLine(0);

    expect(store.lineNeedsReview()).toEqual([undefined, { reason: 'no_match' }]);
  });

  it('removeLine() splices the array so later indices shift down', () => {
    const store = new VoiceDraftReviewStore();
    store.activate(
      draft({
        lines: [
          {
            description: 'a',
            unit: 'UNIT',
            quantity: 1,
            unitPriceCents: 0,
            needsReview: { reason: 'no_match' },
          },
          { description: 'b', unit: 'UNIT', quantity: 1, unitPriceCents: 0 },
        ],
      }),
    );

    store.removeLine(0);

    expect(store.lineNeedsReview()).toEqual([undefined]);
  });

  it('reset() clears everything back to the inactive state', () => {
    const store = new VoiceDraftReviewStore();
    store.activate(draft({ customer: { customerName: 'x', needsReview: { reason: 'no_match' } } }));

    store.reset();

    expect(store.active()).toBe(false);
    expect(store.customerNeedsReview()).toBeUndefined();
    expect(store.notices()).toEqual([]);
  });
});
