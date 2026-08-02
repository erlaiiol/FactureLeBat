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
import * as pdfjsLib from 'pdfjs-dist';

// Unlike Vite/webpack 5, Angular's esbuild-based `application` builder does
// NOT resolve `new URL('pdfjs-dist/...', import.meta.url)` into a copied,
// hashed asset — it's silently left as a bare specifier and 404s at
// runtime. Served from a fixed root-relative path instead, copied there by
// an explicit `assets` entry in angular.json (pdf.worker.min.mjs -> /).
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// The Safari/iOS fallback for PdfPreviewModalComponent/
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
  // on to a different PDF (or is gone).
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

    try {
      // Reads the already-fetched blob back out of memory — no network
      // round-trip, just handing pdf.js the same bytes the iframe path
      // would otherwise have pointed its `src` at.
      const bytes = await fetch(url).then((response) => response.arrayBuffer());
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
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
        const unscaledWidth = page.getViewport({ scale: 1 }).width;
        const scale = (container.clientWidth / unscaledWidth) * (window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
        canvas.className = 'max-w-full rounded-lg bg-surface shadow-sm';
        container.appendChild(canvas);

        await page.render({ canvas, viewport }).promise;
      }
    } catch {
      if (token === this.renderToken) {
        this.error.set("Impossible d'afficher l'aperçu du PDF.");
      }
    }
  }
}
