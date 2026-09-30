import { VIBES, type CookedLabel, type Dimension, type DimensionKey, type ReadDetails, type ReplyTone, type Turn, type Vibe } from "./domain";

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

const PLAN_PATTERN = /\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b|\b(?:at|after|around|by)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?\b|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:tonight|tomorrow|weekend|meet|date|reservation|at\s+[A-Z][\w’'-]+)\b/i;
const WARM_PATTERN = /\b(?:lol|haha|love|cute|fun|great|amazing|excited|perfect|glad|sweet|looking forward)\b|[😂❤️😊😉😍🥰]/i;
const CLEAR_PATTERN = /\b(?:yes|yeah|yep|no|can|can't|cannot|will|won't|free|works|deal|definitely|absolutely|perfect|see you)\b/i;
const HEDGE_PATTERN = /\b(?:maybe|sometime|we'?ll see|not sure|probably|might|guess)\b/i;

function trimQuote(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 150 ? clean : `${clean.slice(0, 147).trimEnd()}…`;
}

function evidenceWeight(text: string, key: DimensionKey) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (key === "reciprocity") return (text.includes("?") ? 5 : 0) + Math.min(words, 18) / 6;
  if (key === "warmth") return (WARM_PATTERN.test(text) ? 6 : 0) + (/[!]/.test(text) ? 1 : 0) + Math.min(words, 12) / 12;
  if (key === "follow_through") return (PLAN_PATTERN.test(text) ? 7 : 0) + (CLEAR_PATTERN.test(text) ? 2 : 0) - (HEDGE_PATTERN.test(text) ? 2 : 0);
  return (CLEAR_PATTERN.test(text) || PLAN_PATTERN.test(text) ? 5 : 0) - (HEDGE_PATTERN.test(text) ? 3 : 0) + Math.min(words, 12) / 12;
}

function evidenceFor(turns: Turn[], key: DimensionKey) {
  const candidates = turns.filter((turn) => turn.speaker === "them" && turn.text.trim());
  const best = [...candidates].sort((a, b) => evidenceWeight(b.text, key) - evidenceWeight(a.text, key))[0];
  return trimQuote(best?.text ?? "No single message carries this part of the read.");
}

function interpretationFor(key: DimensionKey, value: number) {
  const band = value >= 3 ? "high" : value >= 1.75 ? "middle" : "low";
  const copy: Record<DimensionKey, Record<typeof band, string>> = {
    reciprocity: {
      high: "They visibly add momentum instead of leaving you to carry every exchange.",
      middle: "There is some give-and-take, but the effort is not consistently balanced.",
      low: "Their visible replies leave you doing most of the conversational work.",
    },
    warmth: {
      high: "Their wording reads as consistently warm, playful, or personally engaged.",
      middle: "The tone is friendly, though friendliness alone does not establish intent.",
      low: "The visible tone is mostly neutral, brief, or emotionally flat.",
    },
    follow_through: {
      high: "They move the exchange toward a specific action instead of vague interest.",
      middle: "They appear open to continuing, but the next step is not fully locked in.",
      low: "There is little visible commitment to continuing or making a concrete plan.",
    },
    clarity: {
      high: "Their words make the immediate next step relatively easy to understand.",
      middle: "The signal is readable, but still leaves meaningful room for interpretation.",
      low: "Their wording is ambiguous or sends conflicting visible signals.",
    },
  };
  return copy[key][band];
}

function repliesFor(kind: "confirm" | "plan" | "clarify" | "pause"): Array<{ tone: ReplyTone; text: string }> {
  const replies = {
    confirm: {
      Direct: "Perfect — let’s lock in the details.",
      Casual: "Sounds good, looking forward to it.",
      Playful: "Deal. I’ll bring the good energy.",
    },
    plan: {
      Direct: "Want to pick a day and make it happen?",
      Casual: "I’m into this — what day works for you?",
      Playful: "Okay, let’s take this out of the chat. When are you free?",
    },
    clarify: {
      Direct: "Are you interested in making a plan?",
      Casual: "Want to actually pick a day?",
      Playful: "Should we turn this plot into an actual plan?",
    },
    pause: {
      Direct: "I’ll leave the ball in your court.",
      Casual: "No pressure — let me know.",
      Playful: "Your move 🙂",
    },
  } as const;
  return (Object.keys(replies[kind]) as ReplyTone[]).map((tone) => ({ tone, text: replies[kind][tone] }));
}

export function buildReadDetails(evaluation: JevEvaluation, turns: Turn[], dimensions: Dimension[]): ReadDetails {
  const minConfidence = Math.min(...SCORE_KEYS.map((key) => evaluation.answers[key].confidence));
  const confidence = minConfidence >= .75
    ? { label: "High" as const, detail: "The visible signals line up across the scored dimensions." }
    : minConfidence >= .55
      ? { label: "Medium" as const, detail: "There is a readable pattern, with some room for interpretation." }
      : { label: "Guarded" as const, detail: "The pattern is usable, but a few more messages could change the read." };

  const decisive = [...dimensions].sort((a, b) => Math.abs(b.value - 2) - Math.abs(a.value - 2))[0];
  const weakestConfidenceKey = [...SCORE_KEYS].sort((a, b) => evaluation.answers[a].confidence - evaluation.answers[b].confidence)[0];
  const nextStep = evaluation.answers.explicit_next_step.noul;
  const vibe = evaluation.answers.vibe.choice;

  let nextMove: ReadDetails["nextMove"];
  let replyKind: "confirm" | "plan" | "clarify" | "pause";
  if (nextStep >= .68) {
    nextMove = { title: "Confirm the details, then let the plan breathe.", detail: "There is already a concrete next step. You do not need to keep proving the vibe over text." };
    replyKind = "confirm";
  } else if (vibe === "one_sided" || vibe === "dry") {
    nextMove = { title: "Match their effort instead of filling the silence.", detail: "Give them room to create the next bit of momentum. Their action will be more useful than another guess." };
    replyKind = "pause";
  } else if (vibe === "mixed") {
    nextMove = { title: "Ask one clear question, then judge the response.", detail: "A specific invitation is the fastest way to turn an inconsistent signal into useful information." };
    replyKind = "clarify";
  } else {
    nextMove = { title: "Turn the conversation into one specific plan.", detail: "Keep it simple: suggest a day or ask when they are free, then let their response show the follow-through." };
    replyKind = "plan";
  }

  const ambiguity = dimensions.find((dimension) => dimension.key === weakestConfidenceKey)!;
  return {
    confidence,
    strongestSignal: {
      title: `${decisive.label} is the most telling signal`,
      detail: decisive.interpretation,
      quote: decisive.evidence,
    },
    uncertainty: nextStep >= .68
      ? { title: "A plan is not the same as a prediction", detail: "The messages support a concrete next step, but they cannot prove hidden intent or what happens afterward." }
      : { title: `${ambiguity.label} has the most uncertainty`, detail: `${ambiguity.interpretation} This is the part most likely to shift with more context.`, quote: ambiguity.evidence },
    nextMove,
    replyIdeas: repliesFor(replyKind),
  };
}

export function resultFromEvaluation(evaluation: JevEvaluation, turns: Turn[]) {
  const minConfidence = Math.min(...SCORE_KEYS.map((key) => evaluation.answers[key].confidence));
  if (evaluation.answers.vibe.choice === "unclear" || minConfidence < .35 || turns.filter((turn) => turn.text.replace(/\s/g, "").length >= 3).length < 4) {
    return { status: "insufficient" as const, reason: "Too little to call — add a few more substantive messages from both people." };
  }
  const scores = Object.fromEntries(SCORE_KEYS.map((key) => [key, evaluation.answers[key].score])) as Record<DimensionKey, number>;
  const index = cookedIndex(scores);
  const label = labelFor(index);
  const dimensions: Dimension[] = SCORE_KEYS.map((key) => ({
    key,
    label: SCORE_LABELS[key],
    value: scores[key],
    evidence: evidenceFor(turns, key),
    interpretation: interpretationFor(key, scores[key]),
  }));
  return {
    status: "scored" as const,
    result: {
      index,
      label,
      vibe: evaluation.answers.vibe.choice,
      dimensions,
      phrase: phraseFor(label, evaluation.answers.vibe.choice, evaluation.answers.explicit_next_step.noul),
      read: buildReadDetails(evaluation, turns, dimensions),
      resultVersion: RESULT_VERSION,
      disclaimer: "Based only on the messages you shared.",
    },
  };
}
