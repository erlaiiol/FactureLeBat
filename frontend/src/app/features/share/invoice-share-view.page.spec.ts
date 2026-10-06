import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Route, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { throwError } from 'rxjs';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { authRefreshInterceptor } from '../../core/interceptors/auth-refresh.interceptor';
import { AuthService } from '../../core/services/auth.service';
import { BigButtonComponent } from '../../shared/components/big-button.component';
import type { InvoiceShareViewPage as InvoiceShareViewPageType } from './invoice-share-view.page';

// A share link (/partage/:token) is sent to people with no FactureLe
// account at all — by SMS, WhatsApp, email — and opened in whatever browser
// their phone picks (iOS Safari, Android Chrome; the apps' universal/app
// links deliberately don't claim /partage). These specs pin everything on
// the frontend side that must hold for such a visitor; the backend half
// (the @Public() PDF route itself) is covered by
// backend/test/invoice-share-link.e2e-spec.ts.

@Component({ selector: 'app-pdf-canvas-viewer', template: '' })
class StubPdfViewerComponent {
  readonly blobUrl = input<string>();
}

@Component({ selector: 'app-blank-test', template: '' })
class BlankTestComponent {}

async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('Share link landing page (/partage/:token)', () => {
  it('is registered without any auth guard, at any level of the route tree', () => {
    const findChain = (list: Route[], parents: Route[] = []): Route[] | null => {
      for (const route of list) {
        const chain = [...parents, route];
        if (route.path === 'partage/:token') {
          return chain;
        }
        const nested = route.children ? findChain(route.children, chain) : null;
        if (nested) {
          return nested;
        }
      }
      return null;
    };

    const chain = findChain(routes);
    expect(chain).not.toBeNull();
    for (const route of chain!) {
      expect(route.canActivate ?? []).toHaveLength(0);
      expect(route.canActivateChild ?? []).toHaveLength(0);
      expect(route.canMatch ?? []).toHaveLength(0);
    }
  });

  describe('InvoiceShareViewPage', () => {
    let http: HttpTestingController;
    let harness: RouterTestingHarness;
    let InvoiceShareViewPage: typeof InvoiceShareViewPageType;

    // Loaded dynamically, after stubbing DOMMatrix: the page statically
    // imports PdfCanvasViewerComponent → pdfjs-dist, which reads DOMMatrix
    // at module load and jsdom doesn't provide it. The viewer itself is
    // swapped for a stub below, so pdf.js never actually renders here.
    beforeAll(async () => {
      (globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
      ({ InvoiceShareViewPage } = await import('./invoice-share-view.page'));
    });

    beforeEach(async () => {
      URL.createObjectURL = vi.fn(() => 'blob:shared-pdf');
      URL.revokeObjectURL = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([{ path: 'partage/:token', component: InvoiceShareViewPage }]),
        ],
      });
      TestBed.overrideComponent(InvoiceShareViewPage, {
        set: { imports: [StubPdfViewerComponent, BigButtonComponent] },
      });
      http = TestBed.inject(HttpTestingController);
      harness = await RouterTestingHarness.create();
    });

    afterEach(() => http.verify());

    it('fetches the PDF from the public, token-keyed route and shows it', async () => {
      await harness.navigateByUrl('/partage/tok-123');
      http
        .expectOne(`${environment.apiBaseUrl}/invoices/share/tok-123/pdf`)
        .flush(new Blob(['%PDF-1.3'], { type: 'application/pdf' }));
      await flushAsync();
      harness.detectChanges();

      const viewer = harness.routeDebugElement!.query(
        (el) => el.componentInstance instanceof StubPdfViewerComponent,
      );
      expect(viewer).not.toBeNull();
      expect((viewer.componentInstance as StubPdfViewerComponent).blobUrl()).toBe(
        'blob:shared-pdf',
      );
    });

    it('offers a download link to the same public route, usable without an account', async () => {
      await harness.navigateByUrl('/partage/tok-123');
      http
        .expectOne(`${environment.apiBaseUrl}/invoices/share/tok-123/pdf`)
        .flush(new Blob(['%PDF-1.3'], { type: 'application/pdf' }));
      await flushAsync();
      harness.detectChanges();

      const link = (harness.routeNativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
        'a[download]',
      );
      expect(link).not.toBeNull();
      expect(link!.href).toBe(`${environment.apiBaseUrl}/invoices/share/tok-123/pdf`);
      expect(link!.textContent).toContain('Télécharger le PDF');
    });

    it('shows no download link for a revoked or unknown link', async () => {
      await harness.navigateByUrl('/partage/revoked');
      http
        .expectOne(`${environment.apiBaseUrl}/invoices/share/revoked/pdf`)
        .flush(new Blob(), { status: 404, statusText: 'Not Found' });
      await flushAsync();
      harness.detectChanges();

      expect((harness.routeNativeElement as HTMLElement).querySelector('a[download]')).toBeNull();
    });

    it('explains a revoked or unknown link instead of leaving the visitor stuck', async () => {
      await harness.navigateByUrl('/partage/revoked');
      http
        .expectOne(`${environment.apiBaseUrl}/invoices/share/revoked/pdf`)
        .flush(new Blob(), { status: 404, statusText: 'Not Found' });
      await flushAsync();
      harness.detectChanges();

      expect(harness.routeNativeElement!.textContent).toContain("Ce lien n'est plus valide.");
    });
  });

  describe('for a visitor with no session', () => {
    it('never bounces them to /connexion when a background call 401s', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([authRefreshInterceptor])),
          provideHttpClientTesting(),
          provideRouter([
            { path: 'partage/:token', component: BlankTestComponent },
            { path: 'connexion', component: BlankTestComponent },
          ]),
          {
            provide: AuthService,
            useValue: {
              currentUser: signal(null),
              refreshSession: () => throwError(() => new Error('no session')),
            },
          },
        ],
      });
      const router = TestBed.inject(Router);
      const http = TestBed.inject(HttpTestingController);
      await router.navigateByUrl('/partage/tok-123');
      const navigate = vi.spyOn(router, 'navigate');

      // e.g. the app shell's own /auth/me check on boot.
      TestBed.inject(HttpClient)
        .get(`${environment.apiBaseUrl}/auth/me`)
        .subscribe({ error: () => undefined });
      http
        .expectOne(`${environment.apiBaseUrl}/auth/me`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      await flushAsync();

      expect(navigate).not.toHaveBeenCalledWith(['/connexion']);
      expect(router.url).toBe('/partage/tok-123');
      http.verify();
    });
  });
});
