// pdfjs-dist 6.x leans on two JS built-ins that only just reached Stage 4
// (ES2026) and that no shipped browser engine — including current iOS
// Safari — implements natively yet:
//
// - Map/WeakMap.prototype.getOrInsertComputed (the TC39 "upsert" proposal,
//   Stage 4 January 2026), used throughout pdf.js's rendering pipeline for
//   internal cache lookups (annotations, patterns, optional-content config,
//   per-page method-promise dedup, ...). Confirmed on a real iPhone running
//   iOS 18.6 Safari: PdfCanvasViewerComponent's render() threw
//   "getOrInsertComputed is not a function" from inside pdf.js's
//   getOptionalContentConfig. pdf.js ships no fallback of its own for
//   engines that lack it (mozilla/pdf.js#20680 is the same regression
//   against a different call site).
// - Math.sumPrecise (the TC39 "Math.sum" proposal, Stage 4 July 2025), used
//   by the worker's font subsetting/text-layout code. Its absence doesn't
//   crash rendering — pdf.js apparently swallows the TypeError somewhere
//   downstream — but surfaces as a font-substitution warning and presumably
//   a less accurate fallback; better to give it the real thing.
//
// Import this file for its side effect only, before pdfjs-dist ever runs —
// see pdf-canvas-viewer.component.ts, its only consumer.
export {};

declare global {
  interface Map<K, V> {
    getOrInsertComputed(key: K, callbackFn: (key: K) => V): V;
    getOrInsert(key: K, value: V): V;
  }
  interface WeakMap<K extends WeakKey, V> {
    getOrInsertComputed(key: K, callbackFn: (key: K) => V): V;
    getOrInsert(key: K, value: V): V;
  }
  interface Math {
    sumPrecise(items: Iterable<number>): number;
  }
}

if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Map.prototype.getOrInsertComputed = function (key, callbackFn) {
    if (!this.has(key)) {
      this.set(key, callbackFn(key));
    }
    return this.get(key)!;
  };
}
if (typeof Map.prototype.getOrInsert !== 'function') {
  Map.prototype.getOrInsert = function (key, value) {
    if (!this.has(key)) {
      this.set(key, value);
    }
    return this.get(key)!;
  };
}
if (typeof WeakMap.prototype.getOrInsertComputed !== 'function') {
  WeakMap.prototype.getOrInsertComputed = function (key, callbackFn) {
    if (!this.has(key)) {
      this.set(key, callbackFn(key));
    }
    return this.get(key)!;
  };
}
if (typeof WeakMap.prototype.getOrInsert !== 'function') {
  WeakMap.prototype.getOrInsert = function (key, value) {
    if (!this.has(key)) {
      this.set(key, value);
    }
    return this.get(key)!;
  };
}

if (typeof Math.sumPrecise !== 'function') {
  // Neumaier (improved Kahan) compensated summation — not the exact
  // arbitrary-precision algorithm the spec uses internally, but accurate
  // to well beyond what any of pdf.js's own use cases need, and a strict
  // improvement over naive `+=` accumulation either way.
  Math.sumPrecise = function (items: Iterable<number>): number {
    let sum = 0;
    let compensation = 0;
    for (const value of items) {
      if (typeof value !== 'number') {
        throw new TypeError('Math.sumPrecise: every value must be a number');
      }
      const t = sum + value;
      compensation += Math.abs(sum) >= Math.abs(value) ? sum - t + value : value - t + sum;
      sum = t;
    }
    return sum + compensation;
  };
}
