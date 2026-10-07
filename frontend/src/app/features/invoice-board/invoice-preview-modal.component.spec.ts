import { HttpTestingController } from '@angular/common/http/testing';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { IconCloseComponent } from '../../shared/components/icon-close.component';
import { ModalMorphComponent } from '../../shared/components/modal-morph.component';
import {
  buildInvoice,
  createNativeShellDoubles,
  flushAsync,
  nativeShellProviders,
  pdfBlob,
  startNativeShell,
  tap,
} from '../../testing/native-shell-testing';
import type { InvoicePreviewModalComponent as InvoicePreviewModalComponentType } from './invoice-preview-modal.component';

// Mes documents → tap a row → preview → Télécharger, inside the Android/iOS
// shell. The link sits in ModalMorphComponent's panel, which stops click
// propagation — kept real here on purpose, it's the container that made this
// link do nothing on Android (2026-10-07). Only the pdf.js viewer is stubbed.
@Component({ selector: 'app-pdf-canvas-viewer', template: '' })
class StubPdfViewerComponent {
  readonly blobUrl = input<string>();
}

describe('InvoicePreviewModalComponent — download in the native shell', () => {
  let InvoicePreviewModalComponent: typeof InvoicePreviewModalComponentType;

  beforeAll(async () => {
    // jsdom gaps: pdfjs-dist reads DOMMatrix at module load (the modal
    // statically imports the viewer), and the modal's open/close morph uses
    // matchMedia + the Web Animations API.
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
    window.matchMedia ??= (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList;
    Element.prototype.animate ??= function () {
      return {
        finished: Promise.resolve(),
        cancel: () => {},
        onfinish: null,
      } as unknown as Animation;
    };
    ({ InvoicePreviewModalComponent } = await import('./invoice-preview-modal.component'));
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('downloads the PDF through the app despite the modal panel stopping propagation', async () => {
    const doubles = createNativeShellDoubles();
    TestBed.configureTestingModule({
      providers: nativeShellProviders(doubles.nativeShare, doubles.toast),
    });
    TestBed.overrideComponent(InvoicePreviewModalComponent, {
      set: { imports: [IconCloseComponent, ModalMorphComponent, StubPdfViewerComponent] },
    });
    const http = startNativeShell();
    const fixture = TestBed.createComponent(InvoicePreviewModalComponent);
    fixture.componentRef.setInput('invoice', buildInvoice());
    fixture.componentRef.setInput('pdfBlobUrl', 'blob:preview');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find(
      (a) => a.textContent?.includes('Télécharger'),
    );
    expect(link).toBeDefined();

    const event = tap(link!);

    expect(event.defaultPrevented).toBe(true);
    http.expectOne(`${environment.apiBaseUrl}/invoices/inv-1/pdf`).flush(pdfBlob(), {
      headers: { 'Content-Disposition': 'attachment; filename="facture-F-000042.pdf"' },
    });
    await flushAsync();
    expect(doubles.nativeShare.share).toHaveBeenCalledWith(
      expect.any(Blob),
      'facture-F-000042.pdf',
    );
  });
});
