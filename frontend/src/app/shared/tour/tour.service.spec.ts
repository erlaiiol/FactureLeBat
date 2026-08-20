import { Component, ElementRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { OnboardingState } from '../../core/models/onboarding.model';
import { CatalogFolderService } from '../../core/services/catalog-folder.service';
import { CustomerService } from '../../core/services/customer.service';
import { DiscountService } from '../../core/services/discount.service';
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
  { path: 'remises', component: BlankTestComponent },
  { path: 'remises/nouvelle', component: BlankTestComponent },
  { path: 'factures/nouvelle', component: BlankTestComponent },
  { path: 'factures/nouvelle/rapide/client', component: BlankTestComponent },
  { path: 'factures/nouvelle/rapide/lignes', component: BlankTestComponent },
  { path: 'factures/nouvelle/rapide/apercu', component: BlankTestComponent },
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

  function seedDiscounts(discounts: unknown[]): void {
    const discountService = TestBed.inject(DiscountService);
    discountService.getAllCached().subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/discounts`).flush(discounts);
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

    // Phase 1.1-10 inserted the devis/facture toggle step (1) before
    // 'invoice-mode-choice' (now 2) — two "Suivant"-equivalent next() calls
    // to reach the mode-choice step instead of one.
    registerAnchor('invoice-devis-facture-toggle');
    service.next();
    await flushAsync();
    expect(service.stepIndex()).toBe(1);

    registerAnchor('invoice-mode-choice');
    service.next();
    await flushAsync();
    expect(service.stepIndex()).toBe(2);

    // The artisan clicks the real "mode rapide" card themselves — the app
    // navigates for real to the client step, which happens to be exactly
    // step 3's own route. Before the fix, this real navigation looked
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
    expect(service.stepIndex()).toBe(3);
  });

  it("continues the tour, not abandons it, when a real navigation lands on a step's route plus an extra query string", async () => {
    const service = createService();
    await harness.navigateByUrl('/factures/nouvelle');
    expect(service.activeTourId()).toBe('invoice-creation');
    seedCustomers([{ id: 'c1', name: 'Client Test' }]); // hasCustomers branch

    registerAnchor('invoice-devis-facture-toggle');
    service.next();
    await flushAsync();
    expect(service.stepIndex()).toBe(1);

    registerAnchor('invoice-mode-choice');
    service.next();
    await flushAsync();
    expect(service.stepIndex()).toBe(2);

    // The real "Mode rapide" card (InvoiceCreateModeChoicePage) carries
    // `[queryParams]="{ type: documentType() }"`, so clicking it for real —
    // the tour's own suggested interaction — lands here with `?type=...`
    // attached. tour-definitions.ts declares this step's route without a
    // query string; before the fix, findForwardStepIndexForRoute's exact
    // string match failed on this and silently abandoned the tour right as
    // it reached the client-choice page.
    registerAnchor('invoice-customer-picker');
    await harness.navigateByUrl('/factures/nouvelle/rapide/client?type=FACTURE');
    // advanceToStep recurses past both noCustomers-only steps (3, 4) before
    // landing on 5 — several more microtask hops than navigateByUrl's own
    // flush covers, same reasoning as the showIf-skip test above.
    await flushAsync();

    expect(service.activeTourId()).toBe('invoice-creation');
    expect(service.stepIndex()).toBe(5);
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
    // Phase 1.1-10: 'produit-form-hint' now anchors on the "Paramètres
    // avancés" folder-picker toggle (see tour-definitions.ts) instead of
    // being a plain centered/route-only step — register it so
    // advanceToStep's waitForAnchor resolves on the next microtask instead
    // of the full 2s timeout.
    registerAnchor('catalog-folder-picker');

    // The artisan clicks the real "+ Nouveau produit" link before ever
    // seeing step 1's own cta — the tour still recognizes where they
    // landed (see 'produit-form-hint' in tour-definitions.ts) and keeps
    // going, rather than treating this as an unplanned route (as it would
    // have before the catalog tour knew about /produits/nouveau).
    await harness.navigateByUrl('/produits/nouveau');
    await flushAsync();

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
    service.stepIndex.set(2);
    registerAnchor('invoice-customer-picker');

    service.next();
    await flushAsync();

    // Index 5: welcome(0), devis-facture-toggle(1), mode-choice(2), the two
    // noCustomers steps(3,4) skipped since a customer now exists, landing on
    // the hasCustomers picker step.
    expect(service.stepIndex()).toBe(5);
  });

  it('branches the add-line step to service-margin, not product-quantity, when the service button is the one clicked', async () => {
    const service = createService();

    await harness.navigateByUrl('/factures/nouvelle/rapide/lignes');
    service.activeTourId.set('invoice-creation');
    service.stepIndex.set(6); // 'add-line'
    registerAnchor('invoice-service-flyout');

    service.next('invoice-add-service-button');
    await Promise.resolve();

    expect(service.currentStep()?.id).toBe('service-margin');
  });

  it('branches the add-line step to product-pick, not straight to product-quantity, when the product button is the one clicked', async () => {
    const service = createService();

    await harness.navigateByUrl('/factures/nouvelle/rapide/lignes');
    service.activeTourId.set('invoice-creation');
    service.stepIndex.set(6); // 'add-line'
    // Mirrors invoice-product-flyout in invoice-create-lines-step.page.html:
    // the flyout panel itself, not the quantity field it doesn't have yet.
    registerAnchor('invoice-product-flyout');

    service.next('invoice-add-product-button');
    await Promise.resolve();

    expect(service.currentStep()?.id).toBe('product-pick');
  });

  // Phase 1.1-10: the folder-aware alternative inserted right after
  // 'product-pick'/'service-margin' — only ever shown to an artisan who's
  // already created at least one dossier, and a no-op (straight through to
  // 'product-quantity'/'service-card') otherwise.
  it('shows the folders hint after product-pick when the artisan already has at least one folder', async () => {
    const service = createService();
    const folderService = TestBed.inject(CatalogFolderService);

    await harness.navigateByUrl('/factures/nouvelle/rapide/lignes');
    service.activeTourId.set('invoice-creation');
    service.stepIndex.set(6); // 'add-line'
    registerAnchor('invoice-product-flyout');
    folderService.getAllCached().subscribe();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/catalog-folders`)
      .flush([{ id: 'f1', name: 'Plomberie' }]);

    service.next('invoice-add-product-button'); // -> product-pick
    await flushAsync();
    expect(service.currentStep()?.id).toBe('product-pick');

    service.next(); // "Suivant" -> should land on product-folders-hint, not product-quantity
    await flushAsync();

    expect(service.currentStep()?.id).toBe('product-folders-hint');
  });

  it('skips straight to product-quantity, with no folders hint, for an artisan with zero dossiers', async () => {
    const service = createService();
    const folderService = TestBed.inject(CatalogFolderService);

    await harness.navigateByUrl('/factures/nouvelle/rapide/lignes');
    service.activeTourId.set('invoice-creation');
    service.stepIndex.set(6); // 'add-line'
    registerAnchor('invoice-product-flyout');
    folderService.getAllCached().subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/catalog-folders`).flush([]);
    registerAnchor('invoice-line-quantity');

    service.next('invoice-add-product-button'); // -> product-pick
    await flushAsync();
    expect(service.currentStep()?.id).toBe('product-pick');

    service.next(); // no folders -> product-folders-hint is skipped entirely
    await flushAsync();

    expect(service.currentStep()?.id).toBe('product-quantity');
  });

  // Phase 1.1-10: the acompte step's anchor only mounts on a FACTURE (see
  // invoice-create-preview-step.page.html's own @if) — on a DEVIS it's
  // skipped exactly like any other missing anchor, no showIf needed.
  it('skips the deposit step when its anchor never mounts (e.g. a DEVIS, which has no deposit field)', async () => {
    vi.useFakeTimers();
    const service = createService();
    await harness.navigateByUrl('/factures/nouvelle/rapide/lignes');
    service.activeTourId.set('invoice-creation');
    const totalIndex = service.steps().findIndex((step) => step.id === 'total');
    service.stepIndex.set(totalIndex);
    registerAnchor('invoice-preview');

    service.next(); // -> 'deposit', whose anchor is never registered here
    await vi.advanceTimersByTimeAsync(2100);

    expect(service.currentStep()?.id).toBe('preview');
  });

  // Regression test: 'deposit' declares its own `route` (the preview step's
  // page, /apercu) unlike 'total'/'preview' whose anchors live in the
  // always-mounted invoice-create-shell — without it, this step silently
  // inherited 'total's route (still the lines step, where
  // 'invoice-deposit-toggle' never mounts) and always timed out straight
  // through to 'preview', found live while testing this phase.
  it('navigates to the preview route to reach the deposit step, on a FACTURE where the anchor exists', async () => {
    const service = createService();
    await harness.navigateByUrl('/factures/nouvelle/rapide/lignes');
    service.activeTourId.set('invoice-creation');
    const totalIndex = service.steps().findIndex((step) => step.id === 'total');
    service.stepIndex.set(totalIndex);
    registerAnchor('invoice-deposit-toggle');

    service.next();
    await flushAsync();

    expect(service.currentStep()?.id).toBe('deposit');
    expect(TestBed.inject(Router).url).toBe('/factures/nouvelle/rapide/apercu');
  });

  // Phase 1.1-10: the "Signer" step shares one anchor id across the two
  // buttons that can both be mounted at once (the DEVIS card and its
  // just-converted FACTURE card) — same registry precedent as
  // 'invoice-line-quantity'.
  it('reaches the sign-action step after the created celebration step', async () => {
    const service = createService();
    // 'created'/'sign-action' declare no `route` of their own (they live on
    // whatever page the preview step's submit already landed on), so no
    // navigation is attempted regardless of which registered route the
    // harness starts from.
    await harness.navigateByUrl('/factures/nouvelle/rapide/lignes');
    service.activeTourId.set('invoice-creation');
    const createdIndex = service.steps().findIndex((step) => step.id === 'created');
    service.stepIndex.set(createdIndex);
    registerAnchor('invoice-sign-action');

    service.next();
    await flushAsync();

    expect(service.currentStep()?.id).toBe('sign-action');
  });

  // Phase 1.1-10: closes the pre-existing gap where the catalog tour never
  // mentioned "Mes remises" — mirrors the produit/prestation cta jump
  // exactly, reached via 'prestation-new-reminder'.next (and
  // 'prestation-celebrate'.next) rather than plain array adjacency.
  it('jumps from the prestation reminder straight to the remise cta when no discount exists yet', async () => {
    const service = createService();
    await harness.navigateByUrl('/prestations');
    service.activeTourId.set('catalog');
    const reminderIndex = service
      .steps()
      .findIndex((step) => step.id === 'prestation-new-reminder');
    service.stepIndex.set(reminderIndex);
    seedDiscounts([]); // noDiscounts
    registerAnchor('catalog-new-discount');

    service.next();
    await flushAsync();

    expect(service.currentStep()?.id).toBe('remise-cta');
  });

  it('catches up on the remise-creation detour when a real navigation lands on "+ Nouvelle remise"\'s route', async () => {
    const service = createService();
    await harness.navigateByUrl('/remises');
    // Not auto-started here ('/remises' isn't in ROUTE_TOUR_MAP — the
    // remise detour is only ever reached by walking the catalog tour from
    // /produits or /prestations, never a fresh auto-launch on /remises
    // itself), so drive it manually to where a real click on "Mes remises"
    // mid-tour would have left it.
    service.activeTourId.set('catalog');
    const ctaIndex = service.steps().findIndex((step) => step.id === 'remise-cta');
    service.stepIndex.set(ctaIndex);

    await harness.navigateByUrl('/remises/nouvelle');

    expect(service.activeTourId()).toBe('catalog');
    expect(service.currentStep()?.id).toBe('remise-form-hint');
  });

  it('celebrates the first discount once the artisan actually saves one', async () => {
    const service = createService();
    await harness.navigateByUrl('/remises');
    // Populates the shared cache (same reasoning as seedProducts in the
    // produit-celebrate test above) so the later create()'s upsertInCache
    // actually updates it, instead of the no-op it is on a never-loaded
    // cache — see DiscountService.upsertInCache's own comment.
    seedDiscounts([]);
    await harness.navigateByUrl('/remises/nouvelle');
    service.activeTourId.set('catalog');
    const formHintIndex = service.steps().findIndex((step) => step.id === 'remise-form-hint');
    service.stepIndex.set(formHintIndex);

    const discountService = TestBed.inject(DiscountService);
    discountService
      .create({ name: 'Fidélité', discountType: 'FIXED', fixedAmountCents: 1000 })
      .subscribe();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/discounts`)
      .flush({ id: 'd1', name: 'Fidélité', discountType: 'FIXED', fixedAmountCents: 1000 });
    await harness.navigateByUrl('/remises');

    expect(service.activeTourId()).toBe('catalog');
    expect(service.currentStep()?.id).toBe('remise-celebrate');
  });

  it('skips the noDiscounts remise cta and lands on the always-shown search step once a discount already exists', async () => {
    const service = createService();
    await harness.navigateByUrl('/prestations');
    service.activeTourId.set('catalog');
    const reminderIndex = service
      .steps()
      .findIndex((step) => step.id === 'prestation-new-reminder');
    service.stepIndex.set(reminderIndex);
    seedDiscounts([{ id: 'd1', name: 'Fidélité' }]); // hasDiscounts
    registerAnchor('discounts-search');

    service.next();
    await flushAsync();

    expect(service.currentStep()?.anchorId).toBe('discounts-search');
  });

  // Phase 1.1-10: the "Client professionnel" checkbox step, always shown
  // (no showIf) right after the customer form-hint — introduces the
  // progressive-disclosure behavior rather than leaving it to be discovered
  // by accident.
  it('reaches the professional-checkbox step right after the customer form hint', async () => {
    const service = createService();
    await harness.navigateByUrl('/clients/nouveau');
    service.activeTourId.set('customers');
    const formHintIndex = service.steps().findIndex((step) => step.id === 'customer-form-hint');
    service.stepIndex.set(formHintIndex);
    registerAnchor('customer-professional-checkbox');

    service.next();
    await flushAsync();

    expect(service.currentStep()?.anchorId).toBe('customer-professional-checkbox');
  });
});
