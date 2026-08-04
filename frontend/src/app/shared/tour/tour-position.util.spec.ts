import { computeCornerPosition, computePopoverPosition } from './tour-position.util';

const VIEWPORT = { width: 1000, height: 800 };
const POPOVER = { width: 320, height: 200 };

describe('computePopoverPosition', () => {
  it('centers the popover when there is no target (welcome/completion steps)', () => {
    const position = computePopoverPosition(null, POPOVER, VIEWPORT);
    expect(position).toEqual({
      top: (VIEWPORT.height - POPOVER.height) / 2,
      left: (VIEWPORT.width - POPOVER.width) / 2,
    });
  });

  it('places the popover below the target when there is room', () => {
    const target = { top: 100, left: 400, width: 100, height: 40 };
    const position = computePopoverPosition(target, POPOVER, VIEWPORT);
    expect(position.top).toBe(target.top + target.height + 12);
  });

  it('flips above the target when there is no room below but there is above', () => {
    const target = { top: 700, left: 400, width: 100, height: 40 };
    const position = computePopoverPosition(target, POPOVER, VIEWPORT);
    expect(position.top).toBe(target.top - POPOVER.height - 12);
  });

  it('clamps horizontally so the popover never overflows the viewport edge', () => {
    const target = { top: 100, left: 10, width: 20, height: 20 };
    const position = computePopoverPosition(target, POPOVER, VIEWPORT);
    expect(position.left).toBeGreaterThanOrEqual(12);
  });

  it('clamps against the right edge for a target near the right side', () => {
    const target = { top: 100, left: 980, width: 20, height: 20 };
    const position = computePopoverPosition(target, POPOVER, VIEWPORT);
    expect(position.left).toBeLessThanOrEqual(VIEWPORT.width - POPOVER.width - 12);
  });

  it('falls back to the corner when a target too tall to clear covers the popover wherever clamping puts it', () => {
    // A target spanning almost the full viewport height (e.g. a flyout
    // panel) leaves no "above" or "below" placement with room to clear it —
    // clamping alone would land the popover right back on top of it, the
    // exact bug 'add-line'/'service-margin' in tour-definitions.ts hardcode
    // popoverPlacement: 'corner' to avoid.
    const target = { top: 20, left: 300, width: 320, height: 740 };
    const position = computePopoverPosition(target, POPOVER, VIEWPORT);
    expect(position).toEqual(computeCornerPosition(POPOVER, VIEWPORT));
  });
});

describe('computeCornerPosition', () => {
  it('pins the popover to the bottom-right corner, independent of any target', () => {
    const position = computeCornerPosition(POPOVER, VIEWPORT);
    expect(position).toEqual({
      top: VIEWPORT.height - POPOVER.height - 12,
      left: VIEWPORT.width - POPOVER.width - 12,
    });
  });

  it('never places the popover off-screen on a viewport smaller than the popover', () => {
    const tinyViewport = { width: 200, height: 150 };
    const position = computeCornerPosition(POPOVER, tinyViewport);
    expect(position.top).toBeGreaterThanOrEqual(0);
    expect(position.left).toBeGreaterThanOrEqual(0);
  });

  it('still pins bottom-right when a target is given but the default corner already clears it', () => {
    const target = { top: 20, left: 20, width: 100, height: 40 };
    const position = computeCornerPosition(POPOVER, VIEWPORT, target);
    expect(position).toEqual(computeCornerPosition(POPOVER, VIEWPORT));
  });

  it('picks a different corner when the target overlaps the default bottom-right one', () => {
    // A search input near the bottom of a short/keyboard-shrunk mobile
    // viewport — pinning the popover to its usual bottom-right corner would
    // cover the very input the step wants typed into (e.g.
    // 'catalog-search' in tour-definitions.ts), so it should hop to a
    // corner that actually clears it instead.
    const shortViewport = { width: 360, height: 320 };
    const target = { top: 250, left: 100, width: 100, height: 60 };
    const defaultCorner = computeCornerPosition(POPOVER, shortViewport);

    const position = computeCornerPosition(POPOVER, shortViewport, target);

    expect(position).not.toEqual(defaultCorner);
    expect(position.left).toBe(defaultCorner.left); // still right-aligned — only top needed to move
    expect(position.top).toBe(12); // hops to the top-right corner
  });

  it('falls back to the default bottom-right corner when every corner overlaps a near-full-viewport target', () => {
    const target = { top: 0, left: 0, width: VIEWPORT.width, height: VIEWPORT.height };
    const position = computeCornerPosition(POPOVER, VIEWPORT, target);
    expect(position).toEqual(computeCornerPosition(POPOVER, VIEWPORT));
  });
});
