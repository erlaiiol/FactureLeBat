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
  function descriptionColumnId(store: ManualInvoiceDraftStore): string {
    return store.columns().find((c) => c.role === 'DESCRIPTION')!.id;
  }

  it('starts with exactly the three required columns and one empty row', () => {
    const store = createStore();
    expect(store.columns().map((c) => c.role)).toEqual(['DESCRIPTION', 'QUANTITY', 'UNIT_PRICE']);
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
      });
      const rowId = store.rows()[0].id;
      store.setCellValue(rowId, descriptionColumnId(store), 'Parquet chêne massif');
      store.setCellValue(rowId, quantityColumnId(store), '10');
      store.setCellValue(rowId, unitPriceColumnId(store), '45.00');

      const request = store.buildInvoiceRequest();

      expect(request.entryMode).toBe('MANUAL');
      expect(request.lines).toBeUndefined();
      expect(request.serviceLines).toBeUndefined();
      expect(request.manualTable?.columns.map((c) => c.role)).toEqual([
        'DESCRIPTION',
        'QUANTITY',
        'UNIT_PRICE',
      ]);
      expect(request.manualTable?.rows).toEqual([
        { heightPx: 44, cells: ['Parquet chêne massif', '10', '45.00'] },
      ]);
    });

    it('appends a CUSTOM column positionally after the three required ones', () => {
      const store = createStore();
      store.addCustomColumn();
      const customColumnId = store.columns()[3].id;
      store.setCellValue(store.rows()[0].id, customColumnId, 'Chantier Dupont');

      const request = store.buildInvoiceRequest();

      expect(request.manualTable?.columns[3]).toEqual({
        role: 'CUSTOM',
        label: 'Colonne',
        widthPx: 140,
      });
      expect(request.manualTable?.rows[0].cells[3]).toBe('Chantier Dupont');
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
      const customColumnId = store.columns()[3].id;

      expect(store.rows().every((row) => row.cells[customColumnId] === '')).toBe(true);
    });

    it('removes a custom column and its cells from every row', () => {
      const store = createStore();
      store.addCustomColumn();
      const customColumnId = store.columns()[3].id;

      store.removeColumn(customColumnId);

      expect(store.columns()).toHaveLength(3);
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
      expect(row.cells[unitPriceColumnId(store)]).toBe('1500,00');
    });
  });

  describe('totalsPreview', () => {
    it('prices a row as plain quantity x unit price, mirroring the backend UNIT-mode calculation', () => {
      const store = createStore();
      const rowId = store.rows()[0].id;
      store.setCellValue(rowId, quantityColumnId(store), '10');
      store.setCellValue(rowId, unitPriceColumnId(store), '45.00');

      expect(store.totalsPreview().subtotalExclVatCents).toBe(45000);
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
      });
      store.setCellValue(store.rows()[0].id, descriptionColumnId(store), 'Parquet');

      expect(store.canPreview()).toBe(true);
    });
  });

  describe('reset', () => {
    it('restores the default three columns and a single empty row', () => {
      const store = createStore();
      store.addRow();
      store.addCustomColumn();
      store.setCustomer({
        customerName: 'M. Dupont',
        customerAddress: '',
        customerEmail: '',
        customerPhone: '',
      });

      store.reset();

      expect(store.rows()).toHaveLength(1);
      expect(store.columns().map((c) => c.role)).toEqual(['DESCRIPTION', 'QUANTITY', 'UNIT_PRICE']);
      expect(store.customer().customerName).toBe('');
    });
  });
});
