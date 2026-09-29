import type { AnalysisInput, DraftTurn, Speaker, Turn } from "./domain";

export const MAX_CHARS = 6_000;
export const MAX_TURNS = 40;

const PREFIX = /^(me|myself|you|them|they|match|other)\s*[:\-–—]\s*(.+)$/i;

function prefixSpeaker(value: string): Speaker {
  return /^(me|myself|you)$/i.test(value) ? "me" : "them";
}

export function parsePastedText(raw: string): { turns: DraftTurn[]; confident: boolean } {
  const lines = raw
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_TURNS);

  const parsed = lines.map((line) => {
    const match = line.match(PREFIX);
    return match
      ? { speaker: prefixSpeaker(match[1]), text: match[2].trim() }
      : { speaker: null, text: line };
  });
  return { turns: parsed, confident: parsed.length > 0 && parsed.every((turn) => turn.speaker !== null) };
}

export function normalizeInput(value: unknown): AnalysisInput {
  if (!value || typeof value !== "object") throw new Error("Add a two-person conversation first.");
  const input = value as { mode?: unknown; turns?: unknown };
  if (input.mode !== "dating" || !Array.isArray(input.turns)) throw new Error("Only Dating mode is available right now.");

  let remaining = MAX_CHARS;
  const turns: Turn[] = [];
  for (const candidate of input.turns.slice(0, MAX_TURNS)) {
    if (!candidate || typeof candidate !== "object") continue;
    const rawTurn = candidate as { speaker?: unknown; text?: unknown };
    if ((rawTurn.speaker !== "me" && rawTurn.speaker !== "them") || typeof rawTurn.text !== "string") continue;
    const text = rawTurn.text.trim().slice(0, remaining);
    if (!text) continue;
    turns.push({ speaker: rawTurn.speaker, text });
    remaining -= text.length;
    if (remaining <= 0) break;
  }

  if (turns.length < 2) throw new Error("Add at least two messages.");
  if (!turns.some((turn) => turn.speaker === "me") || !turns.some((turn) => turn.speaker === "them")) {
    throw new Error("Assign at least one message to Me and one to Them.");
  }
  return { mode: "dating", turns };
}

export function substantiveTurnCount(turns: Turn[]) {
  return turns.filter((turn) => turn.text.replace(/\s/g, "").length >= 3).length;
}

export function looksConversational(turns: Turn[]) {
  const words = turns.flatMap((turn) => turn.text.split(/\s+/)).filter(Boolean);
  const longUnbroken = turns.some((turn) => /\S{160,}/.test(turn.text));
  return words.length >= 4 && !longUnbroken;
}
