import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInput, parsePastedText } from "../lib/conversation";

test("prefixed paste parses conservatively", () => {
  const parsed = parsePastedText("Me: hi there\nThem: hello back");
  assert.equal(parsed.confident, true);
  assert.deepEqual(parsed.turns.map((turn) => turn.speaker), ["me", "them"]);
});

test("unprefixed paste leaves speakers unassigned", () => {
  const parsed = parsePastedText("hi there\nhello back");
  assert.equal(parsed.confident, false);
  assert.deepEqual(parsed.turns.map((turn) => turn.speaker), [null, null]);
});

test("normalization rejects a single-speaker monologue", () => {
  assert.throws(() => normalizeInput({ mode: "dating", turns: [{ speaker: "me", text: "hello" }, { speaker: "me", text: "still there?" }] }), /Assign at least one/);
});
