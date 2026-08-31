import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompanyService } from '../../core/services/company.service';
import {
  ConvertToFactureRequest,
  InvoiceWithTotals,
  SimplifiedDisplayLevel,
} from '../../core/models/invoice.model';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { ModalMorphComponent } from '../../shared/components/modal-morph.component';
import { InvoiceDepositFieldComponent } from '../invoice-create/components/invoice-deposit-field.component';
import { SimplifiedDisplaySliderComponent } from '../invoice-create/components/simplified-display-slider.component';

// Replaces the board's old two separate devis actions ("Facture identique"
// and "Facture à partir du devis") with one entry point
// (InvoiceListRowComponent/InvoicePreviewModalComponent's openConvertModal)
// offering both:
// - "Facture identique": the untouched one-shot clone
//   (InvoiceService.convertToFacture), but with the two document-level
//   choices an artisan most often wants to tweak right there — the display
//   mode and whether to note a deposit — surfaced inline instead of forcing
//   a trip through the full editable wizard just for that.
// - "Reprendre la facture à partir du devis": unchanged, opens the creation
//   wizard pre-filled from the devis (InvoiceBoardPage.createFromDevis).
// Same "close first, the action gives its own feedback" convention as the
// preview modal's other actions (see InvoiceBoardPage.onPreviewShare) — both
// paths here close the modal immediately and let the host page's existing
// toast/navigation carry the result.
@Component({
  selector: 'app-devis-to-facture-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BigButtonComponent,
    ModalMorphComponent,
    InvoiceDepositFieldComponent,
    SimplifiedDisplaySliderComponent,
  ],
  templateUrl: './devis-to-facture-modal.component.html',
})
export class DevisToFactureModalComponent {
  private readonly companyService = inject(CompanyService);
  private readonly destroyRef = inject(DestroyRef);

  readonly devis = input<InvoiceWithTotals | null>(null);

  readonly closed = output<void>();
  readonly identicalConfirmed = output<ConvertToFactureRequest>();
  readonly createFromDevisRequested = output<void>();

  // See InvoicePreviewModalComponent's identical field for why.
  protected readonly displayedDevis = signal<InvoiceWithTotals | null>(null);

  protected readonly simplifiedDisplay = signal<SimplifiedDisplayLevel>('NONE');
  protected readonly depositRequested = signal(false);
  protected readonly depositPercentageBasisPoints = signal(0);
  // null = still auto-following percentage × total, same convention as
  // InvoiceDraftStore.deposit.amountOverrideEuros.
  private readonly depositAmountOverrideEuros = signal<number | null>(null);
  private companyDefaultDepositBasisPoints: number | null = null;

  protected readonly depositAutoCalc = computed(() => this.depositAmountOverrideEuros() === null);
  protected readonly depositAmountCents = computed(() => {
    const override = this.depositAmountOverrideEuros();
    if (override !== null) {
      return Math.max(0, Math.round(override * 100));
    }
    const total = this.displayedDevis()?.totalInclVatCents ?? 0;
    return Math.round((total * this.depositPercentageBasisPoints()) / 10000);
  });

  constructor() {
    this.companyService
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.companyDefaultDepositBasisPoints = profile.defaultDepositPercentageBasisPoints;
        },
      });

    // Re-initializes whenever a different devis opens the modal (the modal
    // instance is reused across rows, not recreated per invoice).
    effect(() => {
      const devis = this.devis();
      if (!devis) {
        return;
      }
      this.displayedDevis.set(devis);
      this.simplifiedDisplay.set(devis.simplifiedDisplay);
      this.depositRequested.set(false);
      this.depositPercentageBasisPoints.set(this.companyDefaultDepositBasisPoints ?? 0);
      this.depositAmountOverrideEuros.set(null);
    });
  }

  protected onDepositRequestedChange(requested: boolean): void {
    this.depositRequested.set(requested);
  }

  protected onDepositPercentageChange(basisPoints: number): void {
    this.depositPercentageBasisPoints.set(basisPoints);
    this.depositAmountOverrideEuros.set(null);
  }

  protected onDepositAmountEurosChange(amountEuros: number): void {
    this.depositAmountOverrideEuros.set(amountEuros);
  }

  protected onResetDepositAutoCalc(): void {
    this.depositAmountOverrideEuros.set(null);
  }

  protected onSimplifiedDisplayChange(level: SimplifiedDisplayLevel): void {
    this.simplifiedDisplay.set(level);
  }

  protected confirmIdentical(): void {
    this.identicalConfirmed.emit({
      simplifiedDisplay: this.simplifiedDisplay(),
      depositPercentageBasisPoints: this.depositRequested()
        ? this.depositPercentageBasisPoints()
        : undefined,
      depositAmountCents: this.depositRequested() ? this.depositAmountCents() : undefined,
    });
  }

  protected requestCreateFromDevis(): void {
    this.createFromDevisRequested.emit();
  }

  protected close(): void {
    this.closed.emit();
  }
}
