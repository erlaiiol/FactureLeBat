import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ReceivedInvoice } from '../../core/models/received-invoice.model';
import {
  createNativeShellDoubles,
  flushAsync,
  nativeShellProviders,
  pdfBlob,
  startNativeShell,
  tap,
} from '../../testing/native-shell-testing';
import { ReceivedInvoiceListPage } from './received-invoice-list.page';

// Factures reçues → Télécharger, inside the Android/iOS shell: must go
// through the app (cookie included), never leave the WebView.
describe('ReceivedInvoiceListPage — download in the native shell', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('downloads a received invoice through the app', async () => {
    const doubles = createNativeShellDoubles();
    TestBed.configureTestingModule({
      providers: nativeShellProviders(doubles.nativeShare, doubles.toast),
    });
    const http = startNativeShell();
    const fixture = TestBed.createComponent(ReceivedInvoiceListPage);

    const received: ReceivedInvoice = {
      id: 'rcv-1',
      issuerName: 'Fournisseur SARL',
      issuerSiret: null,
      number: 'FA-77',
      issueDate: '2026-10-01',
      totalInclVatCents: 5000,
      vatAmountCents: 833,
      currencyCode: 'EUR',
      receivedAt: '2026-10-02T08:00:00.000Z',
    };
    http.expectOne(`${environment.apiBaseUrl}/received-invoices`).flush([received]);
    http
      .expectOne(`${environment.apiBaseUrl}/company/super-pdp/status`)
      .flush({ configured: true, connected: true });
    fixture.detectChanges();

    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find(
      (a) => a.textContent?.includes('Télécharger'),
    );
    expect(link).toBeDefined();

    const event = tap(link!);

    expect(event.defaultPrevented).toBe(true);
    http.expectOne(`${environment.apiBaseUrl}/received-invoices/rcv-1/download`).flush(pdfBlob());
    await flushAsync();
    expect(doubles.nativeShare.share).toHaveBeenCalledTimes(1);
  });
});
