import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ButtonTone, ButtonVariant } from './big-button.component';

// The other half of Phase 9's semantic color tokens (docs/design-system.md),
// alongside app-big-button: a straight rectangle, small radius, no
// rotation — the tilted "stamped" look is reserved for app-line-badge
// (Phase 5's redistribution marker) specifically, so the two motifs never
// mix.
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
      [class]="variantClasses()"
    >
      <ng-content />
    </span>
  `,
})
export class BadgeComponent {
  readonly variant = input<ButtonVariant>('info');
  readonly tone = input<ButtonTone>('subtle');

  protected variantClasses(): string {
    return BADGE_VARIANT_CLASSES[this.variant()][this.tone()];
  }
}

// Same "literal strings only" reasoning as app-big-button's lookup —
// Tailwind can't generate a class from a template-literal interpolation.
const BADGE_VARIANT_CLASSES: Record<ButtonVariant, Record<ButtonTone, string>> = {
  primary: {
    solid: 'bg-primary text-primary-fg',
    subtle: 'bg-primary-subtle text-primary-subtle-fg border border-primary-subtle-border',
  },
  secondary: {
    solid: 'bg-secondary text-secondary-fg',
    subtle: 'bg-secondary-subtle text-secondary-subtle-fg border border-secondary-subtle-border',
  },
  success: {
    solid: 'bg-success text-success-fg',
    subtle: 'bg-success-subtle text-success-subtle-fg border border-success-subtle-border',
  },
  warning: {
    solid: 'bg-warning text-warning-fg',
    subtle: 'bg-warning-subtle text-warning-subtle-fg border border-warning-subtle-border',
  },
  danger: {
    solid: 'bg-danger text-danger-fg',
    subtle: 'bg-danger-subtle text-danger-subtle-fg border border-danger-subtle-border',
  },
  info: {
    solid: 'bg-info text-info-fg',
    subtle: 'bg-info-subtle text-info-subtle-fg border border-info-subtle-border',
  },
};
