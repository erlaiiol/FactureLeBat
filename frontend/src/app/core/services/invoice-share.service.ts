import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { InvoiceWithTotals } from '../models/invoice.model';
import { InvoiceService } from './invoice.service';
import { MailSettingsService } from './mail-settings.service';
import { ToastService } from './toast.service';

// 'compose-email' means the caller must open its own
// app-send-invoice-email-modal (this service never owns that UI, since both
// the board and the creation-success screen already have their own instance
// wired to a page-level signal — see InvoiceBoardPage.openEmailModal /
// InvoiceCreatePreviewStepPage.openEmailModal).
export type ShareOutcome = 'shared' | 'compose-email' | 'mailto-fallback';

// The three-tier "Partager" fallback chain, tried in this fixed order and
// never re-attempted further down after a real user action (a share-sheet
// cancel is not a failure): native Web Share with the PDF file attached,
// then the artisan's own configured SMTP (reuses the existing compose
// modal), then a plain mailto — browsers can't attach a file to a mailto
// link, so the PDF is downloaded alongside it for the artisan to attach by
// hand.
@Injectable({ providedIn: 'root' })
export class InvoiceShareService {
  private readonly http = inject(HttpClient);
  private readonly invoiceService = inject(InvoiceService);
  private readonly mailSettingsService = inject(MailSettingsService);
  private readonly toastService = inject(ToastService);

  async share(invoice: InvoiceWithTotals): Promise<ShareOutcome> {
    const fileName = this.fileName(invoice);
    const pdfBlob = await firstValueFrom(
      this.http.get(this.invoiceService.pdfUrl(invoice.id), { responseType: 'blob' }),
    );
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

    if ('canShare' in navigator && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return 'shared';
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return 'shared'; // artisan closed the native sheet — not a failure
        }
        // Any other failure (e.g. a permissions-policy rejection) falls
        // through to the SMTP/mailto tiers below.
      }
    }

    const mailSettings = await firstValueFrom(this.mailSettingsService.getSettings());
    if (mailSettings.configured) {
      return 'compose-email';
    }

    this.downloadBlob(pdfBlob, fileName);
    const template = await firstValueFrom(this.invoiceService.getMailTemplate(invoice.id));
    const to = invoice.customerEmail ?? '';
    const mailto =
      `mailto:${encodeURIComponent(to)}` +
      `?subject=${encodeURIComponent(template.subject)}` +
      `&body=${encodeURIComponent(template.text)}`;
    window.location.href = mailto;
    this.toastService.success('PDF téléchargé — joignez-le à l’email qui vient de s’ouvrir.');
    return 'mailto-fallback';
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private fileName(invoice: InvoiceWithTotals): string {
    const prefix = invoice.documentType === 'DEVIS' ? 'devis' : 'facture';
    return `${prefix}-${invoice.number}.pdf`;
  }
}
