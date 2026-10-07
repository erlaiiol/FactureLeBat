import { HttpTestingController } from '@angular/common/http/testing';
import { DatePipe } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, Type, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { BillingStatus } from '../../core/models/billing.model';
import { CompanyProfile } from '../../core/models/company.model';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { BillingService } from '../../core/services/billing.service';
import { CompanyEssentialsGateService } from '../../core/services/company-essentials-gate.service';
import { PaywallService } from '../../core/services/paywall.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { IconCheckComponent } from '../../shared/components/icon-check.component';
import { IconLockComponent } from '../../shared/components/icon-lock.component';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import {
  buildInvoice,
  createNativeShellDoubles,
  flushAsync,
  nativeShellProviders,
  pdfBlob,
  startNativeShell,
  tap,
} from '../../testing/native-shell-testing';
import { InvoiceDraftStore } from './invoice-draft.store';
import { ManualInvoiceDraftStore } from './manual/manual-invoice-draft.store';
import type { InvoiceCreateManualPage as InvoiceCreateManualPageType } from './manual/invoice-create-manual.page';
import type { InvoiceCreatePreviewStepPage as InvoiceCreatePreviewStepPageType } from './preview-step/invoice-create-preview-step.page';

// "Facture créée !" → Télécharger le PDF / Facture électronique, in both
// creation modes (rapide, manuel), inside the Android/iOS shell — the screen
// where the original 2026-10-06 bug was reported (a raw 401 page). Covers
// the full chain: the company-essentials gate and the Factur-X paywall still
// block first, and once cleared the file goes through the app (cookie
// included), never through the WebView or the system browser.
//
// Only the success card is rendered: createdInvoice is set directly, the
// draft stores are minimal fakes, and child components unrelated to these
// links are left as unknown elements.

@Component({ selector: 'app-blank-test', template: '' })
class BlankTestComponent {}

const PDF_URL = `${environment.apiBaseUrl}/invoices/inv-1/pdf`;
const FACTURX_URL = `${environment.apiBaseUrl}/invoices/inv-1/facturx`;

const COMPLETE_PROFILE = {
  name: 'Martin Rénovation',
  siret: '12345678900011',
  addressLine1: '1 rue de la Paix',
  postalCode: '75002',
  city: 'Paris',
} as CompanyProfile;
const INCOMPLETE_PROFILE = { ...COMPLETE_PROFILE, siret: '' } as CompanyProfile;

let InvoiceCreatePreviewStepPage: typeof InvoiceCreatePreviewStepPageType;
let InvoiceCreateManualPage: typeof InvoiceCreateManualPageType;

beforeAll(async () => {
  // jsdom gaps: pdfjs-dist reads DOMMatrix at module load (both pages
  // statically import the PDF preview modal), the manual page observes its
  // footer's size.
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  ({ InvoiceCreatePreviewStepPage } =
    await import('./preview-step/invoice-create-preview-step.page'));
  ({ InvoiceCreateManualPage } = await import('./manual/invoice-create-manual.page'));
});

afterEach(() => TestBed.inject(HttpTestingController).verify());

interface SuccessScreen {
  createdInvoice: WritableSignal<InvoiceWithTotals | null>;
}

function renderSuccess<T>(
  page: Type<T>,
  options: {
    billingStatus: Partial<BillingStatus> | null;
    extraProviders: unknown[];
    setProfile?: (component: T) => void;
  },
) {
  const doubles = createNativeShellDoubles();
  const paywall = { show: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      ...nativeShellProviders(doubles.nativeShare, doubles.toast),
      provideRouter([{ path: '**', component: BlankTestComponent }]),
      { provide: BillingService, useValue: { status: signal(options.billingStatus) } },
      { provide: PaywallService, useValue: paywall },
      ...(options.extraProviders as never[]),
    ],
  });
  TestBed.overrideComponent(page, {
    set: {
      imports: [
        DatePipe,
        RouterLink,
        BigButtonComponent,
        IconCheckComponent,
        IconLockComponent,
        CentsToEurosPipe,
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    },
  });
  const http = startNativeShell();
  const fixture = TestBed.createComponent(page);
  (fixture.componentInstance as unknown as SuccessScreen).createdInvoice.set(buildInvoice());
  options.setProfile?.(fixture.componentInstance);
  fixture.detectChanges();

  const link = (text: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find((a) =>
      a.textContent?.includes(text),
    )!;
  return { ...doubles, http, paywall, link, gate: TestBed.inject(CompanyEssentialsGateService) };
}

describe('Mode rapide — "Facture créée !" downloads in the native shell', () => {
  function render(profile: CompanyProfile | null, billingStatus: Partial<BillingStatus> | null) {
    return renderSuccess(InvoiceCreatePreviewStepPage, {
      billingStatus,
      // canPreview() false: the constructor bails out before loading any
      // draft preview — only the success card matters here.
      extraProviders: [{ provide: InvoiceDraftStore, useValue: { canPreview: () => false } }],
      setProfile: (component) =>
        (
          component as unknown as { companyProfile: WritableSignal<CompanyProfile | null> }
        ).companyProfile.set(profile),
    });
  }

  it('downloads the PDF through the app', async () => {
    const { http, nativeShare, link } = render(COMPLETE_PROFILE, null);

    const event = tap(link('Télécharger le PDF'));

    expect(event.defaultPrevented).toBe(true);
    http.expectOne(PDF_URL).flush(pdfBlob(), {
      headers: { 'Content-Disposition': 'attachment; filename="facture-F-000042.pdf"' },
    });
    await flushAsync();
    expect(nativeShare.share).toHaveBeenCalledWith(expect.any(Blob), 'facture-F-000042.pdf');
  });

  it('asks for the missing company details first, then downloads through the app', async () => {
    const { http, nativeShare, link, gate } = render(INCOMPLETE_PROFILE, null);

    const event = tap(link('Télécharger le PDF'));

    expect(event.defaultPrevented).toBe(true);
    expect(gate.visible()).toBe(true);
    http.expectNone(PDF_URL);

    gate.resolveAfterSave(COMPLETE_PROFILE);
    http.expectOne(PDF_URL).flush(pdfBlob());
    await flushAsync();
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
  });

  it('downloads the Factur-X file through the app when the quota allows it', async () => {
    const { http, nativeShare, link } = render(COMPLETE_PROFILE, { hasPremiumAccess: true });

    tap(link('Télécharger la facture électronique'));

    http.expectOne(FACTURX_URL).flush(pdfBlob());
    await flushAsync();
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
  });

  it('shows the paywall instead of downloading a locked Factur-X file', () => {
    const { http, paywall, link } = render(COMPLETE_PROFILE, null);

    tap(link('Télécharger la facture électronique'));

    expect(paywall.show).toHaveBeenCalled();
    http.expectNone(FACTURX_URL);
  });
});

describe('Mode manuel — "Facture créée !" downloads in the native shell', () => {
  function render(profile: CompanyProfile, billingStatus: Partial<BillingStatus> | null) {
    return renderSuccess(InvoiceCreateManualPage, {
      billingStatus,
      extraProviders: [
        {
          provide: ManualInvoiceDraftStore,
          useValue: {
            company: signal(profile),
            setDocumentType: () => undefined,
            ensureNumberSuggestion: () => undefined,
          },
        },
      ],
    });
  }

  it('downloads the PDF through the app', async () => {
    const { http, nativeShare, link } = render(COMPLETE_PROFILE, null);

    const event = tap(link('Télécharger le PDF'));

    expect(event.defaultPrevented).toBe(true);
    http.expectOne(PDF_URL).flush(pdfBlob());
    await flushAsync();
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
  });

  it('asks for the missing company details first, then downloads through the app', async () => {
    const { http, nativeShare, link, gate } = render(INCOMPLETE_PROFILE, null);

    tap(link('Télécharger le PDF'));

    expect(gate.visible()).toBe(true);
    http.expectNone(PDF_URL);

    gate.resolveAfterSave(COMPLETE_PROFILE);
    http.expectOne(PDF_URL).flush(pdfBlob());
    await flushAsync();
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
  });

  it('shows the paywall instead of downloading a locked Factur-X file', () => {
    const { http, paywall, link } = render(COMPLETE_PROFILE, null);

    tap(link('Télécharger la facture électronique'));

    expect(paywall.show).toHaveBeenCalled();
    http.expectNone(FACTURX_URL);
  });
});
