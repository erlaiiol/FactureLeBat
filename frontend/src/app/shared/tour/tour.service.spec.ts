import { Component, ElementRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { OnboardingState } from '../../core/models/onboarding.model';
import { CustomerService } from '../../core/services/customer.service';
import { ProductService } from '../../core/services/product.service';
import { TourAnchorRegistryService } from './tour-anchor-registry.service';
import { TourService } from './tour.service';

@Component({ selector: 'app-blank-test', template: '' })
class BlankTestComponent {}

const routes = [
  { path: 'clients', component: BlankTestComponent },
  { path: 'clients/nouveau', component: BlankTestComponent },
  { path: 'produits', component: BlankTestComponent },
  { path: 'produits/nouveau', component: BlankTestComponent },
  // A route the catalog tour genuinely has no step for — kept distinct from
  // 'produits/nouveau', which the tour now DOES understand (see
  // 'produit-form-hint' in tour-definitions.ts) — this stands in for some
  // other unplanned page (e.g. a future import flow) for the "quietly
  // stops" test below.
  { path: 'produits/import-test', component: BlankTestComponent },
  { path: 'prestations', component: BlankTestComponent },
  { path: 'prestations/nouvelle', component: BlankTestComponent },
  { path: 'factures/nouvelle', component: BlankTestComponent },
  { path: 'factures/nouvelle/rapide/client', component: BlankTestComponent },
  { path: 'factures/nouvelle/rapide/lignes', component: BlankTestComponent },
  { path: 'factures/nouvelle/manuel', component: BlankTestComponent },
];

// Real promise-based flush (a macrotask boundary via setTimeout(0)), not
// just one `await Promise.resolve()` — evaluateShowIf's fetch-then-decide
// chain (see TourService) resolves over several microtask hops, and a
// single `await Promise.resolve()` isn't guaranteed to drain all of them.
async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const FRESH_STATE: OnboardingState = { tourEnabled: true, completedTours: [] };

describe('TourService', () => {
  let httpMock: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  // Constructing the service (providedIn: 'root') fires the best-effort
  // onboarding-state load from its constructor — flush it the same way for
  // every test, matching InvoiceDraftStore's test pattern.
  function createService(initialState: OnboardingState = FRESH_STATE): TourService {
    const service = TestBed.inject(TourService);
    httpMock.expectOne(`${environment.apiBaseUrl}/onboarding`).flush(initialState);
    return service;
  }

  function registerAnchor(id: string): void {
    const registry = TestBed.inject(TourAnchorRegistryService);
    registry.register(id, new ElementRef(document.createElement('div')));
  }

  // Pre-populates CustomerService's shared cache synchronously, so a
  // subsequent evaluateShowIf('noCustomers'/'hasCustomers') hits
  // getAllCached()'s already-loaded branch (of(cached)) instead of firing a
  // real HTTP request the test would also have to flush.
  function seedCustomers(customers: unknown[]): void {
    const customerService = TestBed.inject(CustomerService);
    customerService.getAllCached().subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/customers`).flush(customers);
  }

  function seedProducts(products: unknown[]): void {
    const productService = TestBed.inject(ProductService);
    productService.getAllCached().subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/products`).flush(products);
  }

  it('auto-starts the matching tour on first visit to a known section', async () => {
    const service = createService();

    await harness.navigateByUrl('/clients');

    expect(service.activeTourId()).toBe('customers');
    expect(service.stepIndex()).toBe(0);
  });

  it('does not auto-start a tour already in completedTours', async () => {
    const service = createService({ tourEnabled: true, completedTours: ['customers'] });

    await harness.navigateByUrl('/clients');

    expect(service.activeTourId()).toBeNull();
  });

  it('does not auto-start anything when tourEnabled is false', async () => {
    const service = createService({ tourEnabled: false, completedTours: [] });

    await harness.navigateByUrl('/clients');

    expect(service.activeTourId()).toBeNull();
  });

  it('advances to the next step once its anchor is registered', async () => {
    const service = createService();
    await harness.navigateByUrl('/clients');
    seedCustomers(['c1']); // hasCustomers → the noCustomers cta (step 1) is skipped
    registerAnchor('customers-search');

    service.next();
    await flushAsync();

    expect(service.stepIndex()).toBe(2);
  });

  it('skip() completes the tour and persists it so it will not resurface', async () => {
    const service = createService();
    await harness.navigateByUrl('/clients');

    service.skip();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/onboarding/tours/customers/complete`)
      .flush({ tourEnabled: true, completedTours: ['customers'] });

    expect(service.activeTourId()).toBeNull();
  });

  it('skips a step whose anchor never mounts, instead of stalling the tour', async () => {
    vi.useFakeTimers();
    const service = createService();
    await harness.navigateByUrl('/clients');
    seedCustomers([]); // noCustomers → step 1 ('customers-new' cta) is the one in play

    service.next(); // step 1 needs 'customers-new', which is never registered
    await vi.advanceTimersByTimeAsync(2100);
    // step 1 timed out and fell through to step 2 ('customers-search'), also unregistered
    registerAnchor('customers-search');
    await vi.advanceTimersByTimeAsync(2100);

    expect(service.stepIndex()).toBe(2);
  });

  it('ignores a second next() call made while the first is still resolving', async () => {
    vi.useFakeTimers();
    const service = createService();
    await harness.navigateByUrl('/clients');
    seedCustomers(['c1']); // hasCustomers → the noCustomers cta (step 1) is skipped

    service.next(); // step 2 needs 'customers-search', not registered yet — polling starts
    expect(service.advancing()).toBe(true);
    service.next(); // should be a no-op: an advance is already in flight

    registerAnchor('customers-search');
    await vi.advanceTimersByTimeAsync(60); // one poll tick is enough to pick it up

    expect(service.stepIndex()).toBe(2);
    expect(service.advancing()).toBe(false);
  });

  it('auto-starts the mode-manuel-specific tour, not the general invoice-creation one, on /factures/nouvelle/manuel', async () => {
    const service = createService();

    await harness.navigateByUrl('/factures/nouvelle/manuel');

    expect(service.activeTourId()).toBe('invoice-creation-manual');
  });

  it('auto-starts the general invoice-creation tour on the mode-choice screen itself', async () => {
    const service = createService();

    await harness.navigateByUrl('/factures/nouvelle');

    expect(service.activeTourId()).toBe('invoice-creation');
  });

  it('abandons the active tour, without marking it completed, when the artisan navigates away some other way', async () => {
    const service = createService();
    await harness.navigateByUrl('/clients');
    expect(service.activeTourId()).toBe('customers');

    // Not the tour's own navigation (e.g. a sidebar link, or the back
    // button) — the customers tour should be dropped, not left pinned to
    // an anchor that no longer exists, and the catalog tour (also unseen)
    // is free to auto-start on this new route.
    await harness.navigateByUrl('/produits');

    expect(service.activeTourId()).toBe('catalog');
    expect(service.stepIndex()).toBe(0);
    // If the abandoned tour had wrongly been marked complete, that would
    // have fired an uncompleted HTTP request here, and httpMock.verify()
    // in afterEach would fail.
  });

  it('continues the tour instead of restarting it, when a real navigation (not "Suivant") lands on an upcoming step\'s own route', async () => {
    const service = createService();
    await harness.navigateByUrl('/factures/nouvelle');
    expect(service.activeTourId()).toBe('invoice-creation');
    expect(service.stepIndex()).toBe(0);
    seedCustomers([]); // noCustomers, so the branch below is the one that matches

    registerAnchor('invoice-mode-choice');
    service.next();
    await flushAsync();
    expect(service.stepIndex()).toBe(1);

    // The artisan clicks the real "mode rapide" card themselves — the app
    // navigates for real to the client step, which happens to be exactly
    // step 2's own route. Before the fix, this real navigation looked
    // identical to "left the flow" and dropped the tour, which then
    // immediately relaunched from its own welcome step on the very next
    // tick — jarring, and it never responded to the click that was
    // actually right.
    // No customer registered in CustomerService, so the tour's 'noCustomers'
    // branch is the one whose route matches — its anchor is the "+ Nouveau
    // client" button, not the generic picker container.
    registerAnchor('invoice-new-customer-button');
    await harness.navigateByUrl('/factures/nouvelle/rapide/client');

    expect(service.activeTourId()).toBe('invoice-creation');
    expect(service.stepIndex()).toBe(2);
  });

  it("continues the tour, not abandons it, when a real navigation lands on a step's route plus an extra query string", async () => {
    const service = createService();
    await harness.navigateByUrl('/factures/nouvelle');
    expect(service.activeTourId()).toBe('invoice-creation');
    seedCustomers([{ id: 'c1', name: 'Client Test' }]); // hasCustomers branch

    registerAnchor('invoice-mode-choice');
    service.next();
    await flushAsync();
    expect(service.stepIndex()).toBe(1);

    // The real "Mode rapide" card (InvoiceCreateModeChoicePage) carries
    // `[queryParams]="{ type: documentType() }"`, so clicking it for real —
    // the tour's own suggested interaction — lands here with `?type=...`
    // attached. tour-definitions.ts declares this step's route without a
    // query string; before the fix, findForwardStepIndexForRoute's exact
    // string match failed on this and silently abandoned the tour right as
    // it reached the client-choice page.
    registerAnchor('invoice-customer-picker');
    await harness.navigateByUrl('/factures/nouvelle/rapide/client?type=FACTURE');
    // advanceToStep recurses past both noCustomers-only steps (2, 3) before
    // landing on 4 — several more microtask hops than navigateByUrl's own
    // flush covers, same reasoning as the showIf-skip test above.
    await flushAsync();

    expect(service.activeTourId()).toBe('invoice-creation');
    expect(service.stepIndex()).toBe(4);
  });

  it('quietly stops without immediately relaunching itself, when a real navigation lands on an unplanned route the tour never scripted a step for', async () => {
    const service = createService();
    await harness.navigateByUrl('/produits');
    expect(service.activeTourId()).toBe('catalog');

    // A route the catalog tour genuinely has no step for, but which still
    // matches ROUTE_TOUR_MAP's '/produits' prefix. Before the original fix,
    // dropping the tour here and then re-running the auto-start check on the
    // same navigation immediately relaunched the very tour that was just
    // dropped, flashing its welcome step on top of whatever page this was.
    await harness.navigateByUrl('/produits/import-test');

    expect(service.activeTourId()).toBeNull();
  });

  it('catches up on the produit-creation detour when a real navigation lands on "+ Nouveau produit"\'s route, even from the welcome step', async () => {
    const service = createService();
    await harness.navigateByUrl('/produits');
    expect(service.activeTourId()).toBe('catalog');
    expect(service.stepIndex()).toBe(0);

    // The artisan clicks the real "+ Nouveau produit" link before ever
    // seeing step 1's own cta — the tour still recognizes where they
    // landed (see 'produit-form-hint' in tour-definitions.ts) and keeps
    // going, rather than treating this as an unplanned route (as it would
    // have before the catalog tour knew about /produits/nouveau).
    await harness.navigateByUrl('/produits/nouveau');

    expect(service.activeTourId()).toBe('catalog');
    expect(service.currentStep()?.id).toBe('produit-form-hint');
  });

  it('skips the noProducts cta and celebrates the first product once the artisan actually saves one', async () => {
    const service = createService();
    await harness.navigateByUrl('/produits');
    seedProducts([]); // noProducts, so the create-first-product detour applies

    // Already mid-detour, as if step 1's cta had just been clicked and the
    // real navigation to /produits/nouveau had already caught the tour up
    // (see the test above) — avoids re-testing that part here.
    await harness.navigateByUrl('/produits/nouveau');
    service.activeTourId.set('catalog');
    const formHintIndex = service.steps().findIndex((step) => step.id === 'produit-form-hint');
    service.stepIndex.set(formHintIndex);

    // The artisan saves the form for real — ProductService.create() (see
    // product-form.page.ts) updates the shared cache synchronously via
    // upsertInCache before navigating back, so by the time this real
    // navigation reaches TourService, hasProducts already reads true.
    const productService = TestBed.inject(ProductService);
    productService.create({ name: 'Parquet', unit: 'SQUARE_METER', priceCents: 1000 }).subscribe();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/products`)
      .flush({ id: 'p1', name: 'Parquet', unit: 'SQUARE_METER', priceCents: 1000 });
    await harness.navigateByUrl('/produits');

    expect(service.activeTourId()).toBe('catalog');
    expect(service.currentStep()?.id).toBe('produit-celebrate');
  });

  it('skips the noCustomers customer steps and lands on the picker step when customers already exist', async () => {
    const service = createService();
    const customerService = TestBed.inject(CustomerService);
    customerService.getAllCached().subscribe();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/customers`)
      .flush([{ id: 'c1', name: 'Client Test' }]);

    // Already on the customer-step route and one step short of it, as if
    // mode-choice had just been confirmed — avoids re-testing the
    // route-navigation part of advanceToStep, which showIf doesn't touch.
    await harness.navigateByUrl('/factures/nouvelle/rapide/client');
    service.activeTourId.set('invoice-creation');
    service.stepIndex.set(1);
    registerAnchor('invoice-customer-picker');

    service.next();
    await flushAsync();

    // Index 4: welcome(0), mode-choice(1), the two noCustomers steps(2,3)
    // skipped since a customer now exists, landing on the hasCustomers
    // picker step.
    expect(service.stepIndex()).toBe(4);
  });

  it('branches the add-line step to service-margin, not product-quantity, when the service button is the one clicked', async () => {
    const service = createService();

    await harness.navigateByUrl('/factures/nouvelle/rapide/lignes');
    service.activeTourId.set('invoice-creation');
    service.stepIndex.set(5); // 'add-line'
    registerAnchor('invoice-service-flyout');

    service.next('invoice-add-service-button');
    await Promise.resolve();

    expect(service.currentStep()?.id).toBe('service-margin');
  });

  it('branches the add-line step to product-pick, not straight to product-quantity, when the product button is the one clicked', async () => {
    const service = createService();

    await harness.navigateByUrl('/factures/nouvelle/rapide/lignes');
    service.activeTourId.set('invoice-creation');
    service.stepIndex.set(5); // 'add-line'
    // Mirrors invoice-product-flyout in invoice-create-lines-step.page.html:
    // the flyout panel itself, not the quantity field it doesn't have yet.
    registerAnchor('invoice-product-flyout');

    service.next('invoice-add-product-button');
    await Promise.resolve();

    expect(service.currentStep()?.id).toBe('product-pick');
  });
});
