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
  { path: 'prestations', component: BlankTestComponent },
  { path: 'factures/nouvelle', component: BlankTestComponent },
  { path: 'factures/nouvelle/lignes', component: BlankTestComponent },
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
});
