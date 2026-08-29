import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CentsToEurosPipe } from '../../../shared/pipes/cents-to-euros.pipe';
import { TypewriterTextComponent } from '../../../shared/components/typewriter-text.component';

// Phase 1.1-3: the "Demander un acompte" toggle, shared as-is between mode
// rapide's preview step and mode manuel's canvas — same two input surfaces,
// same fields, same autoCalc behavior either way (see InvoiceDraftStore/
// ManualInvoiceDraftStore's deposit signal). Purely a controlled component:
// every value it shows comes from an input, every edit is emitted upward —
// the store (not this component) owns the auto/frozen distinction.
//
// Decided with the user: the percentage and amount fields stay
// automatically in sync (editing either recomputes the other) for as long
// as neither has been typed into directly. The moment the artisan edits the
// amount field (or, in mode manuel, the invoice's own Total TTC override)
// directly, the automatic link freezes — a toast (fired by the host page,
// not here) warns them, and the "Réinitialiser" button below reappears to
// resume automatic mode.
@Component({
  selector: 'app-invoice-deposit-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CentsToEurosPipe, TypewriterTextComponent],
  template: `
    <div
      class="flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm"
      [class.border-line]="!highlighted()"
      [class.bg-surface]="!highlighted()"
      [class.border-info-subtle-border]="highlighted()"
      [class.bg-info-subtle]="highlighted()"
    >
      <label class="flex items-center gap-3">
        <input
          type="checkbox"
          [checked]="requested()"
          (change)="requestedChange.emit($any($event.target).checked)"
          class="h-4 w-4 rounded border-line"
        />
        <span class="font-medium text-ink">Demander un acompte</span>
      </label>
      @if (highlighted()) {
        <p class="pl-7 text-xs text-info-subtle-fg min-h-[1em]">
          @switch (subtitleState()) {
            @case ('active') {
              <app-typewriter-text [text]="subtitleText" (typingComplete)="subtitleTyped.emit()" />
            }
            @case ('done') {
              {{ subtitleText }}
            }
          }
        </p>
      }
      @if (requested()) {
        <div class="flex flex-wrap items-end gap-4 pl-7">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-ink-soft">Pourcentage</span>
            <div class="flex items-center gap-1">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                [value]="percentagePercent()"
                (input)="onPercentageChange($event)"
                class="w-20 rounded border border-line bg-secondary-subtle/40 px-2 py-1 text-right font-mono text-ink outline-none transition-colors hover:bg-secondary-subtle focus:bg-secondary-subtle"
              />
              <span class="text-ink-soft">%</span>
            </div>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-ink-soft">Montant</span>
            <div class="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                min="0"
                [value]="amountEuros()"
                (change)="onAmountChange($event)"
                class="w-28 rounded border border-line bg-secondary-subtle/40 px-2 py-1 text-right font-mono text-ink outline-none transition-colors hover:bg-secondary-subtle focus:bg-secondary-subtle"
              />
              <span class="text-ink-soft">€</span>
            </div>
          </label>
          @if (!autoCalc()) {
            <button
              type="button"
              (click)="resetAutoCalc.emit()"
              class="text-xs font-medium text-primary hover:underline"
            >
              Réinitialiser le calcul automatique
            </button>
          }
        </div>
        <p class="pl-7 text-xs text-ink-soft">
          Imprimé sur le document : « Acompte demandé : {{ percentagePercent() }} % soit
          {{ amountCents() | centsToEuros }} »
        </p>
      }
    </div>
  `,
})
export class InvoiceDepositFieldComponent {
  readonly requested = input.required<boolean>();
  readonly percentageBasisPoints = input.required<number>();
  readonly amountCents = input.required<number>();
  // Whether the amount is still auto-following the percentage × total, or
  // was frozen by a direct edit — only the reset button's visibility reads
  // this, the fields themselves render the same either way.
  readonly autoCalc = input.required<boolean>();
  // Opt-in only: mode rapide's preview step turns this on to get the colored
  // box + animated subtitle; left false (the default) mode manuel keeps its
  // original plain styling, since only mode rapide asked for the highlight
  // treatment.
  readonly highlighted = input(false);
  // Only meaningful when highlighted() — mirrors
  // InvoiceCreatePreviewStepPage.hintState: 'pending' shows nothing yet (this
  // field hasn't had its turn), 'active' runs the typewriter and emits
  // subtitleTyped once done so the host page can start the next field,
  // 'done' shows the text statically (this field already had its turn).
  readonly subtitleState = input<'pending' | 'active' | 'done'>('pending');

  readonly requestedChange = output<boolean>();
  readonly percentageBasisPointsChange = output<number>();
  readonly amountEurosChange = output<number>();
  readonly resetAutoCalc = output<void>();
  readonly subtitleTyped = output<void>();

  protected readonly subtitleText =
    'Demandez une partie du prix payée à la commande — le solde restera dû à la livraison ou en fin de chantier.';

  protected readonly percentagePercent = computed(
    () => Math.round((this.percentageBasisPoints() / 100) * 100) / 100,
  );
  protected readonly amountEuros = computed(() => Math.round(this.amountCents()) / 100);

  protected onPercentageChange(event: Event): void {
    const percent = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(percent)) {
      return;
    }
    this.percentageBasisPointsChange.emit(Math.round(percent * 100));
  }

  protected onAmountChange(event: Event): void {
    const euros = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(euros)) {
      return;
    }
    this.amountEurosChange.emit(euros);
  }
}
