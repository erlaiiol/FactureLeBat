import { Injectable } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Native-shell-only handoff of a file to the OS share sheet (save to
// Fichiers/Drive, send by SMS/mail/WhatsApp…) — the Capacitor counterpart
// of navigator.share({ files }), which the Android WebView doesn't
// implement at all. Kept as its own injectable, separate from
// FileDownloadService, so specs can swap it for a fake: the plugins
// themselves only exist inside a real native shell.
@Injectable({ providedIn: 'root' })
export class NativeFileShareService {
  async share(blob: Blob, fileName: string, text?: string): Promise<void> {
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: await toBase64(blob),
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: fileName, text, files: [uri], dialogTitle: fileName });
    } catch (error) {
      // Closing the share sheet without picking anything rejects on some
      // platforms — not a failure.
      if (!/cancel/i.test((error as Error)?.message ?? '')) {
        throw error;
      }
    }
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
