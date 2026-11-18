import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'danger' | 'info';

// 'center': small blocking-feedback errors ("ce champ est trop long",
// "ajoutez un client"…) — pinned to the middle of the viewport so the
// artisan sees them wherever they are scrolled, even when the button they
// tapped sits at the bottom of a long form on a phone. 'bottom': the
// low-key "c'est enregistré" confirmations, out of the way.
export type ToastPlacement = 'center' | 'bottom';

export interface Toast {
  id: number;
  variant: ToastVariant;
  placement: ToastPlacement;
  message: string;
}

const AUTO_DISMISS_MS = 4000;

// Global "your click was taken into account" feedback — mounted once at the
// app root (app.html's <app-toast-container />), same singleton-service /
// singleton-overlay pattern as PaywallService+app-paywall-modal. Any
// component just injects this and calls success()/error(), no wiring per
// page.
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  success(message: string): void {
    this.show(message, 'success');
  }

  // Errors default to the center of the screen — see ToastPlacement.
  error(message: string): void {
    this.show(message, 'danger', 'center');
  }

  info(message: string, placement: ToastPlacement = 'bottom'): void {
    this.show(message, 'info', placement);
  }

  show(
    message: string,
    variant: ToastVariant = 'info',
    placement: ToastPlacement = 'bottom',
  ): void {
    // Re-tapping the same button must not stack identical toasts — restart
    // the visible one's timer instead, so the feedback stays on screen.
    const existing = this.toasts().find(
      (toast) =>
        toast.message === message && toast.variant === variant && toast.placement === placement,
    );
    if (existing) {
      this.scheduleDismiss(existing.id);
      return;
    }

    const id = this.nextId++;
    this.toasts.update((toasts) => [...toasts, { id, variant, placement, message }]);
    this.scheduleDismiss(id);
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
    this.clearTimer(id);
  }

  private scheduleDismiss(id: number): void {
    this.clearTimer(id);
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS),
    );
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
