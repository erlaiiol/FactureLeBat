import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { TimeoutError } from 'rxjs';
import { VoiceInvoiceDraftService } from '../../../core/services/voice-invoice-draft.service';
import { BigButtonComponent } from '../../../shared/components/big-button.component';
import { IconMicrophoneComponent } from '../../../shared/components/icon-microphone.component';
import { isSpeechRecognitionSupported } from '../../../shared/utils/speech-recognition-support.util';
import {
  getSpeechRecognitionCtor,
  SpeechRecognition,
} from '../../../shared/utils/speech-recognition.types';
import { InvoiceDraftStore } from '../invoice-draft.store';
import { NativeSpeechCaptureService } from './native-speech-capture.service';
import { VoiceDraftReviewStore } from './voice-draft-review.store';

// Phase 1.4-2: the third "nouvelle facture" entry point — describe the
// devis/facture out loud (or typed) instead of picking through mode
// rapide's form or mode manuel's canvas. Deliberately flat/standalone
// (like mode manuel), not mounted inside InvoiceCreateShellPage — there's
// no draft yet at this point for the shell's totals footer to show
// anything meaningful about.
//
// Phase 1.4-3: on a compiled native app (Capacitor.isNativePlatform(),
// read once as a field initializer — same "test the capability once,
// branch, no runtime re-detection" convention as
// PdfPreviewModalComponent.useCanvasViewer/isSpeechRecognitionSupported
// below), dictation goes through NativeSpeechCaptureService instead of
// the Web Speech API — the only path that works on iOS at all, since
// Safari/WebKit never implemented Web Speech and a Capacitor iOS app runs
// in the same WKWebView engine. `transcript`/`listening` stay the single
// signals the template reads regardless of which path is live; two small
// effects below keep them in sync with the native service's own signals
// when `isNative` is true, so the rest of this component (submit,
// textarea fallback, error handling) is identical either way.
@Component({
  selector: 'app-invoice-create-voice-capture-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, BigButtonComponent, IconMicrophoneComponent],
  templateUrl: './invoice-create-voice-capture.page.html',
})
export class InvoiceCreateVoiceCapturePage {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly voiceDraftService = inject(VoiceInvoiceDraftService);
  private readonly draftStore = inject(InvoiceDraftStore);
  private readonly voiceDraftReviewStore = inject(VoiceDraftReviewStore);
  private readonly nativeSpeech = inject(NativeSpeechCaptureService);

  protected readonly isNative = Capacitor.isNativePlatform();
  protected readonly speechSupported = this.isNative || isSpeechRecognitionSupported();
  protected readonly transcript = signal('');
  protected readonly listening = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly rejectedMessage = signal<string | null>(null);

  private recognition: SpeechRecognition | null = null;

  constructor() {
    if (this.isNative) {
      effect(() => this.transcript.set(this.nativeSpeech.transcript()));
      effect(() => this.listening.set(this.nativeSpeech.listening()));
      effect(() => {
        const message = this.nativeSpeech.errorMessage();
        if (message) {
          this.errorMessage.set(message);
        }
      });
    }
  }

  protected toggleListening(): void {
    if (this.isNative) {
      this.errorMessage.set(null);
      this.rejectedMessage.set(null);
      if (this.nativeSpeech.listening()) {
        void this.nativeSpeech.stop();
      } else {
        void this.nativeSpeech.start();
      }
      return;
    }

    if (this.listening()) {
      this.recognition?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      return;
    }
    this.errorMessage.set(null);
    this.rejectedMessage.set(null);
    const recognition = new Ctor();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let combined = '';
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript;
      }
      this.transcript.set(combined.trim());
    };
    recognition.onerror = () => {
      this.listening.set(false);
    };
    recognition.onend = () => {
      this.listening.set(false);
    };

    this.recognition = recognition;
    this.listening.set(true);
    recognition.start();
  }

  protected onTranscriptEdit(value: string): void {
    this.transcript.set(value);
  }

  protected submit(): void {
    const transcript = this.transcript().trim();
    if (!transcript || this.submitting()) {
      return;
    }
    if (this.isNative) {
      void this.nativeSpeech.stop();
    } else {
      this.recognition?.stop();
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.rejectedMessage.set(null);

    this.voiceDraftService
      .resolveDraft(transcript)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          if (response.status === 'rejected') {
            // Never opens the review screen with an all-blank flagged form
            // — the artisan corrects/retries the transcript right here.
            this.rejectedMessage.set(response.message);
            return;
          }
          this.draftStore.loadFromVoiceDraft(response.draft);
          this.voiceDraftReviewStore.activate(response.draft);
          void this.router.navigate(['/factures/nouvelle/rapide/revue']);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(this.friendlyErrorMessage(error));
        },
      });
  }

  private friendlyErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 429) {
        return 'Quota quotidien de commandes vocales atteint. Réessayez plus tard.';
      }
      if (error.status === 503) {
        return "La création par commande vocale n'est pas configurée pour le moment.";
      }
    }
    if (error instanceof TimeoutError) {
      return 'La création par commande vocale prend trop de temps. Réessayez.';
    }
    return 'La création par commande vocale a échoué. Vous pouvez réessayer dans quelques instants.';
  }
}
