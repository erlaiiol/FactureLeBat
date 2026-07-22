import { parsePriceToCents } from '../../common/price.util';
import { ComplementarySuggestion } from '../entities/complementary-suggestion.entity';
import { SupplierCandidate } from '../entities/supplier-candidate.entity';
import { MAX_COMPLEMENTARY_SUGGESTIONS, MAX_SUPPLIER_CANDIDATES } from '../sourcing.constants';
import { GroqUnavailableError } from './groq-unavailable.error';

const NAME_MAX_LENGTH = 200;
const REASON_MAX_LENGTH = 300;

// A model's JSON output is external input like any other (docs/development-
// rules.md #18: never trust external content) — every field is checked and
// clamped here, same posture as ProductExtractionService's HTML parsing.
// Parsing the top-level shape is a hard failure (nothing usable at all, see
// GroqUnavailableError); an individual malformed item inside an otherwise
// valid array is silently skipped rather than failing the whole search.

export function parseSupplierCandidates(raw: string): SupplierCandidate[] {
  const array = parseJsonArray(raw, 'candidates');
  return array
    .map(toSupplierCandidate)
    .filter((candidate): candidate is SupplierCandidate => candidate !== null)
    .slice(0, MAX_SUPPLIER_CANDIDATES);
}

export function parseComplementarySuggestions(raw: string): ComplementarySuggestion[] {
  const array = parseJsonArray(raw, 'suggestions');
  return array
    .map(toComplementarySuggestion)
    .filter((suggestion): suggestion is ComplementarySuggestion => suggestion !== null)
    .slice(0, MAX_COMPLEMENTARY_SUGGESTIONS);
}

function parseJsonArray(raw: string, key: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GroqUnavailableError('Groq response is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new GroqUnavailableError('Groq response is not a JSON object');
  }
  const value = (parsed as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function toSupplierCandidate(item: unknown): SupplierCandidate | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const record = item as Record<string, unknown>;
  const name = asTrimmedString(record.name, NAME_MAX_LENGTH);
  if (!name) {
    return null; // a candidate with no name is useless to the artisan
  }
  const priceRaw = asTrimmedString(record.priceRaw, 100);
  return {
    name,
    priceRaw,
    priceCents: parsePriceToCents(priceRaw),
    sourceName: asTrimmedString(record.sourceName, NAME_MAX_LENGTH),
    sourceUrl: asSafeHttpUrl(record.sourceUrl),
  };
}

function toComplementarySuggestion(item: unknown): ComplementarySuggestion | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const record = item as Record<string, unknown>;
  const name = asTrimmedString(record.name, NAME_MAX_LENGTH);
  if (!name) {
    return null;
  }
  return {
    name,
    reason: asTrimmedString(record.reason, REASON_MAX_LENGTH) ?? '',
    category: asTrimmedString(record.category, NAME_MAX_LENGTH),
  };
}

function asTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

// Only ever returns a genuine http(s) URL — never e.g. javascript:, so the
// frontend can render this directly as a link's href with no further
// checking (see SupplierCandidate.sourceUrl).
function asSafeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
