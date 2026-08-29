import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SimplifiedDisplayLevel } from '../../../core/models/invoice.model';

// Phase 1.2-4: the 3-position "Mode simplifié" replacement — NONE (full
// detail) / SIMPLIFIED (description + line total only, the original
// boolean's true) / GENERIC (collapses to one "Prestation" row carrying the
// document's subtotal, see PdfService.buildLinesTable). Only the title
// above the track changes with position; the caller's own explanatory
// subtitle underneath stays fixed regardless of level (decided with the
// user: the slider communicates *which* level you're on, the subtitle
// explains the concept once, generically).
const LEVELS: SimplifiedDisplayLevel[] = ['NONE', 'SIMPLIFIED', 'GENERIC'];

const TITLES: Record<SimplifiedDisplayLevel, string> = {
  NONE: 'Affichage complet',
  SIMPLIFIED: 'Mode simplifié',
  GENERIC: 'Affichage minimal',
};

@Component({
  selector: 'app-simplified-display-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <span class="font-medium text-ink">{{ title() }}</span>
      <input
        type="range"
        min="0"
        max="2"
        step="1"
        [value]="index()"
        (input)="onInput($event)"
        class="accent-primary h-1.5 w-full cursor-pointer"
      />
      <div class="flex justify-between text-[10px] text-info-subtle-fg">
        <span>Complet</span>
        <span>Simplifié</span>
        <span>Minimal</span>
      </div>
    </div>
  `,
})
export class SimplifiedDisplaySliderComponent {
  readonly level = input.required<SimplifiedDisplayLevel>();
  readonly levelChange = output<SimplifiedDisplayLevel>();

  protected readonly index = computed(() => LEVELS.indexOf(this.level()));
  protected readonly title = computed(() => TITLES[this.level()]);

  protected onInput(event: Event): void {
    const index = Number((event.target as HTMLInputElement).value);
    this.levelChange.emit(LEVELS[index]);
  }
}
