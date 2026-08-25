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
  vatNumber: null,
  addressLine1: '1 rue des Artisans',
  addressLine2: null,
  postalCode: '69001',
  city: 'Lyon',
  email: null,
  phone: null,
  invoiceMailCustomMessage: null,
  legalStatus: 'COMPANY',
  vatRateBasisPoints: 2000,
  legalStatusConfirmedAt: '2026-01-01T00:00:00.000Z',
  invoiceNumberPrefix: 'F',
  nextInvoiceNumber: 2,
  declarationFrequency: 'TRIMESTRIELLE',
  microEntrepreneurCeiling: null,
  defaultDepositPercentageBasisPoints: null,
  cotisationVenteBasisPoints: 1230,
  cotisationPrestationBicBasisPoints: 2120,
  cotisationPrestationBncBasisPoints: 2110,
  versementLiberatoireOptIn: false,
  decennialInsuranceApplicable: false,
  decennialInsurerName: null,
  decennialInsurancePolicyNumber: null,
  decennialInsuranceCoverageArea: null,
  customFooterMessage: null,
  customFooterOnFacture: false,
  customFooterOnDevis: false,
  earlyPaymentDiscountMention: null,
  vatOnDebitsOption: false,
  autoAttachFacturX: false,
  autoTransmitViaPa: false,
  autoSyncReceivedInvoices: false,
  hasLogo: false,
};

const customerFixture: InvoiceCustomerDraft = {
  customerId: null,
  customerName: 'M. Dupont',
  customerAddress: '',
  customerEmail: '',
  customerPhone: '',
  customerSiret: '',
  deliveryAddress: '',
  saveAsNewCustomer: false,
};

const lineFixture: InvoiceLineDraft = {
  clientId: 'line-client-1',
  description: 'Parquet',
  unit: 'SQUARE_METER',
  quantity: 10,
  unitPriceEuros: 45,
  wasteSurcharge: 'NONE',
  packagingQuantity: null,
  roundUpToPackaging: true,
  productCode: null,
  productId: null,
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
    httpMock.expectOne(`${environment.apiBaseUrl}/discounts`).flush([]);
    return store;
  }

  describe('buildInvoiceRequest', () => {
    it('maps a VISIBLE service line straight through, dropping redistribution fields', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);
      store.setServiceLines([
        {
          clientId: 'service-client-1',
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
          clientId: 'service-client-2',
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
          clientId: 'service-client-3',
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
          clientId: 'service-client-1',
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
          clientId: 'service-client-1',
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
          clientId: 'service-client-2',
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

  describe('Phase 32 — discount line resolution', () => {
    it('sends a FIXED discount amount straight through', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]); // 45000 cents
      store.setDiscountLines([
        {
          discountId: null,
          catalogDiscountId: null,
          saveAsNewDiscount: false,
          name: 'Remise fidélité',
          discountType: 'FIXED',
          fixedAmountEuros: 50,
          percentageBasisPoints: null,
          targetLineClientId: null,
          targetServiceLineClientId: null,
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.discountLines).toEqual([
        { discountId: undefined, name: 'Remise fidélité', amountCents: 5000 },
      ]);
    });

    it('computes a PERCENTAGE discount amount from the product lines total, not a typed amount', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]); // 10 x 45€ = 45000 cents
      store.setDiscountLines([
        {
          discountId: 'discount-1',
          catalogDiscountId: 'discount-1',
          saveAsNewDiscount: false,
          name: 'Remise 10%',
          discountType: 'PERCENTAGE',
          fixedAmountEuros: 0,
          percentageBasisPoints: 1000, // 10%
          targetLineClientId: null,
          targetServiceLineClientId: null,
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.discountLines?.[0].amountCents).toBe(4_500); // 10% of 45000
      expect(store.totalsPreview().subtotalExclVatCents).toBe(45000 - 4500);
    });

    it('never lets discountAmountCents push the previewed subtotal below 0', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]); // 45000 cents
      store.setDiscountLines([
        {
          discountId: null,
          catalogDiscountId: null,
          saveAsNewDiscount: false,
          name: 'Remise énorme',
          discountType: 'FIXED',
          fixedAmountEuros: 9999,
          percentageBasisPoints: null,
          targetLineClientId: null,
          targetServiceLineClientId: null,
        },
      ]);

      expect(store.totalsPreview().subtotalExclVatCents).toBe(0);
      expect(store.totalsPreview().totalInclVatCents).toBe(0);
    });

    it('omits discountLines entirely from the request when there are none', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);

      const request = store.buildInvoiceRequest();

      expect(request.discountLines).toBeUndefined();
    });
  });

  describe('Phase 34 — discount line targeting', () => {
    it('computes a PERCENTAGE discount targeting a specific line off that line’s own total, not the whole invoice', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([
        lineFixture, // clientId 'line-client-1', 10 x 45€ = 45000 cents
        {
          ...lineFixture,
          clientId: 'line-client-2',
          description: 'Plinthes',
          quantity: 5,
          unitPriceEuros: 8, // 5 x 8€ = 4000 cents
        },
      ]);
      store.setDiscountLines([
        {
          discountId: null,
          catalogDiscountId: null,
          saveAsNewDiscount: false,
          name: 'Remise plinthes',
          discountType: 'PERCENTAGE',
          fixedAmountEuros: 0,
          percentageBasisPoints: 1000, // 10%
          targetLineClientId: 'line-client-2',
          targetServiceLineClientId: null,
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.discountLines?.[0].amountCents).toBe(400); // 10% of 4000, not of 49000
      expect(request.discountLines?.[0].targetLineIndex).toBe(1);
      expect(request.discountLines?.[0].targetServiceLineIndex).toBeUndefined();
    });

    it('resolves a targetServiceLineClientId to the matching positional targetServiceLineIndex', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);
      store.setServiceLines([
        {
          clientId: 'service-client-1',
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
      store.setDiscountLines([
        {
          discountId: null,
          catalogDiscountId: null,
          saveAsNewDiscount: false,
          name: 'Remise pose',
          discountType: 'PERCENTAGE',
          fixedAmountEuros: 0,
          percentageBasisPoints: 5000, // 50% of the targeted service line's own 10000 cents
          targetLineClientId: null,
          targetServiceLineClientId: 'service-client-1',
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.discountLines?.[0].amountCents).toBe(5000);
      expect(request.discountLines?.[0].targetLineIndex).toBeUndefined();
      expect(request.discountLines?.[0].targetServiceLineIndex).toBe(0);
    });

    it('falls back to the whole-invoice base when the targeted clientId no longer matches any line', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]); // 45000 cents
      store.setDiscountLines([
        {
          discountId: null,
          catalogDiscountId: null,
          saveAsNewDiscount: false,
          name: 'Remise fantôme',
          discountType: 'PERCENTAGE',
          fixedAmountEuros: 0,
          percentageBasisPoints: 1000, // 10%
          targetLineClientId: 'line-client-does-not-exist',
          targetServiceLineClientId: null,
        },
      ]);

      const request = store.buildInvoiceRequest();

      expect(request.discountLines?.[0].amountCents).toBe(4_500); // 10% of 45000, the whole-invoice base
      expect(request.discountLines?.[0].targetLineIndex).toBeUndefined();
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

  describe('Phase 1.1-7 reverse charge (autoliquidation)', () => {
    it('forces vatApplicable false when reverseChargeApplicable is set, even for a VAT-registered company', () => {
      const store = createStore();
      expect(store.vatApplicable()).toBe(true); // companyFixture is legalStatus COMPANY

      store.setReverseChargeApplicable(true);

      expect(store.vatApplicable()).toBe(false);
    });

    it('sends reverseChargeApplicable only when true and documentType is FACTURE', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);
      store.setDocumentType('FACTURE');
      store.setReverseChargeApplicable(true);

      expect(store.buildInvoiceRequest().reverseChargeApplicable).toBe(true);
    });

    it('omits reverseChargeApplicable from the request for a DEVIS, even if the toggle is on', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);
      store.setDocumentType('DEVIS');
      store.setReverseChargeApplicable(true);

      expect(store.buildInvoiceRequest().reverseChargeApplicable).toBeUndefined();
    });

    it('omits reverseChargeApplicable from the request when off', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);

      expect(store.buildInvoiceRequest().reverseChargeApplicable).toBeUndefined();
    });
  });

  describe('Phase 1.1-8 e-invoicing reform baseline fields', () => {
    it('sends customerSiret/deliveryAddress only when actually filled in', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);

      const emptyRequest = store.buildInvoiceRequest();
      expect(emptyRequest.customerSiret).toBeUndefined();
      expect(emptyRequest.deliveryAddress).toBeUndefined();

      store.setCustomer({
        ...customerFixture,
        customerSiret: '12345678900012',
        deliveryAddress: '9 rue du Chantier',
      });
      const filledRequest = store.buildInvoiceRequest();
      expect(filledRequest.customerSiret).toBe('12345678900012');
      expect(filledRequest.deliveryAddress).toBe('9 rue du Chantier');
    });

    it('never sends manualNatureOfOperation — GUIDED has no such field to send', () => {
      const store = createStore();
      store.setCustomer(customerFixture);
      store.setLines([lineFixture]);

      expect(store.buildInvoiceRequest().manualNatureOfOperation).toBeUndefined();
    });
  });

  describe('Phase 1.1-3 — habitual deposit default', () => {
    it('pre-fills the deposit toggle from defaultDepositPercentageBasisPoints on construction', () => {
      const store = TestBed.inject(InvoiceDraftStore);
      httpMock
        .expectOne(`${environment.apiBaseUrl}/company`)
        .flush({ ...companyFixture, defaultDepositPercentageBasisPoints: 3000 });
      httpMock.expectOne(`${environment.apiBaseUrl}/customers`).flush([]);
      httpMock.expectOne(`${environment.apiBaseUrl}/products`).flush([]);
      httpMock.expectOne(`${environment.apiBaseUrl}/services`).flush([]);
      httpMock.expectOne(`${environment.apiBaseUrl}/discounts`).flush([]);

      expect(store.deposit()).toEqual({
        requested: true,
        percentageBasisPoints: 3000,
        amountOverrideEuros: null,
      });
    });

    it('leaves the deposit toggle off when no habitual rate is set', () => {
      const store = createStore(); // companyFixture.defaultDepositPercentageBasisPoints is null

      expect(store.deposit().requested).toBe(false);
    });

    // Regression test for a real bug found while live-testing Phase 1.1-10:
    // this store is providedIn:'root' and used to cache the company profile
    // it fetched once in its constructor forever — reset() (called by every
    // "nouvelle facture" entry point, e.g. InvoiceCreateModeChoicePage) just
    // re-read that stale cache instead of asking the backend again, so an
    // artisan who changed their habitual rate in "Mon entreprise" after this
    // store's first construction would keep getting the OLD default (or
    // none) until a hard page reload. reset() must now re-fetch and re-apply
    // once the fresh profile comes back — this test would have failed
    // before that fix (deposit would have stayed at the stale 0%/off state).
    it('resyncs the deposit default from a fresh company fetch on reset(), not the stale cached profile', () => {
      const store = createStore(); // defaultDepositPercentageBasisPoints: null at construction
      expect(store.deposit().requested).toBe(false);

      // The artisan raises their habitual rate in "Mon entreprise" sometime
      // later in the same session — this store's cached `company` signal
      // has no way to know that happened.
      store.reset();
      httpMock
        .expectOne(`${environment.apiBaseUrl}/company`)
        .flush({ ...companyFixture, defaultDepositPercentageBasisPoints: 4000 });

      expect(store.deposit()).toEqual({
        requested: true,
        percentageBasisPoints: 4000,
        amountOverrideEuros: null,
      });
    });
  });
});
