import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
// Side-effect only, must run before pdfjs-dist's own code ever executes —
// see that file's comment for why.
import '../utils/map-upsert-polyfill';
import * as pdfjsLib from 'pdfjs-dist';

// Unlike Vite/webpack 5, Angular's esbuild-based `application` builder does
// NOT resolve `new URL('pdfjs-dist/...', import.meta.url)` into a copied,
// hashed asset — it's silently left as a bare specifier and 404s at
// runtime. Served from a fixed root-relative path instead, copied there by
// an explicit `assets` entry in angular.json (pdf.worker.min.mjs -> /).
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Real iOS Safari has been observed hanging indefinitely partway through
// pdf.js's worker handshake (module Worker spawns and its script itself
// loads fine — confirmed 200 in the device's own network log — but the
// "ready"/"test" postMessage round-trip that PDFWorker#initialize waits on
// never completes). No error event fires, so pdf.js's own fake-worker
// fallback never kicks in, and the await below just never resolves. Not
// reproduced via Safari's own remote Web Inspector against a desktop
// machine, only on the physical device, and invisible in the console
// either way. This timeout turns that silent, permanent hang into a
// visible error + download fallback instead of leaving the artisan stuck
// on a blank modal forever.
const RENDER_TIMEOUT_MS = 10_000;

// createMainThreadWorker below sidesteps that whole cross-thread handshake
// rather than just timing it out. pdf.js has always shipped a second,
// thread-free way to run itself: if constructing a real `Worker` throws or
// errors, PDFWorker#initialize catches that and falls back to
// dynamic-`import()`-ing the exact same worker script into the main thread
// instead, wiring it up through an in-memory LoopbackPort rather than
// postMessage. That fallback has no
// cross-thread handshake to hang on — but pdf.js only reaches for it
// reactively, when the real Worker visibly fails, and the real Worker here
// doesn't fail: it just never finishes saying "ready" (see RENDER_TIMEOUT_MS's
// comment). There's no public flag left to request the fallback directly
// (`PDFJS.disableWorker` was removed years ago), so this reproduces the one
// condition PDFWorker does check for synchronously — `new Worker(...)`
// throwing — by making the `Worker` constructor itself unavailable for the
// single synchronous tick its own constructor runs in. `workerSrc` is left
// untouched throughout, since the fallback's `import()` still needs it.
// This component is only ever mounted for the WebKit/Capacitor population
// needsCanvasPdfViewer already flagged as unreliable (see that util's own
// comment) — the plain `<iframe>` path used everywhere else never runs this,
// so forcing main-thread parsing here costs nothing for the browsers where
// the real worker is known to work.
async function createMainThreadWorker(): Promise<pdfjsLib.PDFWorker> {
  const RealWorker = window.Worker;
  // @ts-expect-error -- deliberately undefined; see the comment above.
  window.Worker = undefined;
  try {
    const worker = new pdfjsLib.PDFWorker();
    await worker.promise;
    return worker;
  } finally {
    window.Worker = RealWorker;
  }
}

// The Safari/iOS/Capacitor-native fallback for PdfPreviewModalComponent/
// InvoicePreviewModalComponent's native `<iframe src="blob:...">` — see
// needsCanvasPdfViewer's own comment for why. Decodes the exact same PDF
// bytes PdfService generated and paints each page onto its own <canvas>,
// entirely independent of the browser's native (here, unreliable) PDF
// viewer. Pages stack vertically in a scrollable container — invoices are
// almost always one page, but a long manual/many-line one can spill onto a
// second.
@Component({
  selector: 'app-pdf-canvas-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #container
      class="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-auto bg-secondary-subtle p-4"
    >
      @if (error(); as message) {
        <p class="text-sm font-medium text-danger">{{ message }}</p>
        <a
          [href]="blobUrl()"
          download="apercu-facture.pdf"
          class="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-secondary-subtle"
        >
          Télécharger le PDF
        </a>
      }
    </div>
  `,
})
export class PdfCanvasViewerComponent {
  readonly blobUrl = input.required<string>();

  private readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('container');
  protected readonly error = signal<string | null>(null);

  // Bumped on every new render pass (including this component's own
  // destruction) — an in-flight page loop checks it after each `await` and
  // bails out rather than keep painting into a container that's since moved
  // on to a different PDF (or is gone). Also what lets a stale timeout (set
  // by a render call that's since been superseded) recognize it's obsolete.
  private renderToken = 0;

  constructor() {
    effect(() => {
      const url = this.blobUrl();
      void this.render(url);
    });
    inject(DestroyRef).onDestroy(() => {
      this.renderToken++;
    });
  }

  private async render(url: string): Promise<void> {
    const token = ++this.renderToken;
    this.error.set(null);
    const container = this.containerRef().nativeElement;
    container.replaceChildren();

    const timeoutId = setTimeout(() => {
      if (token === this.renderToken) {
        console.error('PdfCanvasViewerComponent: render timed out after', RENDER_TIMEOUT_MS, 'ms');
        this.error.set("L'aperçu met trop de temps à s'afficher.");
      }
    }, RENDER_TIMEOUT_MS);

    let worker: pdfjsLib.PDFWorker | undefined;
    try {
      // Reads the already-fetched blob back out of memory — no network
      // round-trip, just handing pdf.js the same bytes the iframe path
      // would otherwise have pointed its `src` at.
      const [bytes, mainThreadWorker] = await Promise.all([
        fetch(url).then((response) => response.arrayBuffer()),
        createMainThreadWorker(),
      ]);
      worker = mainThreadWorker;
      if (token !== this.renderToken) {
        return;
      }
      const doc = await pdfjsLib.getDocument({ data: bytes, worker }).promise;
      if (token !== this.renderToken) {
        return;
      }

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        if (token !== this.renderToken) {
          return;
        }

        // Backing store sized for the container's actual CSS width times
        // devicePixelRatio, then scaled back down via CSS width — otherwise
        // a Retina screen renders visibly blurrier text than the native
        // iframe viewer this replaces.
        // Falls back to native size (scale factor 1) if the container
        // somehow measures zero-width mid-transition — better an
        // oddly-sized page than a 0×0 canvas rendering successfully into
        // total invisibility with nothing to show it failed.
        const unscaledWidth = page.getViewport({ scale: 1 }).width;
        const scale = (container.clientWidth / unscaledWidth) * (window.devicePixelRatio || 1) || 1;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
        canvas.className = 'max-w-full rounded-lg bg-surface shadow-sm';
        container.appendChild(canvas);

        await page.render({ canvas, viewport }).promise;
      }
      // A render that was merely slow (not actually hung) can finish after
      // the timeout above already put up the error/download fallback —
      // clear it now that the real pages are in the DOM underneath it.
      if (token === this.renderToken) {
        this.error.set(null);
      }
    } catch (reason) {
      if (token === this.renderToken) {
        console.error('PdfCanvasViewerComponent: render failed', reason);
        this.error.set("Impossible d'afficher l'aperçu du PDF.");
      }
    } finally {
      clearTimeout(timeoutId);
      worker?.destroy();
    }
  }
}
