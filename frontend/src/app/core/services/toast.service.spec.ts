import { ToastService } from './toast.service';

describe('ToastService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('places errors at the center of the screen and confirmations at the bottom', () => {
    const service = new ToastService();
    service.error('Nom trop long');
    service.success('Enregistré');

    expect(service.toasts().map((toast) => toast.placement)).toEqual(['center', 'bottom']);
  });

  it('auto-dismisses after a few seconds', () => {
    const service = new ToastService();
    service.error('Nom trop long');

    vi.advanceTimersByTime(4000);
    expect(service.toasts()).toHaveLength(0);
  });

  it('does not stack the same message twice, and restarts its timer instead', () => {
    const service = new ToastService();
    service.error('Nom trop long');
    vi.advanceTimersByTime(3000);
    service.error('Nom trop long');

    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(service.toasts()).toHaveLength(0);
  });
});
