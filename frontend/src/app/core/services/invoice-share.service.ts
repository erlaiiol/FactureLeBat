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
//
// Phase 1.1-11 — recipient auto-fill, tier by tier (requested: "never a
// blank 'à' field the artisan has to fill in by hand"):
// - mailto fallback (below): `to` is built from `invoice.customerEmail ?? ''`.
// - SMTP compose modal ('compose-email' outcome): its own `to` form control
//   is reset from `invoice.customerEmail ?? ''` on open, at the caller's
//   modal (`send-invoice-email-modal.component.ts`), not here.
// - Native Web Share (tried first, above): CANNOT be prefilled, permanently.
//   The Web Share API spec has no recipient parameter at all — it only ever
//   hands a title/text/files/url to whichever app the artisan picks from the
//   OS share sheet, and that app's own "to" field is what stays blank. This
//   is a platform ceiling, not a gap in this codebase, and no workaround is
//   planned (a custom in-app share sheet replacing navigator.share() would
//   trade a familiar native picker for a worse, FactureLe-maintained
//   reimplementation of the same chooser, just to close this one cosmetic
//   gap the other two tiers already cover) — don't re-litigate this as a
//   missing feature.
@Injectable({ providedIn: 'root' })
export class InvoiceShareService {
  private readonly http = inject(HttpClient);
  private readonly invoiceService = inject(InvoiceService);
  private readonly mailSettingsService = inject(MailSettingsService);
  private readonly ratingPromptService = inject(RatingPromptService);
  private readonly toastService = inject(ToastService);

  // Phase 1.2/1.3 review (2026-08-25): `format` lets a caller share the
  // Factur-X hybrid instead of the plain PDF — same three-tier fallback
  // chain, same everything else. Still a valid PDF file either way (Factur-X
  // is PDF/A-3 with the CII XML embedded inside it, not a different file
  // type), so `application/pdf` and the wording below stay accurate for
  // both. Callers must gate `format: 'facturx'` to FACTURE documents
  // themselves — same convention as InvoiceService.facturXUrl's own doc
  // comment already establishes.
  async share(
    invoice: InvoiceWithTotals,
    format: 'pdf' | 'facturx' = 'pdf',
  ): Promise<ShareOutcome> {
    const fileName = this.fileName(invoice, format);
    const sourceUrl =
      format === 'facturx'
        ? this.invoiceService.facturXUrl(invoice.id)
        : this.invoiceService.pdfUrl(invoice.id);
    // Fetched up front (parallel with the PDF, which is normally the
    // slower of the two) so the artisan's custom message —
    // Company.invoiceMailCustomMessage, baked into this template by the
    // backend — is available for the native tier's `text` below, not just
    // the mailto fallback further down.
    const [pdfBlob, template] = await Promise.all([
      firstValueFrom(this.http.get(sourceUrl, { responseType: 'blob' })),
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

  private fileName(invoice: InvoiceWithTotals, format: 'pdf' | 'facturx'): string {
    const prefix = invoice.documentType === 'DEVIS' ? 'devis' : 'facture';
    // Matches InvoiceController's own `Content-Disposition` filename for the
    // plain download link (invoice.controller.ts) so a shared/downloaded
    // copy of the same document always has the same name either way.
    return format === 'facturx'
      ? `facture-${invoice.number}-factur-x.pdf`
      : `${prefix}-${invoice.number}.pdf`;
  }
}
