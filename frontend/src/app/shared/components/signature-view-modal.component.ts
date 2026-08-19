import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  input,
  output,
} from '@angular/core';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { IconCloseComponent } from './icon-close.component';

// "Voir la signature" — a plain full-size lightbox for the attached
// InvoiceSignature image. No PDF/canvas-viewer complexity needed (unlike
// PdfPreviewModalComponent) since this is a plain raster image, not a PDF.
@Component({
  selector: 'app-signature-view-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconCloseComponent],
  templateUrl: './signature-view-modal.component.html',
})
export class SignatureViewModalComponent {
  private readonly invoiceService = inject(InvoiceService);

  readonly invoice = input<InvoiceWithTotals | null>(null);
  readonly closed = output<void>();

  protected imageUrl(): string {
    const invoice = this.invoice();
    return invoice ? this.invoiceService.signatureUrl(invoice.id) : '';
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.invoice()) {
      this.closed.emit();
    }
  }
}
