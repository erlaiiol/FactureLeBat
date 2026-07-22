import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CompanyProfile } from '../../core/models/company.model';
import { InvoiceCustomerDraft, InvoiceDraftStore, InvoiceLineDraft } from './invoice-draft.store';

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

const customerFixture: InvoiceCustomerDraft = {
  customerId: null,
  customerName: 'M. Dupont',
  customerAddress: '',
  customerEmail: '',
  customerPhone: '',
  saveAsNewCustomer: false,
};

const lineFixture: InvoiceLineDraft = {
  description: 'Parquet',
  unit: 'SQUARE_METER',
  quantity: 10,
  unitPriceEuros: 45,
  wasteSurcharge: 'NONE',
  packagingQuantity: null,
  roundUpToPackaging: true,
  productCode: null,
};

describe('InvoiceDraftStore', () => {
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

  // Constructing the store (a providedIn: 'root' service) fires the
  // best-effort company/customers/services loads from its constructor —
  // flush them the same way for every test so httpMock.verify() stays
  // clean, matching the real app's boot sequence.
  function createStore(): InvoiceDraftStore {
    const store = TestBed.inject(InvoiceDraftStore);
    httpMock.expectOne(`${environment.apiBaseUrl}/company`).flush(companyFixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/customers`).flush([]);
    httpMock.expectOne(`${environment.apiBaseUrl}/products`).flush([]);
    httpMock.expectOne(`${environment.apiBaseUrl}/services`).flush([]);
    return store;
  }

  describe('buildInvoiceRequest', () => {
    it('maps a VISIBLE service line straight through, dropping redistribution fields', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);
      store.setServiceLines([
        {
          serviceId: null,
          name: "Main-d'œuvre",
          description: '',
          amountEuros: 100,
          visibility: 'VISIBLE',
          redistributionStrategy: 'EQUAL',
          weights: [],
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.serviceLines).toEqual([
        {
          serviceId: undefined,
          name: "Main-d'œuvre",
          description: undefined,
          amountCents: 10000,
          visibility: 'VISIBLE',
        },
      ]);
    });

    it('sends no weights for a REDISTRIBUTED + EQUAL service line — the backend expands EQUAL itself', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture, { ...lineFixture, description: 'Plinthes' }]);
      store.setServiceLines([
        {
          serviceId: null,
          name: 'Savoir-faire',
          description: '',
          amountEuros: 100,
          visibility: 'REDISTRIBUTED',
          redistributionStrategy: 'EQUAL',
          weights: [1, 1],
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.serviceLines?.[0]).toMatchObject({
        visibility: 'REDISTRIBUTED',
        redistributionStrategy: 'EQUAL',
        weights: undefined,
      });
    });

    it('sends the given per-line weights for a REDISTRIBUTED + WEIGHTED service line', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture, { ...lineFixture, description: 'Plinthes' }]);
      store.setServiceLines([
        {
          serviceId: null,
          name: 'Savoir-faire',
          description: '',
          amountEuros: 100,
          visibility: 'REDISTRIBUTED',
          redistributionStrategy: 'WEIGHTED',
          weights: [3, 1],
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.serviceLines?.[0]).toMatchObject({
        visibility: 'REDISTRIBUTED',
        redistributionStrategy: 'WEIGHTED',
        weights: [3, 1],
      });
    });

    it('converts each line unit price from euros to integer cents', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([{ ...lineFixture, unitPriceEuros: 45.9 }]);

      const request = store.buildInvoiceRequest();

      expect(request.lines?.[0].unitPriceCents).toBe(4590);
    });

    it('omits optional customer fields left blank, and forwards the given customerId', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);

      const request = store.buildInvoiceRequest('customer-42');

      expect(request.customerId).toBe('customer-42');
      expect(request.customerAddress).toBeUndefined();
      expect(request.customerEmail).toBeUndefined();
      expect(request.customerPhone).toBeUndefined();
    });
  });

  describe('canPreview', () => {
    it('is false when the customer name is blank', () => {
      const store = createStore();
      store.setCustomer({ ...customerFixture, customerName: '' });
      store.setLines([lineFixture]);

      expect(store.canPreview()).toBe(false);
    });

    it('is false when no line has a description, unit, and positive quantity', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([{ ...lineFixture, quantity: 0 }]);

      expect(store.canPreview()).toBe(false);
    });

    it('is true once a customer name and at least one usable line are set', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);

      expect(store.canPreview()).toBe(true);
    });
  });
});
