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
