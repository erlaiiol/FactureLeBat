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
  declarationFrequency: 'TRIMESTRIELLE',
  microEntrepreneurCeiling: null,
  cotisationVenteBasisPoints: 1230,
  cotisationPrestationBicBasisPoints: 2120,
  cotisationPrestationBncBasisPoints: 2110,
  versementLiberatoireOptIn: false,
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
  catalogProductId: null,
  saveAsNewProduct: false,
  showUnitDetail: true,
  showBillingDetail: true,
  activityCategory: null,
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
          pricingMode: 'FIXED',
          percentageBasisPoints: null,
          catalogServiceId: null,
          saveAsNewService: false,
          activityCategory: null,
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
          pricingMode: 'FIXED',
          percentageBasisPoints: null,
          catalogServiceId: null,
          saveAsNewService: false,
          activityCategory: null,
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
          pricingMode: 'FIXED',
          percentageBasisPoints: null,
          catalogServiceId: null,
          saveAsNewService: false,
          activityCategory: null,
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

    // Phase 15: the mandatory preview screen's per-line toggles must reach
    // the backend as-is, defaulting true, so a real invoice ends up
    // rendered exactly as the artisan approved it in the preview.
    it('forwards each line’s Phase 15 detail-visibility toggles', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([{ ...lineFixture, showUnitDetail: false, showBillingDetail: true }]);

      const request = store.buildInvoiceRequest();

      expect(request.lines?.[0].showUnitDetail).toBe(false);
      expect(request.lines?.[0].showBillingDetail).toBe(true);
    });
  });

  describe('toggleLineDetail', () => {
    it('flips only the targeted line’s targeted field, leaving the rest untouched', () => {
      const store = createStore();
      store.setLines([
        { ...lineFixture, showUnitDetail: true, showBillingDetail: true },
        { ...lineFixture, showUnitDetail: true, showBillingDetail: true },
      ]);

      store.toggleLineDetail(0, 'showUnitDetail');

      expect(store.lines()[0].showUnitDetail).toBe(false);
      expect(store.lines()[0].showBillingDetail).toBe(true);
      expect(store.lines()[1].showUnitDetail).toBe(true);
    });
  });

  describe('Phase 13.5 — PERCENTAGE service line resolution', () => {
    it('computes a PERCENTAGE service line amount from the product lines total, not a typed amount', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]); // 10 x 45€ = 450€ = 45000 cents
      store.setServiceLines([
        {
          serviceId: 'service-1',
          catalogServiceId: 'service-1',
          saveAsNewService: false,
          activityCategory: null,
          name: 'Marge 30%',
          description: '',
          amountEuros: 0,
          visibility: 'VISIBLE',
          redistributionStrategy: 'EQUAL',
          weights: [],
          pricingMode: 'PERCENTAGE',
          percentageBasisPoints: 3000, // 30%
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.serviceLines?.[0].amountCents).toBe(13_500); // 30% of 45000
    });

    it('gives two PERCENTAGE lines the same base each (no compounding on one another)', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]); // 45000 cents
      store.setServiceLines([
        {
          serviceId: 'service-1',
          catalogServiceId: 'service-1',
          saveAsNewService: false,
          activityCategory: null,
          name: 'Marge 30%',
          description: '',
          amountEuros: 0,
          visibility: 'VISIBLE',
          redistributionStrategy: 'EQUAL',
          weights: [],
          pricingMode: 'PERCENTAGE',
          percentageBasisPoints: 3000,
        },
        {
          serviceId: 'service-2',
          catalogServiceId: 'service-2',
          saveAsNewService: false,
          activityCategory: null,
          name: 'Marge 10%',
          description: '',
          amountEuros: 0,
          visibility: 'VISIBLE',
          redistributionStrategy: 'EQUAL',
          weights: [],
          pricingMode: 'PERCENTAGE',
          percentageBasisPoints: 1000,
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.serviceLines?.[0].amountCents).toBe(13_500); // 30% of 45000
      expect(request.serviceLines?.[1].amountCents).toBe(4_500); // 10% of 45000, not of 45000+13500
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
