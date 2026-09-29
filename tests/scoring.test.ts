import assert from "node:assert/strict";
import test from "node:test";
import type { Turn } from "../lib/domain";
import { cookedIndex, labelFor, phraseFor, resultFromEvaluation, validateJevResponse } from "../lib/scoring";

const probabilities = { "0": 0, "1": 0, "2": 1, "3": 0, "4": 0 };
const legend = { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" };
const score = (value = 2, confidence = .8) => ({ type: "score", score: value, confidence, legend, probabilities });
const vibeProbabilities = { warm: 1, friendly: 0, one_sided: 0, dry: 0, mixed: 0, unclear: 0 };

function evaluation(overrides: Record<string, unknown> = {}) {
  return validateJevResponse({
    model: "jev-1.13.0",
    answers: {
      reciprocity: score(), warmth: score(), follow_through: score(), clarity: score(),
      vibe: { type: "choice", choice: "warm", confidence: .8, probabilities: vibeProbabilities },
      explicit_next_step: { type: "noul", noul: .2 },
      ...overrides,
    },
  });
}

const turns: Turn[] = [
  { speaker: "me", text: "Are you free Friday?" },
  { speaker: "them", text: "Yes, after seven works." },
  { speaker: "me", text: "Bar Flores at 7:30?" },
  { speaker: "them", text: "Perfect, see you there!" },
];

test("cooked_v1 formula and label boundaries are stable", () => {
  assert.equal(cookedIndex({ reciprocity: 4, warmth: 4, follow_through: 4, clarity: 4 }), 0);
  assert.equal(cookedIndex({ reciprocity: 0, warmth: 0, follow_through: 0, clarity: 0 }), 100);
  assert.equal(cookedIndex({ reciprocity: 2, warmth: 2, follow_through: 2, clarity: 2 }), 50);
  assert.equal(labelFor(24), "You're good");
  assert.equal(labelFor(25), "Mixed signals");
  assert.equal(labelFor(50), "It's complicated");
  assert.equal(labelFor(75), "Cooked");
});

test("explicit plan and maybe-sometime phrasing stay distinct", () => {
  assert.equal(phraseFor("You're good", "warm", .9), "Okay, there is an actual plan.");
  assert.equal(phraseFor("Mixed signals", "warm", .08), "The vibe is warm, but the plan is still vague.");
});

test("unclear, low-confidence, and thin inputs never receive a score", () => {
  const unclear = evaluation({ vibe: { type: "choice", choice: "unclear", confidence: .8, probabilities: { ...vibeProbabilities, warm: 0, unclear: 1 } } });
  assert.equal(resultFromEvaluation(unclear, turns).status, "insufficient");
  const low = evaluation({ warmth: score(2, .34) });
  assert.equal(resultFromEvaluation(low, turns).status, "insufficient");
  assert.equal(resultFromEvaluation(evaluation(), turns.slice(0, 3)).status, "insufficient");
});

test("malformed and partial Jev responses are rejected", () => {
  assert.throws(() => validateJevResponse({ model: "jev", answers: { reciprocity: score() } }), /partial/i);
  assert.throws(() => evaluation({ warmth: { ...score(), score: Number.NaN } }), /warmth/i);
  assert.throws(() => evaluation({ clarity: { ...score(), probabilities: { ...probabilities, "4": .4 } } }), /distribution/i);
});
