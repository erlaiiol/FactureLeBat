import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
export type ButtonTone = 'solid' | 'subtle';

// One place for the roadmap's "big buttons, click more, type less" rule —
// every action button in the app should render through this component. Also
// the single implementation of Phase 9's semantic color tokens
// (docs/design-system.md) as a button: solid = filled, high-emphasis;
// subtle = tinted, lower-emphasis — same solid/subtle pairing as app-badge.
@Component({
  selector: 'app-big-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled()"
      class="w-full rounded-xl px-6 py-4 text-lg font-semibold shadow-sm transition
             duration-[120ms] active:scale-[0.97] active:duration-0
             disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
      [class]="variantClasses()"
    >
      <ng-content />
    </button>
  `,
})
export class BigButtonComponent {
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  readonly variant = input<ButtonVariant>('primary');
  readonly tone = input<ButtonTone>('solid');

  protected variantClasses(): string {
    return VARIANT_CLASSES[this.variant()][this.tone()];
  }
}

// Tailwind's scanner needs complete, literal class strings somewhere in the
// source — a template-literal like `bg-${variant}` would never be picked up
// and generated. This lookup is what keeps every combination a real,
// generated utility class.
const VARIANT_CLASSES: Record<ButtonVariant, Record<ButtonTone, string>> = {
  primary: {
    solid: 'bg-primary text-primary-fg hover:brightness-90',
    subtle:
      'bg-primary-subtle text-primary-subtle-fg border border-primary-subtle-border hover:brightness-95',
  },
  secondary: {
    solid: 'bg-secondary text-secondary-fg hover:brightness-90',
    subtle:
      'bg-secondary-subtle text-secondary-subtle-fg border border-secondary-subtle-border hover:brightness-95',
  },
  success: {
    solid: 'bg-success text-success-fg hover:brightness-90',
    subtle:
      'bg-success-subtle text-success-subtle-fg border border-success-subtle-border hover:brightness-95',
  },
  warning: {
    solid: 'bg-warning text-warning-fg hover:brightness-90',
    subtle:
      'bg-warning-subtle text-warning-subtle-fg border border-warning-subtle-border hover:brightness-95',
  },
  danger: {
    solid: 'bg-danger text-danger-fg hover:brightness-90',
    subtle:
      'bg-danger-subtle text-danger-subtle-fg border border-danger-subtle-border hover:brightness-95',
  },
  info: {
    solid: 'bg-info text-info-fg hover:brightness-90',
    subtle:
      'bg-info-subtle text-info-subtle-fg border border-info-subtle-border hover:brightness-95',
  },
};
