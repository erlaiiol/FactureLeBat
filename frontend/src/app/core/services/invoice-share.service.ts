import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { InvoiceWithTotals } from '../models/invoice.model';
import { InvoiceService } from './invoice.service';
import { MailSettingsService } from './mail-settings.service';
import { RatingPromptService } from './rating-prompt.service';
import { ToastService } from './toast.service';

// 'compose-email' means the caller must open its own
// app-send-invoice-email-modal (this service never owns that UI, since both
// the board and the creation-success screen already have their own instance
// wired to a page-level signal — see InvoiceBoardPage.openEmailModal /
// InvoiceCreatePreviewStepPage.openEmailModal).
export type ShareOutcome = 'shared' | 'compose-email' | 'mailto-fallback';

// The three-tier "Partager" fallback chain, tried in this fixed order and
// never re-attempted further down after a real user action (a share-sheet
// cancel is not a failure): native Web Share with the PDF file attached and
// the default mail template's text (including the artisan's own custom
// message, if any) as the share text, then the artisan's own configured
// SMTP (reuses the existing compose modal, which loads and lets them edit
// that same template), then a plain mailto pre-filled with it — browsers
// can't attach a file to a mailto link, so the PDF is downloaded alongside
// it for the artisan to attach by hand.
@Injectable({ providedIn: 'root' })
export class InvoiceShareService {
  private readonly http = inject(HttpClient);
  private readonly invoiceService = inject(InvoiceService);
  private readonly mailSettingsService = inject(MailSettingsService);
  private readonly ratingPromptService = inject(RatingPromptService);
  private readonly toastService = inject(ToastService);

  async share(invoice: InvoiceWithTotals): Promise<ShareOutcome> {
    const fileName = this.fileName(invoice);
    // Fetched up front (parallel with the PDF, which is normally the
    // slower of the two) so the artisan's custom message —
    // Company.invoiceMailCustomMessage, baked into this template by the
    // backend — is available for the native tier's `text` below, not just
    // the mailto fallback further down.
    const [pdfBlob, template] = await Promise.all([
      firstValueFrom(
        this.http.get(this.invoiceService.pdfUrl(invoice.id), { responseType: 'blob' }),
      ),
      firstValueFrom(this.invoiceService.getMailTemplate(invoice.id)),
    ]);
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

    if ('canShare' in navigator && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName, text: template.text });
        // navigator.share() only resolves once the OS has handed the PDF to
        // whichever app the artisan picked (Gmail, WhatsApp…) — it says
        // nothing about whether that app's own send/post action was ever
        // completed. This toast exists so the artisan isn't left assuming
        // FactureLeBat itself confirmed delivery, which it structurally
        // cannot: no server round-trip happens on this path at all.
        this.toastService.success(
          'Partage lancé — vérifiez dans l’application choisie que l’envoi a bien abouti.',
        );
        void this.ratingPromptService.notifyInvoiceShared();
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
    const to = invoice.customerEmail ?? '';
    const mailto =
      `mailto:${encodeURIComponent(to)}` +
      `?subject=${encodeURIComponent(template.subject)}` +
      `&body=${encodeURIComponent(template.text)}`;
    window.location.href = mailto;
    this.toastService.success('PDF téléchargé — joignez-le à l’email qui vient de s’ouvrir.');
    void this.ratingPromptService.notifyInvoiceShared();
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
