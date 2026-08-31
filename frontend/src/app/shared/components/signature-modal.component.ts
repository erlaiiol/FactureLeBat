import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InvoiceWithTotals } from '../../core/models/invoice.model';
import { InvoiceService } from '../../core/services/invoice.service';
import { BigButtonComponent } from './big-button.component';
import { FieldHintComponent } from './field-hint.component';
import { IconCloseComponent } from './icon-close.component';
import { ModalMorphComponent } from './modal-morph.component';

// The photo tab's client-side compression target (see onPhotoSelected) —
// keeps storage/PDF size predictable regardless of camera resolution, same
// reasoning as CompanyController.uploadLogo's MAX_LOGO_SIZE_BYTES but
// applied by resizing rather than rejecting.
const MAX_PHOTO_DIMENSION_PX = 1600;
const PHOTO_JPEG_QUALITY = 0.8;
// Client-side pre-check only, same "fail fast with a clear message, backend
// re-validates regardless" convention as CompanySettingsPage.onLogoFileSelected
// — bounds an obviously-wrong pick (a video, a huge RAW photo) before it's
// even decoded into a canvas.
const MAX_SOURCE_PHOTO_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

type SignatureTab = 'draw' | 'photo';

// Phase 1.1-1: "Signer" — opened from three places (the board's per-row
// actions menu, and both mode rapide's and mode manuel's post-creation
// success cards), same closable-modal shape as SendInvoiceEmailModalComponent
// (input `invoice`, output `closed`). Two tabs: a hand-built canvas
// signature pad ("Dessiner", no library — same "small owned UI primitive"
// precedent as Phase 8's tour engine) and a photo import ("Importer une
// photo") that downscales/recompresses client-side before upload.
@Component({
  selector: 'app-signature-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BigButtonComponent, FieldHintComponent, IconCloseComponent, ModalMorphComponent],
  templateUrl: './signature-modal.component.html',
})
export class SignatureModalComponent {
  private readonly invoiceService = inject(InvoiceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoice = input<InvoiceWithTotals | null>(null);
  readonly closed = output<void>();
  readonly signed = output<InvoiceWithTotals>();

  // See InvoicePreviewModalComponent's identical field for why: modalMorph
  // needs the panel's content to survive the close animation after
  // `invoice()` itself may already be null.
  protected readonly displayedInvoice = signal<InvoiceWithTotals | null>(null);

  constructor() {
    effect(() => {
      const current = this.invoice();
      if (current) {
        this.displayedInvoice.set(current);
      }
    });
  }

  protected readonly activeTab = signal<SignatureTab>('draw');
  protected readonly uploading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Drawing the pad's first stroke is what tells "empty" from "signed" —
  // the canvas starts blank (nothing to submit) rather than pre-filled.
  protected readonly hasDrawing = signal(false);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('padCanvas');
  private drawing = false;
  private lastPoint: { x: number; y: number } | null = null;

  protected setTab(tab: SignatureTab): void {
    this.activeTab.set(tab);
    this.errorMessage.set(null);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.invoice() && !this.uploading()) {
      this.closed.emit();
    }
  }

  // --- Dessiner ---------------------------------------------------------

  private canvasPoint(event: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef()!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  protected onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    this.drawing = true;
    this.lastPoint = this.canvasPoint(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.drawing) {
      return;
    }
    event.preventDefault();
    const canvas = this.canvasRef()!.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const point = this.canvasPoint(event);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastPoint!.x, this.lastPoint!.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    this.lastPoint = point;
    this.hasDrawing.set(true);
  }

  protected onPointerUp(): void {
    this.drawing = false;
    this.lastPoint = null;
  }

  protected clearDrawing(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return;
    }
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    this.hasDrawing.set(false);
  }

  protected submitDrawing(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.hasDrawing() || this.uploading()) {
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) {
        this.upload(blob, 'DRAWN');
      }
    }, 'image/png');
  }

  // --- Importer une photo ------------------------------------------------

  protected onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // lets the same file be re-picked after an error
    if (!file || this.uploading()) {
      return;
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      this.errorMessage.set('La photo doit être une image PNG ou JPEG.');
      return;
    }
    if (file.size > MAX_SOURCE_PHOTO_SIZE_BYTES) {
      this.errorMessage.set('Cette photo est trop volumineuse.');
      return;
    }

    this.errorMessage.set(null);
    this.uploading.set(true);
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      this.compressAndUpload(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      this.uploading.set(false);
      this.errorMessage.set('Impossible de lire cette photo.');
    };
    image.src = objectUrl;
  }

  // Downscales to MAX_PHOTO_DIMENSION_PX on the longest side and
  // re-compresses as JPEG — a phone camera photo's raw resolution has no
  // bearing on how legible a signature needs to be, so this keeps every
  // upload (and every future PDF render of it) a predictable size
  // regardless of the device.
  private compressAndUpload(image: HTMLImageElement): void {
    const scale = Math.min(1, MAX_PHOTO_DIMENSION_PX / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d')!;
    // A JPEG re-encode of a PNG with transparency would otherwise composite
    // onto black — a plain white backing matches what a photographed paper
    // signature already looks like.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          this.upload(blob, 'PHOTO');
        } else {
          this.uploading.set(false);
          this.errorMessage.set('Impossible de traiter cette photo.');
        }
      },
      'image/jpeg',
      PHOTO_JPEG_QUALITY,
    );
  }

  // --- Shared upload ------------------------------------------------------

  private upload(blob: Blob, method: 'DRAWN' | 'PHOTO'): void {
    const invoice = this.invoice();
    if (!invoice) {
      return;
    }
    this.uploading.set(true);
    this.errorMessage.set(null);
    this.invoiceService
      .uploadSignature(invoice.id, blob, method)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.uploading.set(false);
          this.clearDrawing();
          this.signed.emit(updated);
        },
        error: (error: HttpErrorResponse) => {
          this.uploading.set(false);
          this.errorMessage.set(
            typeof error.error?.message === 'string'
              ? error.error.message
              : "Impossible d'enregistrer la signature pour le moment.",
          );
        },
      });
  }
}
