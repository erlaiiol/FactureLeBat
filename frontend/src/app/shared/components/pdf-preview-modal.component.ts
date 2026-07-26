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
import { IconCloseComponent } from './icon-close.component';

// A closable modal showing the "simili-pdf" in place, replacing the earlier
// window.open(blobUrl, '_blank') popup — popups are blocked by some browsers
// and always feel like the app "left" to a new tab. `pdfBlobUrl` is the
// object URL owned by the caller (InvoiceCreateShellPage), which stays
// responsible for revoking it; this component only renders/hides it.
@Component({
  selector: 'app-pdf-preview-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconCloseComponent],
  templateUrl: './pdf-preview-modal.component.html',
})
export class PdfPreviewModalComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly pdfBlobUrl = input<string | null>(null);
  readonly closed = output<void>();

  // iframe `src` is a sanitized context in Angular — bypassed here because
  // the URL is always one we created ourselves from a same-origin API blob
  // response, never user-supplied.
  protected readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.pdfBlobUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.pdfBlobUrl()) {
      this.closed.emit();
    }
  }
}
