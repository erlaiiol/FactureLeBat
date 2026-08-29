// Web Speech API's recognition interface never shipped a standard,
// unprefixed name — every browser that implements it at all still only
// exposes the vendor-prefixed `webkitSpeechRecognition` (Chrome/Edge/most
// Chromium browsers); Safari and Firefox expose neither, same "no support
// at all" bucket as an old/unusual engine. No TypeScript DOM lib ships
// types for either name, so this file also declares just enough of the
// shape actually used (see speech-recognition.types.ts) rather than
// pulling in a full community type-definitions package for one narrow
// feature.
export function isSpeechRecognitionSupported(win: Window = window): boolean {
  return Boolean(
    (win as unknown as Record<string, unknown>)['SpeechRecognition'] ||
    (win as unknown as Record<string, unknown>)['webkitSpeechRecognition'],
  );
}
