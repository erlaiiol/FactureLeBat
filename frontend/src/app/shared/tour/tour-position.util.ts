export interface TourRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TourSize {
  width: number;
  height: number;
}

export interface TourPoint {
  top: number;
  left: number;
}

const MARGIN = 12;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

// Pure positioning math for the tour popover, kept dependency-free so it's
// unit-testable without mounting any component (same spirit as
// backend/src/invoice/redistribution.util.ts). A null target (an anchor-less
// welcome/completion step) centers the popover in the viewport; otherwise it
// prefers placing the popover below the target, flipping above when there
// isn't room, and always clamps within the viewport.
export function computePopoverPosition(
  target: TourRect | null,
  popover: TourSize,
  viewport: TourSize,
): TourPoint {
  if (!target) {
    return {
      top: clamp((viewport.height - popover.height) / 2, MARGIN, viewport.height - MARGIN),
      left: clamp((viewport.width - popover.width) / 2, MARGIN, viewport.width - MARGIN),
    };
  }

  const spaceBelow = viewport.height - (target.top + target.height);
  const spaceAbove = target.top;
  const placeAbove = spaceBelow < popover.height + MARGIN && spaceAbove > spaceBelow;

  const top = placeAbove
    ? target.top - popover.height - MARGIN
    : target.top + target.height + MARGIN;

  const idealLeft = target.left + target.width / 2 - popover.width / 2;

  return {
    top: clamp(top, MARGIN, Math.max(MARGIN, viewport.height - popover.height - MARGIN)),
    left: clamp(idealLeft, MARGIN, Math.max(MARGIN, viewport.width - popover.width - MARGIN)),
  };
}

// For a step whose anchor is a small button that opens something much
// bigger right next to it (e.g. the lines-step "+" buttons opening a tall
// catalog flyout) — the anchor-relative math above only ever sees the
// button's own small rect, so it has no way to know the flyout exists and
// happily places the popover right on top of it, blocking the very clicks
// the step is asking for. Pinning to a fixed, anchor-independent corner
// (see TourStepDefinition.popoverPlacement) sidesteps that entirely: the
// spotlight still highlights the real anchor, only the text card moves.
export function computeCornerPosition(popover: TourSize, viewport: TourSize): TourPoint {
  return {
    top: clamp(viewport.height - popover.height - MARGIN, MARGIN, viewport.height - MARGIN),
    left: clamp(viewport.width - popover.width - MARGIN, MARGIN, viewport.width - MARGIN),
  };
}
