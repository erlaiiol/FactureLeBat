import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { ServiceProfile } from '../../core/models/service.model';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { BadgeComponent } from '../../shared/components/badge.component';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import { CentsToEurosPipe } from '../../shared/pipes/cents-to-euros.pipe';
import { TourAnchorDirective } from '../../shared/tour/tour-anchor.directive';

@Component({
  selector: 'app-service-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BigButtonComponent,
    BadgeComponent,
    CentsToEurosPipe,
    TourAnchorDirective,
  ],
  templateUrl: './service-list.page.html',
})
export class ServiceListPage {
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly services = signal<ServiceProfile[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly search = this.fb.nonNullable.control('');

  constructor() {
    this.search.valueChanges
      .pipe(
        startWith(''),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => this.serviceCatalogService.getAll(term || undefined)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (services) => {
          this.services.set(services);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Impossible de charger vos prestations. Veuillez réessayer.');
        },
      });
  }
}
