import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ClientInfoService } from './client-info.service';

export interface ClientLogEvent {
  kind: 'http_error' | 'session_check';
  method?: string;
  url?: string;
  status?: number;
  message?: string;
  requestId?: string;
  durationMs?: number;
  at: string;
}

export const CLIENT_LOGS_PATH = '/client-logs';
const STORAGE_KEY = 'fl.pendingClientLogs';
// Matches the backend DTO's ArrayMaxSize — older events are dropped first,
// the most recent failures are the ones worth seeing.
const MAX_BUFFERED = 20;
const FLUSH_DELAY_MS = 2_000;

// Reports failures the server could never log by itself (a request that
// never reached it, a session found dead on app resume) to
// POST /api/client-logs. Buffered + persisted to localStorage on purpose:
// the very failure being reported usually means the network is down right
// now, so events wait — surviving an app kill — and go out on the next
// successful opportunity (back online, app resumed, next launch). Never
// carries a request body or query string, only method/path/status.
@Injectable({ providedIn: 'root' })
export class ClientLogService {
  private readonly http = inject(HttpClient);
  private readonly clientInfo = inject(ClientInfoService);
  private readonly url = `${environment.apiBaseUrl}${CLIENT_LOGS_PATH}`;

  private buffer: ClientLogEvent[] = this.load();
  private flushing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  // Idempotent — App's constructor calls it once at boot.
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    window.addEventListener('online', () => this.scheduleFlush());
    this.scheduleFlush();
  }

  report(event: Omit<ClientLogEvent, 'at'>): void {
    this.buffer.push({ ...event, at: new Date().toISOString() });
    if (this.buffer.length > MAX_BUFFERED) {
      this.buffer = this.buffer.slice(-MAX_BUFFERED);
    }
    this.persist();
    this.scheduleFlush();
  }

  scheduleFlush(): void {
    if (this.flushTimer !== null) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  private flush(): void {
    if (this.flushing || this.buffer.length === 0) {
      return;
    }
    this.flushing = true;
    const batch = this.buffer.slice(0, MAX_BUFFERED);
    this.http
      .post<void>(this.url, {
        platform: this.clientInfo.platform,
        appVersion: this.clientInfo.appVersion,
        events: batch,
      })
      .subscribe({
        next: () => {
          this.flushing = false;
          this.buffer = this.buffer.filter((event) => !batch.includes(event));
          this.persist();
        },
        // Kept for the next attempt — still offline, or throttled.
        error: () => {
          this.flushing = false;
        },
      });
  }

  private load(): ClientLogEvent[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as ClientLogEvent[]).slice(-MAX_BUFFERED) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      if (this.buffer.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.buffer));
      }
    } catch {
      // Storage unavailable/full — the in-memory buffer still works.
    }
  }
}
