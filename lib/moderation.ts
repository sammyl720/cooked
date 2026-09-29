import type { Turn } from "./domain";

export type SafetyResult = { safe: true } | { safe: false; reason: string; resources?: string };

const SEVERE_PATTERNS = [
  /\b(kill|murder|hurt)\s+(you|yourself|myself|them)\b/i,
  /\b(i('?m| am)|you('?re| are))\s+(going to|gonna)\s+(kill|hurt)\b/i,
  /\bsexual.{0,40}\b(minor|child|underage|1[0-7]\s*(?:yo|years? old))\b/i,
  /\b(minor|child|underage|1[0-7]\s*(?:yo|years? old)).{0,40}\b(sex|nude|nudes|hook up)\b/i,
];

const COERCION_PATTERNS = [
  /\b(if you loved me|you owe me|don'?t tell anyone|no one will believe you)\b/i,
  /\b(send (?:me )?nudes?|forced? me|without (?:my|your) consent)\b/i,
];

export function moderateConversation(turns: Turn[]): SafetyResult {
  const text = turns.map((turn) => turn.text).join("\n");
  if (SEVERE_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      safe: false,
      reason: "This looks more serious than a playful score can handle. If anyone may be in immediate danger, contact local emergency services or a trusted person now.",
      resources: "In the U.S. or Canada, call or text 988 for crisis support. Elsewhere, use your local crisis line.",
    };
  }
  if (COERCION_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      safe: false,
      reason: "A playful score would not be appropriate for messages that may involve pressure or coercion. Consider talking with someone you trust or a local support service.",
    };
  }
  return { safe: true };
}
