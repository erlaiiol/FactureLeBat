import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { BillingStatus } from '../../core/models/billing.model';
import { BillingService } from '../../core/services/billing.service';
import { PaywallService } from '../../core/services/paywall.service';
import {
  buildInvoice,
  createNativeShellDoubles,
  flushAsync,
  nativeShellProviders,
  pdfBlob,
  startNativeShell,
  tap,
} from '../../testing/native-shell-testing';
import { InvoiceListRowComponent } from './invoice-list-row.component';

// Mes documents → "…" menu → Télécharger / Facture électronique, inside the
// Android/iOS shell. The menu lives in a <td (click)="$event.stopPropagation()">,
// which is exactly what made these links do nothing on Android (2026-10-07).
describe('InvoiceListRowComponent — downloads in the native shell', () => {
  const PDF_URL = `${environment.apiBaseUrl}/invoices/inv-1/pdf`;
  const FACTURX_URL = `${environment.apiBaseUrl}/invoices/inv-1/facturx`;

  function render(billingStatus: Partial<BillingStatus> | null) {
    const doubles = createNativeShellDoubles();
    const paywall = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        ...nativeShellProviders(doubles.nativeShare, doubles.toast),
        provideRouter([]),
        { provide: BillingService, useValue: { status: signal(billingStatus) } },
        { provide: PaywallService, useValue: paywall },
      ],
    });
    const http = startNativeShell();
    const fixture: ComponentFixture<InvoiceListRowComponent> =
      TestBed.createComponent(InvoiceListRowComponent);
    fixture.componentRef.setInput('invoice', buildInvoice());
    fixture.componentRef.setInput('actionsMenuOpen', true);
    fixture.detectChanges();
    const link = (text: string) =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find((a) =>
        a.textContent?.includes(text),
      )!;
    return { ...doubles, http, paywall, fixture, link };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('downloads the PDF from the actions menu through the app', async () => {
    const { http, nativeShare, link } = render(null);

    const event = tap(link('Télécharger'));

    expect(event.defaultPrevented).toBe(true);
    http.expectOne(PDF_URL).flush(pdfBlob(), {
      headers: { 'Content-Disposition': 'attachment; filename="facture-F-000042.pdf"' },
    });
    await flushAsync();
    expect(nativeShare.share).toHaveBeenCalledWith(expect.any(Blob), 'facture-F-000042.pdf');
  });

  it('downloads the Factur-X file through the app when the quota allows it', async () => {
    const { http, nativeShare, link } = render({ hasPremiumAccess: true });

    tap(link('électronique'));

    http.expectOne(FACTURX_URL).flush(pdfBlob());
    await flushAsync();
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
  });

  it('shows the paywall instead of downloading a locked Factur-X file', () => {
    const { http, paywall, link } = render(null);

    tap(link('électronique'));

    expect(paywall.show).toHaveBeenCalled();
    http.expectNone(FACTURX_URL);
  });
});
