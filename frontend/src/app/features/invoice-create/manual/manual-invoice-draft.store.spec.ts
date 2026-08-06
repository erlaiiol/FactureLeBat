import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { CompanyProfile } from '../../../core/models/company.model';
import { ManualInvoiceDraftStore } from './manual-invoice-draft.store';

const companyFixture: CompanyProfile = {
  id: 'company-1',
  name: 'Parquets Raillere',
  siret: '12345678900012',
  addressLine1: '1 rue des Artisans',
  addressLine2: null,
  postalCode: '69001',
  city: 'Lyon',
  email: null,
  phone: null,
  legalStatus: 'COMPANY',
  vatRateBasisPoints: 2000,
  invoiceNumberPrefix: 'F',
  nextInvoiceNumber: 2,
  declarationFrequency: 'TRIMESTRIELLE',
  microEntrepreneurCeiling: null,
  cotisationVenteBasisPoints: 1230,
  cotisationPrestationBicBasisPoints: 2120,
  cotisationPrestationBncBasisPoints: 2110,
  versementLiberatoireOptIn: false,
  decennialInsuranceApplicable: false,
  decennialInsurerName: null,
  decennialInsurancePolicyNumber: null,
  decennialInsuranceCoverageArea: null,
  hasLogo: false,
};

describe('ManualInvoiceDraftStore', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createStore(): ManualInvoiceDraftStore {
    const store = TestBed.inject(ManualInvoiceDraftStore);
    httpMock.expectOne(`${environment.apiBaseUrl}/company`).flush(companyFixture);
    return store;
  }

  function quantityColumnId(store: ManualInvoiceDraftStore): string {
    return store.columns().find((c) => c.role === 'QUANTITY')!.id;
  }
  function unitPriceColumnId(store: ManualInvoiceDraftStore): string {
    return store.columns().find((c) => c.role === 'UNIT_PRICE')!.id;
  }
  function lineTotalColumnId(store: ManualInvoiceDraftStore): string {
    return store.columns().find((c) => c.role === 'LINE_TOTAL')!.id;
  }
  function descriptionColumnId(store: ManualInvoiceDraftStore): string {
    return store.columns().find((c) => c.role === 'DESCRIPTION')!.id;
  }

  it('starts with exactly the four required columns and one empty row', () => {
    const store = createStore();
    expect(store.columns().map((c) => c.role)).toEqual([
      'DESCRIPTION',
      'QUANTITY',
      'UNIT_PRICE',
      'LINE_TOTAL',
    ]);
    expect(store.rows()).toHaveLength(1);
  });

  describe('buildInvoiceRequest', () => {
    it('builds a MANUAL entryMode request with no lines/serviceLines', () => {
      const store = createStore();
      store.setCustomer({
        customerName: 'M. Dupont',
        customerAddress: '',
        customerEmail: '',
        customerPhone: '',
        customFields: [],
      });
      const rowId = store.rows()[0].id;
      store.setCellValue(rowId, descriptionColumnId(store), 'Parquet chêne massif');
      store.setCellValue(rowId, quantityColumnId(store), '10');
      store.setCellValue(rowId, unitPriceColumnId(store), '45.00');
      store.setCellValue(rowId, lineTotalColumnId(store), '450.00');

      const request = store.buildInvoiceRequest();

      expect(request.entryMode).toBe('MANUAL');
      expect(request.lines).toBeUndefined();
      expect(request.serviceLines).toBeUndefined();
      expect(request.manualTable?.columns.map((c) => c.role)).toEqual([
        'DESCRIPTION',
        'QUANTITY',
        'UNIT_PRICE',
        'LINE_TOTAL',
      ]);
      expect(request.manualTable?.rows).toEqual([
        { heightPx: 44, cells: ['Parquet chêne massif', '10', '45.00', '450.00'] },
      ]);
    });

    it('sends only customer fields where both label and value are filled in', () => {
      const store = createStore();
      store.setCustomer({
        customerName: 'M. Dupont',
        customerAddress: '',
        customerEmail: '',
        customerPhone: '',
        customFields: [
          { id: 'f1', label: 'SIRET', value: '123 456 789 00012' },
          { id: 'f2', label: '', value: '' },
          { id: 'f3', label: 'Note', value: '' },
        ],
      });

      const request = store.buildInvoiceRequest();

      expect(request.customerFields).toEqual([{ label: 'SIRET', value: '123 456 789 00012' }]);
    });

    it('appends a CUSTOM column positionally after the four required ones', () => {
      const store = createStore();
      store.addCustomColumn();
      const customColumnId = store.columns()[4].id;
      store.setCellValue(store.rows()[0].id, descriptionColumnId(store), 'Parquet chêne massif');
      store.setCellValue(store.rows()[0].id, customColumnId, 'Chantier Dupont');

      const request = store.buildInvoiceRequest();

      expect(request.manualTable?.columns[4]).toEqual({
        role: 'CUSTOM',
        label: 'Colonne',
        widthPx: 140,
      });
      expect(request.manualTable?.rows[0].cells[4]).toBe('Chantier Dupont');
    });
  });

  describe('row/column mutation', () => {
    it('adds and removes a row, never going below one', () => {
      const store = createStore();
      store.addRow();
      expect(store.rows()).toHaveLength(2);

      const [firstId, secondId] = store.rows().map((r) => r.id);
      store.removeRow(firstId);
      expect(store.rows().map((r) => r.id)).toEqual([secondId]);

      store.removeRow(secondId);
      expect(store.rows()).toHaveLength(1); // last row is never removable
    });

    it('adding a custom column gives every existing row an empty cell for it', () => {
      const store = createStore();
      store.addRow();
      store.addCustomColumn();
      const customColumnId = store.columns()[4].id;

      expect(store.rows().every((row) => row.cells[customColumnId] === '')).toBe(true);
    });

    it('removes a custom column and its cells from every row', () => {
      const store = createStore();
      store.addCustomColumn();
      const customColumnId = store.columns()[4].id;

      store.removeColumn(customColumnId);

      expect(store.columns()).toHaveLength(4);
      expect(store.rows()[0].cells[customColumnId]).toBeUndefined();
    });

    it('refuses to remove a required (non-CUSTOM) column', () => {
      const store = createStore();
      const id = descriptionColumnId(store);

      store.removeColumn(id);

      expect(store.columns().map((c) => c.id)).toContain(id);
    });

    it('clamps column width adjustments within the min/max bounds', () => {
      const store = createStore();
      const id = quantityColumnId(store);

      store.adjustColumnWidth(id, -1000);
      expect(store.columns().find((c) => c.id === id)!.widthPx).toBe(40);

      store.adjustColumnWidth(id, 10000);
      expect(store.columns().find((c) => c.id === id)!.widthPx).toBe(800);
    });

    it('clamps row height adjustments within the min/max bounds', () => {
      const store = createStore();
      const id = store.rows()[0].id;

      store.adjustRowHeight(id, -1000);
      expect(store.rows().find((r) => r.id === id)!.heightPx).toBe(24);

      store.adjustRowHeight(id, 10000);
      expect(store.rows().find((r) => r.id === id)!.heightPx).toBe(400);
    });
  });

  describe('format', () => {
    it('normalizes quantity/price cells and trims free text, leaving the description untouched otherwise', () => {
      const store = createStore();
      const rowId = store.rows()[0].id;
      store.setCellValue(rowId, descriptionColumnId(store), '  Parquet   chêne  ');
      store.setCellValue(rowId, quantityColumnId(store), '10,500');
      store.setCellValue(rowId, unitPriceColumnId(store), '1500');

      store.format();

      const row = store.rows()[0];
      expect(row.cells[descriptionColumnId(store)]).toBe('Parquet chêne');
      expect(row.cells[quantityColumnId(store)]).toBe('10,5');
      expect(row.cells[unitPriceColumnId(store)]).toBe('1500,00 €');
    });
  });

  describe('totalsPreview', () => {
    it('sums each row from its own freehand LINE_TOTAL cell, never quantity x unit price', () => {
      const store = createStore();
      const rowId = store.rows()[0].id;
      // Quantity/unit price are purely informational — the total below must
      // come from the LINE_TOTAL cell alone, ignoring these entirely.
      store.setCellValue(rowId, quantityColumnId(store), '2 boites');
      store.setCellValue(rowId, unitPriceColumnId(store), '45.00');
      store.setCellValue(rowId, lineTotalColumnId(store), '450.00');

      expect(store.totalsPreview().subtotalExclVatCents).toBe(45000);
    });

    it('treats a blank LINE_TOTAL cell as zero rather than 0.00 forever blocking a fix', () => {
      const store = createStore();
      expect(store.totalsPreview().subtotalExclVatCents).toBe(0);
    });
  });

  describe('totalsPreview overrides (Phase 9.5 bis)', () => {
    function withOneRowTotal(store: ManualInvoiceDraftStore, euros: string): void {
      store.setCellValue(store.rows()[0].id, lineTotalColumnId(store), euros);
    }

    it('overriding the subtotal still recomputes VAT off the new (effective) subtotal', () => {
      const store = createStore();
      withOneRowTotal(store, '450.00'); // rows alone sum to 45000 cents

      store.setSubtotalOverrideText('1000');

      const totals = store.totalsPreview();
      expect(totals.subtotalExclVatCents).toBe(100000);
      expect(totals.vatAmountCents).toBe(20000); // 20% of 100000
      expect(totals.totalInclVatCents).toBe(120000);
    });

    it('overriding VAT directly replaces only the VAT amount, subtotal stays row-computed', () => {
      const store = createStore();
      withOneRowTotal(store, '450.00');

      store.setVatOverrideText('5');

      const totals = store.totalsPreview();
      expect(totals.subtotalExclVatCents).toBe(45000);
      expect(totals.vatAmountCents).toBe(500);
      expect(totals.totalInclVatCents).toBe(45500);
    });

    it('overriding the total skips the subtotal + VAT sum entirely', () => {
      const store = createStore();
      withOneRowTotal(store, '450.00');

      store.setTotalOverrideText('9999,99');

      const totals = store.totalsPreview();
      expect(totals.subtotalExclVatCents).toBe(45000);
      expect(totals.vatAmountCents).toBe(9000);
      expect(totals.totalInclVatCents).toBe(999999);
    });

    it('buildInvoiceRequest sends only the overrides that are actually parseable', () => {
      const store = createStore();
      store.setSubtotalOverrideText('1000');
      store.setVatOverrideText('');
      store.setTotalOverrideText('beaucoup');

      const request = store.buildInvoiceRequest();

      expect(request.subtotalOverrideCents).toBe(100000);
      expect(request.vatOverrideCents).toBeUndefined();
      expect(request.totalOverrideCents).toBeUndefined();
    });
  });

  describe('VAT applicability/rate override', () => {
    it('defaults to the company profile when no explicit choice has been made', () => {
      const store = createStore(); // companyFixture: COMPANY, 2000 basis points
      expect(store.vatApplicable()).toBe(true);
      expect(store.vatRateBasisPoints()).toBe(2000);
    });

    it('an explicit choice overrides the company default for both applicability and rate', () => {
      const store = createStore();
      store.setVatChoice({ applicable: true, rateBasisPoints: 550 });

      expect(store.vatApplicable()).toBe(true);
      expect(store.vatRateBasisPoints()).toBe(550);
    });

    it('choosing "non applicable" zeroes VAT even though the company default is VAT-applicable', () => {
      const store = createStore();
      store.setCellValue(store.rows()[0].id, lineTotalColumnId(store), '450.00');
      store.setVatChoice({ applicable: false, rateBasisPoints: 0 });

      expect(store.vatApplicable()).toBe(false);
      expect(store.totalsPreview().vatAmountCents).toBe(0);
      expect(store.totalsPreview().totalInclVatCents).toBe(45000);
    });

    it('buildInvoiceRequest omits both override fields until an explicit choice is made', () => {
      const store = createStore();
      const request = store.buildInvoiceRequest();

      expect(request.vatApplicableOverride).toBeUndefined();
      expect(request.vatRateBasisPointsOverride).toBeUndefined();
    });

    it('buildInvoiceRequest sends both fields once a choice has been made', () => {
      const store = createStore();
      store.setVatChoice({ applicable: true, rateBasisPoints: 1000 });

      const request = store.buildInvoiceRequest();

      expect(request.vatApplicableOverride).toBe(true);
      expect(request.vatRateBasisPointsOverride).toBe(1000);
    });

    it('reset() clears the choice, falling back to the company default again', () => {
      const store = createStore();
      store.setVatChoice({ applicable: false, rateBasisPoints: 0 });

      store.reset();

      expect(store.vatApplicable()).toBe(true);
      expect(store.vatRateBasisPoints()).toBe(2000);
      expect(store.buildInvoiceRequest().vatApplicableOverride).toBeUndefined();
    });
  });

  describe('canPreview', () => {
    it('is false with no customer name and no description', () => {
      const store = createStore();
      expect(store.canPreview()).toBe(false);
    });

    it('is true once a customer name and a row description are set', () => {
      const store = createStore();
      store.setCustomer({
        customerName: 'M. Dupont',
        customerAddress: '',
        customerEmail: '',
        customerPhone: '',
        customFields: [],
      });
      store.setCellValue(store.rows()[0].id, descriptionColumnId(store), 'Parquet');

      expect(store.canPreview()).toBe(true);
    });
  });

  describe('reset', () => {
    it('restores the default four columns and a single empty row', () => {
      const store = createStore();
      store.addRow();
      store.addCustomColumn();
      store.setCustomer({
        customerName: 'M. Dupont',
        customerAddress: '',
        customerEmail: '',
        customerPhone: '',
        customFields: [],
      });

      store.reset();

      expect(store.rows()).toHaveLength(1);
      expect(store.columns().map((c) => c.role)).toEqual([
        'DESCRIPTION',
        'QUANTITY',
        'UNIT_PRICE',
        'LINE_TOTAL',
      ]);
      expect(store.customer().customerName).toBe('');
    });

    it('clears any totals override', () => {
      const store = createStore();
      store.setSubtotalOverrideText('1000');
      store.setVatOverrideText('50');
      store.setTotalOverrideText('1050');

      store.reset();

      expect(store.subtotalOverrideText()).toBe('');
      expect(store.vatOverrideText()).toBe('');
      expect(store.totalOverrideText()).toBe('');
    });
  });

  describe('localStorage migration (draft saved before LINE_TOTAL existed)', () => {
    const DRAFT_STORAGE_KEY = 'facturele.manualInvoiceDraft.v1';

    it('appends a working LINE_TOTAL column, keyed dynamically rather than by the old constant id', () => {
      // Simulates a draft persisted by a pre-LINE_TOTAL build: only the
      // three original columns, with their own (non-default-constant) ids.
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          customer: {
            customerName: 'M. Dupont',
            customerAddress: '',
            customerEmail: '',
            customerPhone: '',
          },
          columns: [
            { id: 'old-desc', role: 'DESCRIPTION', label: 'Désignation', widthPx: 280 },
            { id: 'old-qty', role: 'QUANTITY', label: 'Quantité', widthPx: 100 },
            { id: 'old-price', role: 'UNIT_PRICE', label: 'Prix unitaire', widthPx: 140 },
          ],
          rows: [
            {
              id: 'row-1',
              heightPx: 44,
              cells: { 'old-desc': 'Parquet', 'old-qty': '10', 'old-price': '45.00' },
            },
          ],
        }),
      );

      const store = createStore();

      expect(store.columns().map((c) => c.role)).toEqual([
        'DESCRIPTION',
        'QUANTITY',
        'UNIT_PRICE',
        'LINE_TOTAL',
      ]);

      // This is the regression: totalsPreview must resolve the migrated
      // column's actual (freshly generated) id, not the LINE_TOTAL_COLUMN_ID
      // constant used by brand-new drafts — otherwise it silently reads an
      // always-empty cell and the running total never moves off 0,00.
      store.setCellValue(store.rows()[0].id, lineTotalColumnId(store), '450.00');
      expect(store.totalsPreview().subtotalExclVatCents).toBe(45000);
    });
  });

  describe('customer custom fields', () => {
    it('adds, edits, and removes a freehand client field', () => {
      const store = createStore();
      store.addCustomerField();
      expect(store.customer().customFields).toHaveLength(1);

      const fieldId = store.customer().customFields[0].id;
      store.setCustomerFieldLabel(fieldId, 'SIRET');
      store.setCustomerFieldValue(fieldId, '123 456 789 00012');

      expect(store.customer().customFields[0]).toEqual({
        id: fieldId,
        label: 'SIRET',
        value: '123 456 789 00012',
      });

      store.removeCustomerField(fieldId);
      expect(store.customer().customFields).toHaveLength(0);
    });
  });
});
