import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

// Phase 22: registers this device's FCM token with the backend once the
// artisan is authenticated, and unregisters it on logout. A no-op entirely
// on web (Capacitor.isNativePlatform() false) — this service only ever runs
// inside the iOS/Android app shell. Both platforms end up registering an
// FCM token (not a raw APNs token on iOS) via @capacitor-community/fcm,
// which is why the backend's PushDevice.token is always one shape — see
// backend/src/push-notification/push-sender.service.ts.
@Injectable({ providedIn: 'root' })
export class PushRegistrationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/push/devices`;
  private lastToken: string | null = null;

  async registerDevice(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') {
        return;
      }
      await PushNotifications.register();
      const { token } = await FCM.getToken();
      this.lastToken = token;
      const platform = Capacitor.getPlatform() === 'ios' ? 'IOS' : 'ANDROID';
      await firstValueFrom(this.http.post(this.baseUrl, { platform, token }));
    } catch {
      // Best-effort: a device that never registers just never gets the
      // daily reminder digest — never blocks the rest of the app.
    }
  }

  async unregisterDevice(): Promise<void> {
    if (!this.lastToken) {
      return;
    }
    const token = this.lastToken;
    this.lastToken = null;
    try {
      await firstValueFrom(this.http.delete(this.baseUrl, { body: { token } }));
    } catch {
      // Best-effort — a stale token left registered after logout just means
      // a future artisan on this device gets one extra no-op digest push
      // until they log in and re-register their own.
    }
  }
}
