import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { BigButtonComponent } from './big-button.component';
import { FieldHintComponent } from './field-hint.component';
import { IconCloseComponent } from './icon-close.component';
import { ModalMorphComponent } from './modal-morph.component';

// Same closable-modal shape as app-pdf-preview-modal — a self-contained
// dialog the caller opens by setting `invoice`, closes via the `closed`
// output. Loads the backend's default subject/text once opened (see
// InvoiceMailService.getDefaultTemplate) so the artisan edits the exact copy
// that would otherwise be sent, rather than a client-side guess at it.
@Component({
  selector: 'app-send-invoice-email-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BigButtonComponent,
    FieldHintComponent,
    IconCloseComponent,
    ModalMorphComponent,
  ],
  templateUrl: './send-invoice-email-modal.component.html',
})
export class SendInvoiceEmailModalComponent {
  private readonly invoiceService = inject(InvoiceService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoice = input<InvoiceWithTotals | null>(null);
  // Which file the "Partager"/"Partager en Factur-X" button was on before
  // falling through to this SMTP tier (InvoiceShareService) — sent along so
  // the backend attaches that same file instead of falling back to the
  // company-wide Company.autoAttachFacturX default. Undefined for callers
  // with no Factur-X button (e.g. the board), same as before this existed.
  readonly format = input<'pdf' | 'facturx' | undefined>(undefined);
  readonly closed = output<void>();
  readonly sent = output<InvoiceWithTotals>();

  protected readonly templateLoading = signal(true);
  protected readonly sending = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // See InvoicePreviewModalComponent's identical field for why.
  protected readonly displayedInvoice = signal<InvoiceWithTotals | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    to: ['', [Validators.required, Validators.email]],
    subject: ['', Validators.required],
    message: ['', Validators.required],
  });

  constructor() {
    // Re-loads whenever a different invoice opens the modal (the modal
    // instance is reused across rows, not recreated per invoice).
    effect(() => {
      const invoice = this.invoice();
      if (!invoice) {
        return;
      }
      this.displayedInvoice.set(invoice);
      this.templateLoading.set(true);
      this.errorMessage.set(null);
      this.form.reset({ to: invoice.customerEmail ?? '', subject: '', message: '' });

      this.invoiceService
        .getMailTemplate(invoice.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (template) => {
            this.templateLoading.set(false);
            this.form.patchValue({ subject: template.subject, message: template.text });
          },
          error: () => {
            this.templateLoading.set(false);
            this.errorMessage.set('Impossible de charger le message par défaut.');
          },
        });
    });
  }

  protected submit(): void {
    const invoice = this.invoice();
    if (!invoice || this.sending()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.sending.set(true);
    this.errorMessage.set(null);

    this.invoiceService
      .sendEmail(invoice.id, { ...value, format: this.format() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.sending.set(false);
          this.sent.emit(updated);
        },
        error: (error: HttpErrorResponse) => {
          this.sending.set(false);
          this.errorMessage.set(
            typeof error.error?.message === 'string'
              ? error.error.message
              : "Erreur lors de l'envoi. Veuillez réessayer.",
          );
        },
      });
  }
}
