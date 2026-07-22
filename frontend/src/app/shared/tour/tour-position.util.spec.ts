import { computePopoverPosition } from './tour-position.util';

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
});
