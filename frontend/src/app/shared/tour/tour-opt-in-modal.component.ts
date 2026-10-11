import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ModalMorphComponent } from '../components/modal-morph.component';
import { TourService } from './tour.service';

// The sign-up "Activer les tutoriels ?" prompt — the very first thing a
// brand-new account is asked, right before the first guided tour would
// auto-launch (see TourService.optInPromptVisible). Mounted once at the app
// root next to TourOverlayComponent, same "one shared overlay" pattern.
// Same "Atelier sobre" identity as the tour popover it introduces. A
// backdrop click deliberately does nothing: this is a two-answer question,
// and silently picking one for the artisan is exactly what it exists to avoid.
@Component({
  selector: 'app-tour-opt-in-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalMorphComponent],
  template: `
    <app-modal-morph
      [open]="tourService.optInPromptVisible()"
      ariaLabel="Activer les tutoriels"
      panelClass="bg-atelier-surface text-atelier-ink font-atelier-sans flex w-full max-w-sm flex-col gap-4 rounded-2xl p-6 shadow-2xl"
    >
      <div class="flex flex-col gap-1">
        <h2 class="font-atelier-heading text-lg font-semibold">Activer les tutoriels ?</h2>
        <p class="text-atelier-ink-soft text-sm">
          De courtes visites guidées vous montrent chaque écran la première fois que vous l'ouvrez,
          à commencer par votre première facture. Vous pourrez changer d'avis à tout moment dans «
          Mon entreprise ».
        </p>
      </div>
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="text-atelier-ink-soft rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--color-atelier-bg)]"
          (click)="tourService.answerOptInPrompt(false)"
        >
          Non
        </button>
        <button
          type="button"
          class="rounded-lg bg-[var(--color-atelier-walnut)] px-4 py-2 text-sm font-semibold text-[var(--color-atelier-surface)] transition hover:brightness-90"
          (click)="tourService.answerOptInPrompt(true)"
        >
          Oui
        </button>
      </div>
    </app-modal-morph>
  `,
})
export class TourOptInModalComponent {
  protected readonly tourService = inject(TourService);
}
