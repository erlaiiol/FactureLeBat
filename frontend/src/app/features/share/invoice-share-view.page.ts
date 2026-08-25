import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { InvoiceService } from '../../core/services/invoice.service';
import { PdfCanvasViewerComponent } from '../../shared/components/pdf-canvas-viewer.component';

// Phase 1.3-7 ("Partager"): the @Public() landing spot for a share link —
// reached by anyone holding the token, never a logged-in artisan's own
// session (see app.routes.ts, registered outside authGuard). Always uses
// the canvas/pdf.js viewer, never the plain <iframe> fast-path the
// authenticated preview modals use — a recipient could be on any device,
// and this session already found that iframe+blob PDF rendering is
// unreliable across enough of them (iOS, Android, and whatever else no one
// has hit yet) that the canvas path is the only one worth trusting when the
// audience is unknown. See PdfCanvasViewerComponent's own comment for the
// mechanism this reuses as-is.
@Component({
  selector: 'app-invoice-share-view-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PdfCanvasViewerComponent],
  templateUrl: './invoice-share-view.page.html',
})
export class InvoiceShareViewPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly invoiceService = inject(InvoiceService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly pdfBlobUrl = signal<string | null>(null);
  protected readonly notFound = signal(false);

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }
    this.invoiceService
      .getSharedPdfBlob(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.loading.set(false);
          this.pdfBlobUrl.set(URL.createObjectURL(blob));
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          // Every failure reads as "this link doesn't work anymore" —
          // there is nothing else a visitor with no account can do about a
          // 429 (rate-limited) or 5xx here, and distinguishing them would
          // only invite retrying a token that a 404 says is simply gone.
          this.notFound.set(true);
        },
      });
    this.destroyRef.onDestroy(() => {
      const url = this.pdfBlobUrl();
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
  }
}
