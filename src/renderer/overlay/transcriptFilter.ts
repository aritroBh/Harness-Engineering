/**
 * Guards the hands-free listener against Whisper hallucinations.
 *
 * Whisper reliably invents fixed phrases ("Thank you.", "Thanks for
 * watching!", "you", bracketed annotations) when fed silence or ambient
 * noise. The hands-free loop records ambient audio with no user gesture, so
 * accepting those phrases makes the ghost answer nobody — the "randomly
 * talking" failure mode. The push-to-talk mic button is deliberate and stays
 * unfiltered.
 */

const MIN_VOICED_MS = 400;

/** Lowercased, punctuation-stripped phrases Whisper emits on silence/noise. */
const HALLUCINATED_PHRASES = new Set([
  "you",
  "bye",
  "bye bye",
  "thank you",
  "thanks",
  "thank you very much",
  "thank you so much",
  "thanks for watching",
  "thank you for watching",
  "thank you so much for watching",
  "thanks for watching and see you in the next video",
  "see you in the next video",
  "please subscribe",
  "subscribe",
  "like and subscribe",
  "the end",
  "music",
  "applause",
  "silence",
  "blank audio",
  "no audio",
  "uh",
  "um",
  "hmm",
  "mm",
  "ah",
  "oh",
  "so",
]);

export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[[\]()*♪]/g, " ")
    .replace(/[.,!?;:'"_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isLikelyHallucinatedTranscript(text: string): boolean {
  const normalized = normalizeTranscript(text);
  if (!normalized) return true;
  if (!/[a-z]/.test(normalized)) return true;
  if (normalized.length < 2) return true;
  return HALLUCINATED_PHRASES.has(normalized);
}

/**
 * Accept an ambient (hands-free) transcript only when the mic actually heard
 * sustained speech and the text isn't a known hallucination.
 */
export function shouldAcceptAmbientTranscript(
  text: string,
  voicedMs: number,
): boolean {
  if (voicedMs < MIN_VOICED_MS) return false;
  return !isLikelyHallucinatedTranscript(text);
}
