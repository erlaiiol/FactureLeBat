import { bootstrapApplication } from '@angular/platform-browser';
import { Capacitor } from '@capacitor/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Native shells only (iOS WKWebView / Android WebView): lock the page scale.
// Without it an accidental double-tap — or iOS's auto-zoom on focusing an
// input under 16px (many text-sm fields) — zooms the app in, and inside a
// WebView there's no browser chrome to reset it, so it stayed stuck zoomed
// with fields pushed off the right edge. The plain web build keeps pinch-zoom
// (accessibility); styles.css's touch-action only removes double-tap zoom.
if (Capacitor.isNativePlatform()) {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      'content',
      'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    );
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
