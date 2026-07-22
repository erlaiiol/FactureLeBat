import { ChangeDetectionStrategy, Component } from '@angular/core';

// Phase 5's "Réparti sur les lignes" marker, styled per docs/design-system.md
// as job-site marking spray paint rather than a soft SaaS pill: fluorescent
// chartreuse, near-black text, small radius (not a pill), a thin darker-tint
// border, an offset shadow, and a slight rotation. Deliberately its own
// component, distinct from app-badge's semantic (straight, unrotated)
// badges — mixing the two motifs would dilute what makes this one
// recognizable as a physically-stamped tag.
@Component({
  selector: 'app-line-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="anim-badge-stamp bg-badge-bg text-badge-ink border-badge-edge inline-flex -rotate-[1.5deg]
             items-center rounded-[2px] border px-2 py-0.5 text-xs font-bold tracking-wide uppercase
             shadow-[1px_1px_0_0_var(--color-badge-edge)]"
    >
      <ng-content />
    </span>
  `,
})
export class LineBadgeComponent {}
