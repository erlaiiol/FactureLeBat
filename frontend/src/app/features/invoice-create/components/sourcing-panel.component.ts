import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  ComplementarySuggestion,
  SourcingSearchResult,
  SupplierCandidate,
} from '../../../core/models/sourcing.model';
import { Unit } from '../../../core/models/unit.model';
import { SourcingService } from '../../../core/services/sourcing.service';
import { BadgeComponent } from '../../../shared/components/badge.component';
import { BigButtonComponent } from '../../../shared/components/big-button.component';

interface ExtraSearchState {
  loading: boolean;
  errorMessage: string | null;
  result: SourcingSearchResult<SupplierCandidate> | null;
}

// Phase 10 — "Trouver des fournisseurs": a self-contained trigger + results
// panel, embedded directly on an invoice line (see InvoiceLineFormComponent).
// Deliberately closed/idle until clicked (no search happens just because a
// line exists) and deliberately never writes back into the line's form —
// every result here is informational only, the artisan copies what's useful
// by hand (see docs/roadmap.md Phase 10: "never auto-added to the invoice").
@Component({
  selector: 'app-sourcing-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, BadgeComponent, BigButtonComponent],
  templateUrl: './sourcing-panel.component.html',
})
export class SourcingPanelComponent {
  private readonly sourcingService = inject(SourcingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly productName = input.required<string>();
  readonly quantity = input.required<number>();
  readonly unit = input.required<Unit>();
  readonly customerLocation = input<string | null>(null);

  protected readonly open = signal(false);
  protected readonly jobDate = signal('');

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly result = signal<SourcingSearchResult<SupplierCandidate> | null>(null);

  protected readonly suggestionsLoading = signal(false);
  protected readonly suggestionsErrorMessage = signal<string | null>(null);
  protected readonly suggestionsResult =
    signal<SourcingSearchResult<ComplementarySuggestion> | null>(null);

  // Keyed by suggestion name — each "Rechercher aussi" fans out into its own
  // independent little result panel, never a recursive re-mount of this same
  // component (kept simple on purpose: one level of fan-out, matching the
  // roadmap's "search again" wording, not open-ended nesting).
  protected readonly extraSearches = signal<Record<string, ExtraSearchState>>({});

  protected toggleOpen(): void {
    const nextOpen = !this.open();
    this.open.set(nextOpen);
    if (nextOpen && !this.result() && !this.loading()) {
      this.search();
    }
  }

  protected search(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);

    this.sourcingService
      .searchSuppliers({
        productName: this.productName(),
        quantity: this.quantity(),
        unit: this.unit(),
        customerLocation: this.customerLocation() || undefined,
        jobDate: this.jobDate() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.loading.set(false);
          this.result.set(result);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.friendlyErrorMessage(error));
        },
      });
  }

  protected loadSuggestions(): void {
    if (this.suggestionsLoading() || this.suggestionsResult()) {
      return;
    }
    this.suggestionsLoading.set(true);
    this.suggestionsErrorMessage.set(null);

    this.sourcingService
      .suggestComplementary({ productName: this.productName(), unit: this.unit() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.suggestionsLoading.set(false);
          this.suggestionsResult.set(result);
        },
        error: (error: unknown) => {
          this.suggestionsLoading.set(false);
          this.suggestionsErrorMessage.set(this.friendlyErrorMessage(error));
        },
      });
  }

  protected searchForSuggestion(name: string): void {
    const current = this.extraSearches()[name];
    if (current?.loading || current?.result) {
      return;
    }
    this.extraSearches.update((state) => ({
      ...state,
      [name]: { loading: true, errorMessage: null, result: null },
    }));

    // The complementary item's real quantity/unit are unknown at this point
    // (it isn't a line on the invoice) — UNIT/1 is a deliberately neutral
    // placeholder so the query still reads naturally regardless of what kind
    // of material was suggested.
    this.sourcingService
      .searchSuppliers({
        productName: name,
        quantity: 1,
        unit: 'UNIT',
        customerLocation: this.customerLocation() || undefined,
        jobDate: this.jobDate() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.extraSearches.update((state) => ({
            ...state,
            [name]: { loading: false, errorMessage: null, result },
          }));
        },
        error: (error: unknown) => {
          this.extraSearches.update((state) => ({
            ...state,
            [name]: {
              loading: false,
              errorMessage: this.friendlyErrorMessage(error),
              result: null,
            },
          }));
        },
      });
  }

  protected extraSearchFor(name: string): ExtraSearchState | undefined {
    return this.extraSearches()[name];
  }

  private friendlyErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 429) {
        return 'Quota quotidien de recherches fournisseurs atteint — réessayez demain.';
      }
      if (error.status === 503) {
        return "L'assistant fournisseurs n'est pas configuré pour le moment.";
      }
    }
    return 'La recherche a échoué. Vous pouvez réessayer dans quelques instants.';
  }
}
