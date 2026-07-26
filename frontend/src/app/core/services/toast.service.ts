import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'danger' | 'info';

export interface Toast {
  id: number;
  variant: ToastVariant;
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

  error(message: string): void {
    this.show(message, 'danger');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  show(message: string, variant: ToastVariant = 'info'): void {
    const id = this.nextId++;
    this.toasts.update((toasts) => [...toasts, { id, variant, message }]);
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS),
    );
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
