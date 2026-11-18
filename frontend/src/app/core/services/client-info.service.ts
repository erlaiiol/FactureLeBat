import { Injectable } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export type ClientPlatform = 'ios' | 'android' | 'web';

// Which shell + which build is talking to the API — attached to every API
// call (clientInfoInterceptor) and every client-log report, so a support
// question like "the preview doesn't load for this one artisan" can be
// answered with "they're on iOS 1.2, everyone else on 1.3" straight from the
// server logs. The version is only knowable asynchronously on native
// (App.getInfo), so the first few boot requests may go out without it.
@Injectable({ providedIn: 'root' })
export class ClientInfoService {
  readonly platform = Capacitor.getPlatform() as ClientPlatform;
  private appVersionValue: string | undefined;

  constructor() {
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.getInfo()
        .then((info) => {
          this.appVersionValue = `${info.version} (${info.build})`;
        })
        .catch(() => undefined);
    }
  }

  get appVersion(): string | undefined {
    return this.appVersionValue;
  }
}
