import { isSpeechRecognitionSupported } from './speech-recognition-support.util';

function fakeWindow(overrides: Record<string, unknown>): Window {
  return overrides as unknown as Window;
}

describe('isSpeechRecognitionSupported', () => {
  it('is true when SpeechRecognition is present (a hypothetical unprefixed implementation)', () => {
    expect(isSpeechRecognitionSupported(fakeWindow({ SpeechRecognition: class {} }))).toBe(true);
  });

  it('is true when only the vendor-prefixed webkitSpeechRecognition is present (Chrome/Edge today)', () => {
    expect(isSpeechRecognitionSupported(fakeWindow({ webkitSpeechRecognition: class {} }))).toBe(
      true,
    );
  });

  it('is false when neither is present (Safari, Firefox)', () => {
    expect(isSpeechRecognitionSupported(fakeWindow({}))).toBe(false);
  });
});
