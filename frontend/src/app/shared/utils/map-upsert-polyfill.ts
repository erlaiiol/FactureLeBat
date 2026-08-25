// pdfjs-dist 6.x calls the brand-new Map/WeakMap.prototype.getOrInsertComputed
// (the TC39 "upsert" proposal — only reached Stage 4 in January 2026)
// throughout its rendering pipeline: every internal cache lookup
// (annotations, patterns, optional-content config, per-page method-promise
// dedup, ...) goes through it. No shipped browser engine implements it
// natively yet — confirmed on a real iPhone running iOS 18.6 Safari, where
// PdfCanvasViewerComponent's render() threw "getOrInsertComputed is not a
// function" from inside pdf.js's getOptionalContentConfig — and pdf.js
// ships no fallback of its own for engines that lack it
// (mozilla/pdf.js#20680 is the same regression against a different call
// site). Import this file for its side effect only, before pdfjs-dist ever
// runs — see pdf-canvas-viewer.component.ts, its only consumer.
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
