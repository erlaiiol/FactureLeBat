import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompanyProfile } from '../../../core/models/company.model';
import {
  CreateInvoiceRequest,
  CreateManualColumnRequest,
  CreateManualRowRequest,
  DocumentType,
  ManualColumnRole,
} from '../../../core/models/invoice.model';
import { CompanyService } from '../../../core/services/company.service';
import { computeTotalsPreview, TotalsPreview } from '../calculation-preview';
import {
  formatManualPrice,
  formatManualQuantity,
  formatManualText,
  parseManualNumber,
} from './manual-cell-format.util';

// A freehand extra client field (e.g. label "SIRET", value "123 456 789
// 00012") — no fixed vocabulary, the artisan names the field themselves.
// Same "+ add one, generic placeholder" principle as a CUSTOM table column.
export interface ManualCustomerFieldDraft {
  id: string;
  label: string;
  value: string;
}

export interface ManualCustomerDraft {
  customerName: string;
  customerAddress: string;
  customerEmail: string;
  customerPhone: string;
  customFields: ManualCustomerFieldDraft[];
}

export interface ManualColumnDraft {
  // Client-generated, stable for the lifetime of the draft — the three
  // required roles use fixed ids so a hydrated-from-storage draft always
  // finds them; a CUSTOM column gets a fresh crypto.randomUUID() when added.
  id: string;
  role: ManualColumnRole;
  label: string;
  widthPx: number;
}

export interface ManualRowDraft {
  id: string;
  heightPx: number;
  // Keyed by ManualColumnDraft.id — resilient to columns being added/
  // removed/reordered, unlike a positional array would be while editing.
  cells: Record<string, string>;
}

const MIN_COLUMN_WIDTH_PX = 40;
const MAX_COLUMN_WIDTH_PX = 800;
const MIN_ROW_HEIGHT_PX = 24;
const MAX_ROW_HEIGHT_PX = 400;

const DESCRIPTION_COLUMN_ID = 'col-description';
const QUANTITY_COLUMN_ID = 'col-quantity';
const UNIT_PRICE_COLUMN_ID = 'col-unit-price';
const LINE_TOTAL_COLUMN_ID = 'col-line-total';

function defaultColumns(): ManualColumnDraft[] {
  return [
    { id: DESCRIPTION_COLUMN_ID, role: 'DESCRIPTION', label: 'Désignation', widthPx: 280 },
    { id: QUANTITY_COLUMN_ID, role: 'QUANTITY', label: 'Quantité', widthPx: 100 },
    { id: UNIT_PRICE_COLUMN_ID, role: 'UNIT_PRICE', label: 'Prix unitaire', widthPx: 140 },
    { id: LINE_TOTAL_COLUMN_ID, role: 'LINE_TOTAL', label: 'Total', widthPx: 120 },
  ];
}

function emptyRow(columns: readonly ManualColumnDraft[]): ManualRowDraft {
  return {
    id: crypto.randomUUID(),
    heightPx: 44,
    cells: Object.fromEntries(columns.map((column) => [column.id, ''])),
  };
}

const EMPTY_CUSTOMER: ManualCustomerDraft = {
  customerName: '',
  customerAddress: '',
  customerEmail: '',
  customerPhone: '',
  customFields: [],
};

const DRAFT_STORAGE_KEY = 'facturelebat.manualInvoiceDraft.v1';

// Explicit choice of VAT treatment for this one document, overriding the
// company's own default (see ManualInvoiceDraftStore.vatOverride) — null
// means "no choice made yet, use the company default".
export interface ManualVatChoice {
  applicable: boolean;
  rateBasisPoints: number;
}

interface PersistedManualDraft {
  customer: ManualCustomerDraft;
  columns: ManualColumnDraft[];
  rows: ManualRowDraft[];
  subtotalOverrideText: string;
  vatOverrideText: string;
  totalOverrideText: string;
  vatChoice: ManualVatChoice | null;
  documentType: DocumentType;
}

// Phase 9.5 mode manuel: the free-form canvas's shared, in-progress draft
// state — same "shared, constructed-once, providedIn: 'root'" shape as
// InvoiceDraftStore (mode rapide), but a completely different body shape
// underneath (columns/rows instead of lines/serviceLines), since the two
// modes are alternate input surfaces over the same Invoice, not the same
// form. Deliberately its own store rather than a variant of
// InvoiceDraftStore — mode switching mid-draft is not supported (see
// docs/roadmap.md Phase 9.5), so the two never need to share state.
@Injectable({ providedIn: 'root' })
export class ManualInvoiceDraftStore {
  private readonly companyService = inject(CompanyService);
  private readonly destroyRef = inject(DestroyRef);

  readonly company = signal<CompanyProfile | null>(null);

  // Phase 14.3: same seeding/persistence rule as InvoiceDraftStore.documentType.
  readonly documentType = signal<DocumentType>('FACTURE');

  readonly customer = signal<ManualCustomerDraft>(EMPTY_CUSTOMER);
  readonly columns = signal<ManualColumnDraft[]>(defaultColumns());
  readonly rows = signal<ManualRowDraft[]>([emptyRow(defaultColumns())]);

  // Phase 9.5 bis: the invoice's own aggregate figures, freely overridable —
  // same "nothing computed behind the artisan's back" principle as a row's
  // LINE_TOTAL cell, extended up to Sous-total HT / TVA / Total TTC. Raw
  // text (not cents) so a half-typed value never gets silently rounded or
  // rejected mid-keystroke; blank means "no override", falling back to the
  // computed figure below. See totalsPreview for the override precedence.
  readonly subtotalOverrideText = signal('');
  readonly vatOverrideText = signal('');
  readonly totalOverrideText = signal('');

  // Manual mode's whole principle, extended to VAT itself: the company
  // profile's legal status only ever picks one fixed treatment for every
  // invoice, but a single artisan can legitimately need "TVA non
  // applicable" on one document and "TVA 5,5 %" on the next (e.g. a
  // franchise-en-base company doing an occasional VAT-liable job, or a
  // VAT-registered company applying a different rate per chantier — see
  // docs/roadmap.md's VAT-override note). null means no explicit choice
  // has been made yet, so vatApplicable/vatRateBasisPoints below fall back
  // to the company default.
  readonly vatChoice = signal<ManualVatChoice | null>(null);

  readonly vatApplicable = computed(
    () => this.vatChoice()?.applicable ?? this.company()?.legalStatus === 'COMPANY',
  );
  readonly vatRateBasisPoints = computed(
    () => this.vatChoice()?.rateBasisPoints ?? this.company()?.vatRateBasisPoints ?? 0,
  );

  // Each row's total is the artisan's own freehand LINE_TOTAL cell — never
  // derived from quantity x unit price (those stay purely informational
  // free text on the manual canvas, see manual-cell-format.util.ts). A
  // blank/unparseable cell contributes zero rather than blocking the
  // running total, mirroring the backend's computeManualRowTotalCents.
  //
  // The column is looked up by role, not by the LINE_TOTAL_COLUMN_ID
  // constant: a draft hydrated from localStorage before this column existed
  // gets one appended with a freshly generated id (see hydrateFromStorage's
  // migration below), which never matches that constant. Hardcoding it here
  // meant totalsPreview silently read an always-empty cell for any such
  // draft — the running total looked permanently stuck at 0,00, even though
  // every other place (autofillTotal, the cell inputs themselves) already
  // resolved the id dynamically.
  //
  // On top of that row-level sum, each of Sous-total HT / TVA / Total TTC
  // can itself be overridden independently (mirrors the backend's
  // InvoiceMapper.toManualInvoiceWithTotals): overriding the subtotal still
  // feeds a freshly computed VAT off the *effective* subtotal (so the VAT
  // rate stays meaningful) unless VAT is also overridden directly;
  // overriding the total skips the subtotal + VAT sum entirely.
  readonly totalsPreview = computed<TotalsPreview>(() => {
    const vatApplicable = this.vatApplicable();
    const vatRateBasisPoints = this.vatRateBasisPoints();
    const lineTotalColumnId = this.columns().find((column) => column.role === 'LINE_TOTAL')?.id;
    const lineInputs = this.rows().map((row) => ({
      unit: 'UNIT' as const,
      quantity: 1,
      unitPriceCents: Math.round(
        (parseManualNumber(row.cells[lineTotalColumnId ?? ''] ?? '') ?? 0) * 100,
      ),
      wasteSurcharge: 'NONE' as const,
    }));
    const computed = computeTotalsPreview(lineInputs, vatApplicable, vatRateBasisPoints);

    const subtotalOverride = parseManualNumber(this.subtotalOverrideText());
    const subtotalExclVatCents =
      subtotalOverride !== null
        ? Math.round(subtotalOverride * 100)
        : computed.subtotalExclVatCents;

    const recomputedVatAmountCents =
      subtotalOverride !== null
        ? vatApplicable
          ? Math.round((subtotalExclVatCents * vatRateBasisPoints) / 10000)
          : 0
        : computed.vatAmountCents;
    const vatOverride = parseManualNumber(this.vatOverrideText());
    const vatAmountCents =
      vatOverride !== null ? Math.round(vatOverride * 100) : recomputedVatAmountCents;

    const totalOverride = parseManualNumber(this.totalOverrideText());
    const totalInclVatCents =
      totalOverride !== null
        ? Math.round(totalOverride * 100)
        : subtotalExclVatCents + vatAmountCents;

    return { subtotalExclVatCents, vatAmountCents, totalInclVatCents };
  });

  // Same soft UX gate as InvoiceDraftStore.canPreview — closely mirrors the
  // backend's real requirements without being the source of truth for them.
  readonly canPreview = computed(() => {
    const hasCustomerName = this.customer().customerName.trim().length > 0;
    const hasUsableRow = this.rows().some(
      (row) => (row.cells[DESCRIPTION_COLUMN_ID] ?? '').trim().length > 0,
    );
    return hasCustomerName && hasUsableRow;
  });

  constructor() {
    this.hydrateFromStorage();

    this.companyService
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (profile) => this.company.set(profile) });

    effect(() => {
      const snapshot: PersistedManualDraft = {
        customer: this.customer(),
        columns: this.columns(),
        rows: this.rows(),
        subtotalOverrideText: this.subtotalOverrideText(),
        vatOverrideText: this.vatOverrideText(),
        totalOverrideText: this.totalOverrideText(),
        vatChoice: this.vatChoice(),
        documentType: this.documentType(),
      };
      this.writeToStorage(snapshot);
    });
  }

  // Phase 14.3: same "only set when the mode-choice slider actually sent
  // one" rule as InvoiceDraftStore.setDocumentType.
  setDocumentType(type: DocumentType): void {
    this.documentType.set(type);
  }

  setCustomer(customer: ManualCustomerDraft): void {
    this.customer.set(customer);
  }

  // "+ add a field" on the Facturé à block — same generic-placeholder
  // principle as addCustomColumn: no fixed vocabulary, the artisan names
  // the field themselves (e.g. "SIRET").
  addCustomerField(): void {
    const field: ManualCustomerFieldDraft = { id: crypto.randomUUID(), label: '', value: '' };
    this.customer.update((customer) => ({
      ...customer,
      customFields: [...customer.customFields, field],
    }));
  }

  removeCustomerField(fieldId: string): void {
    this.customer.update((customer) => ({
      ...customer,
      customFields: customer.customFields.filter((field) => field.id !== fieldId),
    }));
  }

  setCustomerFieldLabel(fieldId: string, label: string): void {
    this.customer.update((customer) => ({
      ...customer,
      customFields: customer.customFields.map((field) =>
        field.id === fieldId ? { ...field, label } : field,
      ),
    }));
  }

  setCustomerFieldValue(fieldId: string, value: string): void {
    this.customer.update((customer) => ({
      ...customer,
      customFields: customer.customFields.map((field) =>
        field.id === fieldId ? { ...field, value } : field,
      ),
    }));
  }

  setSubtotalOverrideText(text: string): void {
    this.subtotalOverrideText.set(text);
  }

  setVatOverrideText(text: string): void {
    this.vatOverrideText.set(text);
  }

  setTotalOverrideText(text: string): void {
    this.totalOverrideText.set(text);
  }

  // The artisan's explicit pick from the VAT selector (see
  // InvoiceTotalsSummaryComponent) — always an explicit choice from here on,
  // never cleared back to "use the company default" once made, same as
  // every other manual-mode field once touched.
  setVatChoice(choice: ManualVatChoice): void {
    this.vatChoice.set(choice);
  }

  setCellValue(rowId: string, columnId: string, value: string): void {
    this.rows.update((rows) =>
      rows.map((row) =>
        row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: value } } : row,
      ),
    );
  }

  renameColumn(columnId: string, label: string): void {
    this.columns.update((columns) =>
      columns.map((column) => (column.id === columnId ? { ...column, label } : column)),
    );
  }

  addRow(): void {
    this.rows.update((rows) => [...rows, emptyRow(this.columns())]);
  }

  removeRow(rowId: string): void {
    this.rows.update((rows) => (rows.length > 1 ? rows.filter((row) => row.id !== rowId) : rows));
  }

  addCustomColumn(): void {
    const id = crypto.randomUUID();
    this.columns.update((columns) => [
      ...columns,
      { id, role: 'CUSTOM', label: 'Colonne', widthPx: 140 },
    ]);
    this.rows.update((rows) => rows.map((row) => ({ ...row, cells: { ...row.cells, [id]: '' } })));
  }

  // Only a CUSTOM column can be removed — DESCRIPTION/QUANTITY/UNIT_PRICE
  // are load-bearing for the calculation and always exist, same reasoning
  // as ManualColumnsCoverRequiredRoles backend-side.
  removeColumn(columnId: string): void {
    const column = this.columns().find((candidate) => candidate.id === columnId);
    if (!column || column.role !== 'CUSTOM') {
      return;
    }
    this.columns.update((columns) => columns.filter((candidate) => candidate.id !== columnId));
    this.rows.update((rows) =>
      rows.map((row) => {
        const cells = { ...row.cells };
        delete cells[columnId];
        return { ...row, cells };
      }),
    );
  }

  adjustColumnWidth(columnId: string, deltaPx: number): void {
    this.columns.update((columns) =>
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              widthPx: clamp(column.widthPx + deltaPx, MIN_COLUMN_WIDTH_PX, MAX_COLUMN_WIDTH_PX),
            }
          : column,
      ),
    );
  }

  adjustRowHeight(rowId: string, deltaPx: number): void {
    this.rows.update((rows) =>
      rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              heightPx: clamp(row.heightPx + deltaPx, MIN_ROW_HEIGHT_PX, MAX_ROW_HEIGHT_PX),
            }
          : row,
      ),
    );
  }

  // "Mettre en forme": normalizes every cell's text once, in place — never
  // touches the underlying quantity/price the artisan typed, only its
  // display formatting (see manual-cell-format.util.ts).
  format(): void {
    const columns = this.columns();
    this.rows.update((rows) =>
      rows.map((row) => ({
        ...row,
        cells: Object.fromEntries(
          columns.map((column) => {
            const raw = row.cells[column.id] ?? '';
            if (column.role === 'QUANTITY') {
              return [column.id, formatManualQuantity(raw)];
            }
            if (column.role === 'UNIT_PRICE' || column.role === 'LINE_TOTAL') {
              return [column.id, formatManualPrice(raw)];
            }
            return [column.id, formatManualText(raw)];
          }),
        ),
      })),
    );
  }

  reset(): void {
    this.customer.set(EMPTY_CUSTOMER);
    this.columns.set(defaultColumns());
    this.rows.set([emptyRow(defaultColumns())]);
    this.subtotalOverrideText.set('');
    this.vatOverrideText.set('');
    this.totalOverrideText.set('');
    this.vatChoice.set(null);
    this.documentType.set('FACTURE');
    this.clearStorage();
  }

  // Builds the exact payload shape the backend expects, for both the real
  // create-submit and the draft preview — same "one place this mapping
  // happens" rule as InvoiceDraftStore.buildInvoiceRequest.
  buildInvoiceRequest(): CreateInvoiceRequest {
    const customer = this.customer();
    const columns = this.columns();

    const requestColumns: CreateManualColumnRequest[] = columns.map((column) => ({
      role: column.role,
      label: column.label,
      widthPx: Math.round(column.widthPx),
    }));
    // Rows the artisan never filled in (the default starter row, or one
    // added via "+ ajouter une ligne" and left untouched) are dropped here
    // rather than sent — same "description is what makes a row real" rule
    // as canPreview's hasUsableRow, but applied to the actual payload.
    const requestRows: CreateManualRowRequest[] = this.rows()
      .filter((row) => (row.cells[DESCRIPTION_COLUMN_ID] ?? '').trim().length > 0)
      .map((row) => ({
        heightPx: Math.round(row.heightPx),
        cells: columns.map((column) => row.cells[column.id] ?? ''),
      }));

    // Only fields the artisan actually filled in both sides of are sent —
    // the backend requires a non-empty label and value, and a half-filled
    // field the artisan hasn't gotten to yet shouldn't block submission.
    const customerFields = customer.customFields
      .filter((field) => field.label.trim().length > 0 && field.value.trim().length > 0)
      .map((field) => ({ label: field.label.trim(), value: field.value.trim() }));

    // Only sent when parseable — an override left blank (or mid-typo) is
    // simply omitted, falling back to the backend's own computed figure,
    // same "half-filled never blocks submission" rule as customerFields.
    const subtotalOverride = parseManualNumber(this.subtotalOverrideText());
    const vatOverride = parseManualNumber(this.vatOverrideText());
    const totalOverride = parseManualNumber(this.totalOverrideText());
    // Only sent once the artisan has actually picked something from the VAT
    // selector — until then, omitted entirely so the backend keeps deriving
    // it from the company profile, same "half-filled never blocks
    // submission" precedent as the three overrides above.
    const vatChoice = this.vatChoice();

    return {
      customerName: customer.customerName,
      customerAddress: customer.customerAddress || undefined,
      customerEmail: customer.customerEmail || undefined,
      customerPhone: customer.customerPhone || undefined,
      customerFields: customerFields.length > 0 ? customerFields : undefined,
      entryMode: 'MANUAL',
      documentType: this.documentType(),
      manualTable: { columns: requestColumns, rows: requestRows },
      subtotalOverrideCents:
        subtotalOverride !== null ? Math.round(subtotalOverride * 100) : undefined,
      vatOverrideCents: vatOverride !== null ? Math.round(vatOverride * 100) : undefined,
      totalOverrideCents: totalOverride !== null ? Math.round(totalOverride * 100) : undefined,
      vatApplicableOverride: vatChoice?.applicable,
      vatRateBasisPointsOverride: vatChoice?.rateBasisPoints,
    };
  }

  private hydrateFromStorage(): void {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<PersistedManualDraft>;
      if (parsed.customer) {
        this.customer.set({ ...EMPTY_CUSTOMER, ...parsed.customer });
      }
      let columns = defaultColumns();
      if (Array.isArray(parsed.columns) && parsed.columns.length > 0) {
        columns = parsed.columns;
      }
      let rows = [emptyRow(columns)];
      if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        rows = parsed.rows;
      }
      // Migration: a draft saved before LINE_TOTAL existed has no such
      // column — add one so the total stays editable rather than silently
      // missing from an old in-progress draft.
      if (!columns.some((column) => column.role === 'LINE_TOTAL')) {
        const id = crypto.randomUUID();
        columns = [...columns, { id, role: 'LINE_TOTAL', label: 'Total', widthPx: 120 }];
        rows = rows.map((row) => ({ ...row, cells: { ...row.cells, [id]: '' } }));
      }
      this.columns.set(columns);
      this.rows.set(rows);
      if (typeof parsed.subtotalOverrideText === 'string') {
        this.subtotalOverrideText.set(parsed.subtotalOverrideText);
      }
      if (typeof parsed.vatOverrideText === 'string') {
        this.vatOverrideText.set(parsed.vatOverrideText);
      }
      if (typeof parsed.totalOverrideText === 'string') {
        this.totalOverrideText.set(parsed.totalOverrideText);
      }
      if (
        parsed.vatChoice &&
        typeof parsed.vatChoice.applicable === 'boolean' &&
        typeof parsed.vatChoice.rateBasisPoints === 'number'
      ) {
        this.vatChoice.set(parsed.vatChoice);
      }
      if (parsed.documentType === 'DEVIS' || parsed.documentType === 'FACTURE') {
        this.documentType.set(parsed.documentType);
      }
    } catch {
      // Malformed/unavailable storage — start from a blank draft rather
      // than blocking the page, same pattern as InvoiceDraftStore.
    }
  }

  private writeToStorage(snapshot: PersistedManualDraft): void {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage full/unavailable (e.g. private browsing) — the draft simply
      // won't survive a refresh; the in-memory flow still works.
    }
  }

  private clearStorage(): void {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Nothing to do if storage isn't available in the first place.
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
