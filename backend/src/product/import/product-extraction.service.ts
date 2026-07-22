import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { Unit } from '../../../generated/prisma/enums';
import { ImportedProductDraft } from './entities/imported-product.entity';

const NAME_MAX_LENGTH = 200;
const SUPPLIER_NAME_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;

// Recognized construction-material unit tokens, mapped directly to the
// fixed Unit vocabulary (Phase 7) rather than a raw scraped string — most
// specific first so e.g. "m2" doesn't shadow a match that should be "m3".
const UNIT_PATTERNS: Array<{ unit: Unit; regex: RegExp }> = [
  { unit: Unit.SQUARE_METER, regex: /\bm²|\bm2\b/i },
  { unit: Unit.CUBIC_METER, regex: /\bm³|\bm3\b/i },
  { unit: Unit.LINEAR_METER, regex: /\bml\b/i },
  { unit: Unit.KILOGRAM, regex: /\bkg\b/i },
  { unit: Unit.LITER, regex: /\b(litres?|\d\s*l)\b/i },
  // `\b` doesn't recognize "é" as a word character in JS regex, so
  // "unité" at the end of a string/before punctuation would silently fail
  // to match with a trailing `\b` — use explicit lookarounds against ASCII
  // word characters instead (verified empirically, see product-extraction.service.spec.ts).
  { unit: Unit.UNIT, regex: /(?<![a-zA-Z0-9_])unit(é|e)s?(?![a-zA-Z0-9_])/i },
];

// Pure, dependency-free apart from cheerio (no NestJS DI needs, no Prisma,
// no network) — takes HTML already fetched by SafeFetcherService and
// returns a best-effort draft. Every field degrades to null rather than a
// guess; nothing here ever throws on malformed input (a real-world web page
// is never trustworthy input; see conventions.md).
@Injectable()
export class ProductExtractionService {
  extract(html: string, sourceUrl: string): ImportedProductDraft {
    const $ = cheerio.load(html);
    const jsonLd = this.extractFromJsonLd($);

    const rawName = jsonLd.name ?? this.metaContent($, 'og:title') ?? $('title').first().text();
    const rawDescription =
      jsonLd.description ??
      this.metaContent($, 'og:description') ??
      this.metaContent($, 'description', 'name');
    const rawSupplierName = this.metaContent($, 'og:site_name') ?? this.hostnameOf(sourceUrl);
    const priceCents =
      jsonLd.priceCents ??
      this.parsePriceToCents(
        this.metaContent($, 'product:price:amount') ?? this.metaContent($, 'og:price:amount'),
      );

    const description = this.sanitize(rawDescription, DESCRIPTION_MAX_LENGTH);

    return {
      name: this.sanitize(rawName, NAME_MAX_LENGTH),
      description,
      unit: this.detectUnit(`${rawName ?? ''} ${description ?? ''}`),
      priceCents,
      supplierName: this.sanitize(rawSupplierName, SUPPLIER_NAME_MAX_LENGTH),
      supplierUrl: sourceUrl,
    };
  }

  private extractFromJsonLd($: cheerio.CheerioAPI): {
    name: string | null;
    description: string | null;
    priceCents: number | null;
  } {
    const result: { name: string | null; description: string | null; priceCents: number | null } = {
      name: null,
      description: null,
      priceCents: null,
    };

    $('script[type="application/ld+json"]').each((_, element) => {
      if (result.name) {
        return; // first matching Product block wins
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse($(element).text());
      } catch {
        return; // malformed JSON-LD is common on real sites — skip, don't crash
      }

      const product = this.findProductNode(parsed);
      if (!product) {
        return;
      }

      result.name = this.asString(product.name);
      result.description = this.asString(product.description);
      result.priceCents = this.parsePriceToCents(this.extractOfferPrice(product.offers));
    });

    return result;
  }

  private findProductNode(node: unknown): Record<string, unknown> | null {
    if (Array.isArray(node)) {
      for (const entry of node) {
        const found = this.findProductNode(entry);
        if (found) return found;
      }
      return null;
    }
    if (typeof node !== 'object' || node === null) {
      return null;
    }
    const record = node as Record<string, unknown>;
    const type = record['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
      return record;
    }
    if (Array.isArray(record['@graph'])) {
      return this.findProductNode(record['@graph']);
    }
    return null;
  }

  private extractOfferPrice(offers: unknown): string | null {
    const offer: unknown = Array.isArray(offers) ? (offers as unknown[])[0] : offers;
    if (typeof offer !== 'object' || offer === null) {
      return null;
    }
    const price = (offer as Record<string, unknown>).price;
    return this.asString(price) ?? (typeof price === 'number' ? String(price) : null);
  }

  private metaContent(
    $: cheerio.CheerioAPI,
    key: string,
    attr: 'property' | 'name' = 'property',
  ): string | null {
    const content = $(`meta[${attr}="${key}"]`).attr('content');
    return content ? content.trim() : null;
  }

  private hostnameOf(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  private parsePriceToCents(raw: string | null): number | null {
    if (!raw) {
      return null;
    }
    let normalized = raw.replace(/[^\d.,]/g, '').trim();
    if (normalized.includes(',') && !normalized.includes('.')) {
      normalized = normalized.replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
    const value = Number.parseFloat(normalized);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    const cents = Math.round(value * 100);
    return cents <= 100_000_000 ? cents : null; // matches CreateProductDto's MAX_PRICE_CENTS
  }

  private detectUnit(text: string): Unit | null {
    for (const { unit, regex } of UNIT_PATTERNS) {
      if (regex.test(text)) {
        return unit;
      }
    }
    return null;
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  // Strips any markup that leaked into an extracted value (JSON-LD/meta
  // content is supposed to be plain text, but a real-world page is never
  // trustworthy input), collapses whitespace, and clamps to the same bound
  // CreateProductDto enforces — so a merely-long value gets truncated
  // rather than silently rejected on the eventual manual save.
  private sanitize(value: string | null, maxLength: number): string | null {
    if (!value) {
      return null;
    }
    const $value = cheerio.load(value);
    const stripped = $value.text() || value;
    const collapsed = stripped.replace(/\s+/g, ' ').trim();
    if (collapsed.length === 0) {
      return null;
    }
    return collapsed.slice(0, maxLength);
  }
}
