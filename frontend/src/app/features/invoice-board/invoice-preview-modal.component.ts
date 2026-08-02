import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { IconCloseComponent } from '../../shared/components/icon-close.component';
import { PdfCanvasViewerComponent } from '../../shared/components/pdf-canvas-viewer.component';
import { needsCanvasPdfViewer } from '../../shared/utils/pdf-viewer-support.util';

// Opened by clicking a row in InvoiceBoardPage's list (see
// InvoiceListRowComponent.rowClick) — combines what used to be two separate,
// mobile-unfriendly things: the PDF preview (previously only reachable via
// "Télécharger", a full navigation away) and the "..." actions dropdown
// (whose trigger sits at the far right of a horizontally-scrollable table,
// invisible without scrolling on a phone). Bringing both into one modal
// means every action is on-screen and reachable with a single tap,
// regardless of viewport width.
// `pdfBlobUrl` is fetched and owned by InvoiceBoardPage, same
// caller-owns-the-object-URL convention as app-pdf-preview-modal — the CSP's
// `frame-src 'self' blob:` only allows framing same-origin or blob: URLs, so
// the API's own PDF endpoint (a different origin/port in dev) can't be
// embedded directly the way the plain "Télécharger" link's real navigation
// can.
@Component({
  selector: 'app-invoice-preview-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconCloseComponent, PdfCanvasViewerComponent],
  templateUrl: './invoice-preview-modal.component.html',
})
export class InvoicePreviewModalComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly invoiceService = inject(InvoiceService);

  readonly invoice = input<InvoiceWithTotals | null>(null);
  readonly pdfBlobUrl = input<string | null>(null);
  readonly sharing = input(false);
  readonly converting = input(false);

  readonly closed = output<void>();
  readonly share = output<void>();
  readonly convertToFacture = output<void>();
  readonly createFromDevis = output<void>();

  protected readonly isDevis = computed(() => this.invoice()?.documentType === 'DEVIS');
  // See PdfPreviewModalComponent's identical field for why.
  protected readonly useCanvasViewer = needsCanvasPdfViewer();

  protected readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.pdfBlobUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  // The "Télécharger" link stays a plain same-origin-navigating href (like
  // the actions dropdown's own download link) — only the iframe embed needs
  // the blob workaround above.
  protected pdfUrl(): string {
    const invoice = this.invoice();
    return invoice ? this.invoiceService.pdfUrl(invoice.id) : '';
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.invoice()) {
      this.closed.emit();
    }
  }
}
