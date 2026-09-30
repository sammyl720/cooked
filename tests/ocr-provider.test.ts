import test from "node:test";
import assert from "node:assert/strict";
import { parseOcrOutput } from "../lib/ocr-provider";

test("OCR keeps model speaker assignments for positioned chat bubbles", () => {
  const result = parseOcrOutput(JSON.stringify({
    turns: [
      { speaker: "them", text: "Still free Thursday?", confidence: "high", evidence: "bubble_position" },
      { speaker: "me", text: "Yes — after seven.", confidence: "high", evidence: "bubble_position" },
    ],
    warnings: [],
  }));

  assert.deepEqual(result.suggestedTurns.map((turn) => turn.speaker), ["them", "me"]);
  assert.equal(result.text, "Them: Still free Thursday?\nMe: Yes — after seven.");
});

test("explicit Me and Them labels recover speaker assignment deterministically", () => {
  const result = parseOcrOutput(JSON.stringify({
    turns: [
      { speaker: "unknown", text: "Me: Free Thursday?", confidence: "low", evidence: "unknown" },
      { speaker: "unknown", text: "Them: It's a date.", confidence: "low", evidence: "unknown" },
    ],
    warnings: [],
  }));

  assert.deepEqual(result.suggestedTurns, [
    { speaker: "me", text: "Free Thursday?" },
    { speaker: "them", text: "It's a date." },
  ]);
  assert.deepEqual(result.warnings, []);
});

test("genuinely ambiguous OCR turns stay editable instead of being guessed", () => {
  const result = parseOcrOutput(JSON.stringify({
    turns: [{ speaker: "unknown", text: "Maybe later", confidence: "low", evidence: "unknown" }],
    warnings: [],
  }));

  assert.equal(result.suggestedTurns[0].speaker, null);
  assert.match(result.warnings[0], /speaker check/);
});
