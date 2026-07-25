import { Component, ElementRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { OnboardingState } from '../../core/models/onboarding.model';
import { TourAnchorRegistryService } from './tour-anchor-registry.service';
import { TourService } from './tour.service';

@Component({ selector: 'app-blank-test', template: '' })
class BlankTestComponent {}

const routes = [
  { path: 'clients', component: BlankTestComponent },
  { path: 'produits', component: BlankTestComponent },
  { path: 'produits/nouveau', component: BlankTestComponent },
  { path: 'prestations', component: BlankTestComponent },
  { path: 'factures/nouvelle', component: BlankTestComponent },
  { path: 'factures/nouvelle/rapide/client', component: BlankTestComponent },
  { path: 'factures/nouvelle/rapide/lignes', component: BlankTestComponent },
  { path: 'factures/nouvelle/manuel', component: BlankTestComponent },
];

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
    registerAnchor('customers-search');

    service.next();
    await Promise.resolve();

    expect(service.stepIndex()).toBe(1);
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

    service.next(); // step 1 needs 'customers-search', which is never registered
    await vi.advanceTimersByTimeAsync(2100);
    // step 1 timed out and fell through to step 2 ('customers-new'), also unregistered
    registerAnchor('customers-new');
    await vi.advanceTimersByTimeAsync(2100);

    expect(service.stepIndex()).toBe(2);
  });

  it('ignores a second next() call made while the first is still resolving', async () => {
    vi.useFakeTimers();
    const service = createService();
    await harness.navigateByUrl('/clients');

    service.next(); // step 1 needs 'customers-search', not registered yet — polling starts
    expect(service.advancing()).toBe(true);
    service.next(); // should be a no-op: a step-1 advance is already in flight

    registerAnchor('customers-search');
    await vi.advanceTimersByTimeAsync(60); // one poll tick is enough to pick it up

    expect(service.stepIndex()).toBe(1);
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

    registerAnchor('invoice-mode-choice');
    service.next();
    await Promise.resolve();
    expect(service.stepIndex()).toBe(1);

    // The artisan clicks the real "mode rapide" card themselves — the app
    // navigates for real to the client step, which happens to be exactly
    // step 2's own route. Before the fix, this real navigation looked
    // identical to "left the flow" and dropped the tour, which then
    // immediately relaunched from its own welcome step on the very next
    // tick — jarring, and it never responded to the click that was
    // actually right.
    registerAnchor('invoice-customer-picker');
    await harness.navigateByUrl('/factures/nouvelle/rapide/client');

    expect(service.activeTourId()).toBe('invoice-creation');
    expect(service.stepIndex()).toBe(2);
  });

  it('quietly stops without immediately relaunching itself, when a real navigation lands on an unplanned route the tour never scripted a step for', async () => {
    const service = createService();
    await harness.navigateByUrl('/produits');
    expect(service.activeTourId()).toBe('catalog');

    // The artisan clicks the real "+ Nouveau produit" button — a route
    // (/produits/nouveau) the catalog tour has no step for, but which still
    // matches ROUTE_TOUR_MAP's '/produits' prefix. Before the fix, dropping
    // the tour here and then re-running the auto-start check on the same
    // navigation immediately relaunched the very tour that was just
    // dropped, flashing its welcome step on top of the create-product form.
    await harness.navigateByUrl('/produits/nouveau');

    expect(service.activeTourId()).toBeNull();
  });
});
