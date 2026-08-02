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
import { needsCanvasPdfViewer } from '../utils/pdf-viewer-support.util';
import { IconCloseComponent } from './icon-close.component';
import { PdfCanvasViewerComponent } from './pdf-canvas-viewer.component';

// A closable modal showing the "simili-pdf" in place, replacing the earlier
// window.open(blobUrl, '_blank') popup — popups are blocked by some browsers
// and always feel like the app "left" to a new tab. `pdfBlobUrl` is the
// object URL owned by the caller (InvoiceCreateShellPage), which stays
// responsible for revoking it; this component only renders/hides it.
//
// `loading` opens the modal (with a spinner, no iframe) as soon as the
// caller starts fetching the PDF, instead of leaving it invisible until the
// blob arrives — server-side generation + a mobile connection can take a
// few seconds, and the only prior feedback was the trigger button's own
// label, easy to miss and indistinguishable from the app being stuck.
@Component({
  selector: 'app-pdf-preview-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconCloseComponent, PdfCanvasViewerComponent],
  templateUrl: './pdf-preview-modal.component.html',
})
export class PdfPreviewModalComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly pdfBlobUrl = input<string | null>(null);
  readonly loading = input(false);
  readonly closed = output<void>();

  protected readonly isOpen = computed(() => this.loading() || this.pdfBlobUrl() !== null);
  // Native <iframe src="blob:...">, the cheap default, everywhere except
  // Safari/iOS — see needsCanvasPdfViewer's own comment for why those need
  // pdf.js instead. Read once: a mid-session engine switch isn't a real
  // scenario worth reacting to.
  protected readonly useCanvasViewer = needsCanvasPdfViewer();

  // iframe `src` is a sanitized context in Angular — bypassed here because
  // the URL is always one we created ourselves from a same-origin API blob
  // response, never user-supplied.
  protected readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.pdfBlobUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.isOpen()) {
      this.closed.emit();
    }
  }
}
