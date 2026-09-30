import { VIBES, type CookedLabel, type Dimension, type DimensionKey, type Turn, type Vibe } from "./domain";

export const RESULT_VERSION = "cooked_v1" as const;
export const SCORE_KEYS = ["reciprocity", "warmth", "follow_through", "clarity"] as const;
export const SCORE_LABELS: Record<DimensionKey, string> = {
  reciprocity: "Reciprocity",
  warmth: "Warmth",
  follow_through: "Follow-through",
  clarity: "Clarity",
};

type ScoreAnswer = { type: "score"; score: number; confidence: number; legend: Record<string, unknown>; probabilities: Record<string, number> };
type ChoiceAnswer = { type: "choice"; choice: Vibe; confidence: number; probabilities: Record<string, number> };
type NoulAnswer = { type: "noul"; noul: number };
export type JevAnswers = Record<DimensionKey, ScoreAnswer> & { vibe: ChoiceAnswer; explicit_next_step: NoulAnswer };
export type JevEvaluation = { model: string; answers: JevAnswers };

const isFiniteRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function validateProbabilities(value: unknown, expected: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const map = value as Record<string, unknown>;
  if (Object.keys(map).length !== expected.length || expected.some((key) => !isFiniteRange(map[key], 0, 1))) return false;
  const sum = expected.reduce((total, key) => total + Number(map[key]), 0);
  return Math.abs(sum - 1) <= 0.02;
}

export function validateJevResponse(value: unknown): JevEvaluation {
  if (!value || typeof value !== "object") throw new Error("Invalid Jev response.");
  const root = value as { model?: unknown; answers?: unknown };
  if (typeof root.model !== "string" || !root.model || !root.answers || typeof root.answers !== "object") throw new Error("Invalid Jev response metadata.");
  const answers = root.answers as Record<string, unknown>;
  const expectedKeys = [...SCORE_KEYS, "vibe", "explicit_next_step"];
  if (Object.keys(answers).length !== expectedKeys.length || expectedKeys.some((key) => !(key in answers))) throw new Error("Jev returned a partial result.");

  for (const key of SCORE_KEYS) {
    const answer = answers[key] as Partial<ScoreAnswer> | undefined;
    if (!answer || answer.type !== "score" || !isFiniteRange(answer.score, 0, 4) || !isFiniteRange(answer.confidence, 0, 1)) throw new Error(`Invalid ${key} score.`);
    if (!answer.legend || typeof answer.legend !== "object" || !validateProbabilities(answer.probabilities, ["0", "1", "2", "3", "4"])) throw new Error(`Invalid ${key} distribution.`);
  }

  const vibe = answers.vibe as Partial<ChoiceAnswer> | undefined;
  if (!vibe || vibe.type !== "choice" || !VIBES.includes(vibe.choice as Vibe) || !isFiniteRange(vibe.confidence, 0, 1) || !validateProbabilities(vibe.probabilities, VIBES)) throw new Error("Invalid vibe answer.");
  const nextStep = answers.explicit_next_step as Partial<NoulAnswer> | undefined;
  if (!nextStep || nextStep.type !== "noul" || !isFiniteRange(nextStep.noul, 0, 1)) throw new Error("Invalid next-step answer.");
  return root as JevEvaluation;
}

export function cookedIndex(scores: Record<DimensionKey, number>) {
  const positive = .3 * scores.reciprocity + .25 * scores.warmth + .25 * scores.follow_through + .2 * scores.clarity;
  return Math.max(0, Math.min(100, Math.round(100 - 25 * positive)));
}

export function labelFor(index: number): CookedLabel {
  if (index <= 24) return "You're good";
  if (index <= 49) return "Mixed signals";
  if (index <= 74) return "It's complicated";
  return "Not looking good";
}

export function phraseFor(label: CookedLabel, vibe: Vibe, nextStep: number) {
  if (nextStep >= .68 && label !== "Not looking good") return "Okay, there is an actual plan.";
  if (vibe === "one_sided" || vibe === "dry") return "You're carrying the conversation on your back.";
  if ((vibe === "warm" || vibe === "friendly") && nextStep < .45) return "The vibe is warm, but the plan is still vague.";
  if (vibe === "mixed") return "There’s a signal here — it just keeps changing lanes.";
  if (label === "Not looking good") return "The visible effort is doing a disappearing act.";
  if (label === "You're good") return "The room is reading pretty well.";
  return "The messages leave some room for interpretation.";
}

export function resultFromEvaluation(evaluation: JevEvaluation, turns: Turn[]) {
  const minConfidence = Math.min(...SCORE_KEYS.map((key) => evaluation.answers[key].confidence));
  if (evaluation.answers.vibe.choice === "unclear" || minConfidence < .35 || turns.filter((turn) => turn.text.replace(/\s/g, "").length >= 3).length < 4) {
    return { status: "insufficient" as const, reason: "Too little to call — add a few more substantive messages from both people." };
  }
  const scores = Object.fromEntries(SCORE_KEYS.map((key) => [key, evaluation.answers[key].score])) as Record<DimensionKey, number>;
  const index = cookedIndex(scores);
  const label = labelFor(index);
  const dimensions: Dimension[] = SCORE_KEYS.map((key) => ({ key, label: SCORE_LABELS[key], value: scores[key] }));
  return {
    status: "scored" as const,
    result: {
      index,
      label,
      vibe: evaluation.answers.vibe.choice,
      dimensions,
      phrase: phraseFor(label, evaluation.answers.vibe.choice, evaluation.answers.explicit_next_step.noul),
      resultVersion: RESULT_VERSION,
      disclaimer: "Based only on the messages you shared.",
    },
  };
}
