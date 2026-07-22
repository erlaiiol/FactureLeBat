import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompanyProfile } from '../../../core/models/company.model';
import {
  CreateInvoiceRequest,
  CreateManualColumnRequest,
  CreateManualRowRequest,
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

export interface ManualCustomerDraft {
  customerName: string;
  customerAddress: string;
  customerEmail: string;
  customerPhone: string;
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

function defaultColumns(): ManualColumnDraft[] {
  return [
    { id: DESCRIPTION_COLUMN_ID, role: 'DESCRIPTION', label: 'Désignation', widthPx: 280 },
    { id: QUANTITY_COLUMN_ID, role: 'QUANTITY', label: 'Quantité', widthPx: 100 },
    { id: UNIT_PRICE_COLUMN_ID, role: 'UNIT_PRICE', label: 'Prix unitaire', widthPx: 140 },
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
};

const DRAFT_STORAGE_KEY = 'facturelebat.manualInvoiceDraft.v1';

interface PersistedManualDraft {
  customer: ManualCustomerDraft;
  columns: ManualColumnDraft[];
  rows: ManualRowDraft[];
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

  readonly customer = signal<ManualCustomerDraft>(EMPTY_CUSTOMER);
  readonly columns = signal<ManualColumnDraft[]>(defaultColumns());
  readonly rows = signal<ManualRowDraft[]>([emptyRow(defaultColumns())]);

  readonly vatApplicable = computed(() => this.company()?.legalStatus === 'COMPANY');

  readonly totalsPreview = computed<TotalsPreview>(() => {
    const company = this.company();
    const lineInputs = this.rows().map((row) => ({
      unit: 'UNIT' as const,
      quantity: parseManualNumber(row.cells[QUANTITY_COLUMN_ID] ?? '') ?? 0,
      unitPriceCents: Math.round(
        (parseManualNumber(row.cells[UNIT_PRICE_COLUMN_ID] ?? '') ?? 0) * 100,
      ),
      wasteSurcharge: 'NONE' as const,
    }));
    return computeTotalsPreview(lineInputs, this.vatApplicable(), company?.vatRateBasisPoints ?? 0);
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
      };
      this.writeToStorage(snapshot);
    });
  }

  setCustomer(customer: ManualCustomerDraft): void {
    this.customer.set(customer);
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
            if (column.role === 'UNIT_PRICE') {
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
    const requestRows: CreateManualRowRequest[] = this.rows().map((row) => ({
      heightPx: Math.round(row.heightPx),
      cells: columns.map((column) => row.cells[column.id] ?? ''),
    }));

    return {
      customerName: customer.customerName,
      customerAddress: customer.customerAddress || undefined,
      customerEmail: customer.customerEmail || undefined,
      customerPhone: customer.customerPhone || undefined,
      entryMode: 'MANUAL',
      manualTable: { columns: requestColumns, rows: requestRows },
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
      if (Array.isArray(parsed.columns) && parsed.columns.length > 0) {
        this.columns.set(parsed.columns);
      }
      if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        this.rows.set(parsed.rows);
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
