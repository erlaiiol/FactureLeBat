import { Injectable, signal } from '@angular/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';

// Phase 1.4-3: the native counterpart of the Web Speech API path
// `InvoiceCreateVoiceCapturePage` already drives on the web — same public
// shape (a `transcript` signal that grows as partial results arrive, a
// `listening` signal, an `errorMessage` signal), different acquisition
// underneath. Only ever constructed/used behind `Capacitor.isNativePlatform()`
// (see the capture page) — this class never runs, and the plugin is never
// imported at runtime, in a plain web build.
//
// Uses @capgo/capacitor-speech-recognition (chosen 2026-08-29 over the
// original @capacitor-community/speech-recognition — see
// docs/1.4/1.4-3-native-speech-recognition.md's Approach section for why:
// it tracks this app's actual Capacitor 8, the community package didn't).
// Wraps iOS's SFSpeechRecognizer/SpeechAnalyzer and Android's on-device
// SpeechRecognizer — no custom Swift/Kotlin recognition code, same
// reasoning as that doc.
@Injectable({ providedIn: 'root' })
export class NativeSpeechCaptureService {
  readonly transcript = signal('');
  readonly listening = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private partialResultsListener?: PluginListenerHandle;
  private errorListener?: PluginListenerHandle;

  async start(): Promise<void> {
    this.errorMessage.set(null);
    this.transcript.set('');

    let permission: Awaited<ReturnType<typeof SpeechRecognition.requestPermissions>>;
    try {
      permission = await SpeechRecognition.requestPermissions();
    } catch {
      this.errorMessage.set(
        "Impossible de demander l'autorisation du micro. Réessayez, ou décrivez votre document par écrit ci-dessous.",
      );
      return;
    }
    if (permission.speechRecognition !== 'granted') {
      this.errorMessage.set(
        'Autorisez le micro dans les réglages pour dicter votre facture, ou décrivez-la par écrit ci-dessous.',
      );
      return;
    }

    await this.attachListeners();
    this.listening.set(true);
    try {
      // partialResults: true — start() resolves immediately and every
      // update streams through the 'partialResults' listener instead;
      // language pinned to fr-FR rather than the device locale, since this
      // app is French-only regardless of how the phone itself is set up.
      await SpeechRecognition.start({ language: 'fr-FR', partialResults: true });
    } catch {
      this.listening.set(false);
      this.errorMessage.set(
        'La dictée a échoué. Réessayez, ou décrivez votre document par écrit ci-dessous.',
      );
      await this.detachListeners();
    }
  }

  async stop(): Promise<void> {
    this.listening.set(false);
    try {
      await SpeechRecognition.stop();
    } catch {
      // Nothing left to stop, or the native session already ended on its
      // own (e.g. after a silence timeout) — not an error worth surfacing.
    }
    await this.detachListeners();
  }

  private async attachListeners(): Promise<void> {
    this.partialResultsListener = await SpeechRecognition.addListener('partialResults', (event) => {
      const text = event.accumulatedText ?? event.matches?.[0];
      if (text) {
        this.transcript.set(text.trim());
      }
    });
    this.errorListener = await SpeechRecognition.addListener('error', () => {
      this.listening.set(false);
      this.errorMessage.set(
        'La dictée a été interrompue. Réessayez, ou décrivez votre document par écrit ci-dessous.',
      );
    });
  }

  private async detachListeners(): Promise<void> {
    await this.partialResultsListener?.remove();
    await this.errorListener?.remove();
    this.partialResultsListener = undefined;
    this.errorListener = undefined;
  }
}
