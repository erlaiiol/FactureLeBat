import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { APP_STORE_URL, PLAY_STORE_URL } from '../../core/app-store-links';
import { PlatformService } from '../../core/services/platform.service';
import { MobileAppBannerComponent } from './mobile-app-banner.component';

const android =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const safari =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const chromeIos = safari.replace('Version/18.0', 'CriOS/130.0');

function setup(userAgent: string, native = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  TestBed.configureTestingModule({
    imports: [MobileAppBannerComponent],
    providers: [{ provide: PlatformService, useValue: { isNativeApp: signal(native) } }],
  });
  const fixture = TestBed.createComponent(MobileAppBannerComponent);
  fixture.detectChanges();
  return fixture;
}

describe('MobileAppBannerComponent', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('offers Google Play as a regular fallback link on Android', () => {
    const fixture = setup(android);
    expect(fixture.nativeElement.querySelector('a').href).toBe(PLAY_STORE_URL);
    expect(fixture.nativeElement.querySelector('a').textContent).toContain('Ouvrir');
  });

  it('offers the App Store in other iOS browsers', () => {
    const fixture = setup(chromeIos);
    expect(fixture.nativeElement.querySelector('a').href).toBe(APP_STORE_URL);
  });

  it.each([
    ['desktop', 'Mozilla/5.0 Chrome/130.0', false],
    ['Safari native banner', safari, false],
    ['Android app', android, true],
    ['iOS app', chromeIos, true],
  ])('does not show a custom banner in %s', (_name, userAgent, native) => {
    const fixture = setup(userAgent, native);
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
  });

  it('remembers dismissal when the component is recreated in the same session', () => {
    const fixture = setup(android);
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
    fixture.destroy();
    const next = TestBed.createComponent(MobileAppBannerComponent);
    next.detectChanges();
    expect(next.nativeElement.querySelector('aside')).toBeNull();
  });

  it('still displays and closes when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const fixture = setup(android);
    expect(fixture.nativeElement.querySelector('aside')).not.toBeNull();
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
  });
});
