import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// One place for the roadmap's "big buttons, click more, type less" rule —
// every action button in the app should render through this component.
@Component({
  selector: 'app-big-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled()"
      class="w-full rounded-xl px-6 py-4 text-lg font-semibold shadow-sm transition
             disabled:cursor-not-allowed disabled:opacity-50"
      [class]="variantClasses()"
    >
      <ng-content />
    </button>
  `,
})
export class BigButtonComponent {
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  readonly variant = input<'primary' | 'secondary' | 'danger'>('primary');

  protected variantClasses(): string {
    switch (this.variant()) {
      case 'secondary':
        return 'bg-slate-100 text-slate-900 hover:bg-slate-200';
      case 'danger':
        return 'bg-red-600 text-white hover:bg-red-700';
      default:
        return 'bg-blue-600 text-white hover:bg-blue-700';
    }
  }
}
