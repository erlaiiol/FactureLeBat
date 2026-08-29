// Minimal ambient shape for the (still non-standard) Web Speech API —
// just the members `invoice-create-voice-capture.page.ts` actually reads/
// sets. No TypeScript DOM lib ships real types for this API; a full
// community `@types` package would bring in far more than this one
// component needs.
export interface SpeechRecognitionResultEvent extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: {
      readonly isFinal: boolean;
      readonly length: number;
      [index: number]: { readonly transcript: string };
    };
  };
}

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

export interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

export function getSpeechRecognitionCtor(
  win: Window = window,
): SpeechRecognitionConstructor | undefined {
  const globalWin = win as unknown as Record<string, unknown>;
  return (globalWin['SpeechRecognition'] ?? globalWin['webkitSpeechRecognition']) as
    SpeechRecognitionConstructor | undefined;
}
