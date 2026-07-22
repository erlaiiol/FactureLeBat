import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Phase 7 "Guided Data Entry": a short, plain-language explanation shown
// persistently under a form field — never a hover-triggered tooltip, since
// the app targets artisans on a job site (tablets/gloves, no reliable
// hover state). One place for the styling so every field's hint looks and
// reads the same across every data-entry form in the app.
@Component({
  selector: 'app-field-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="text-xs text-slate-500">{{ text() }}</p>`,
})
export class FieldHintComponent {
  readonly text = input.required<string>();
}
