import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Turn, Vibe } from "./domain";
import { validateJevResponse, type JevEvaluation } from "./scoring";

export const JEV_QUESTIONS = {
  reciprocity: score(
    "How much does Them visibly contribute to keeping this conversation going? Judge the words and questions in the supplied turns, not hidden feelings.",
    [
      "Mostly one-sided: Them gives little to continue",
      "Some engagement, but Me carries most of the exchange",
      "Both contribute and respond meaningfully",
      "Them repeatedly adds detail or asks follow-up questions",
      "Them actively drives the exchange forward",
    ],
  ),
  warmth: score(
    "How warm or playful are Them's visible messages toward Me? Do not infer romantic intent from politeness alone.",
    [
      "Cold, dismissive, or no warmth shown",
      "Mostly neutral or brief politeness",
      "Clearly friendly or occasionally playful",
      "Consistently warm and personally engaged",
      "Strong warmth or playful affection expressed",
    ],
  ),
  follow_through: score(
    "How strongly do Them's visible messages support continuing this exchange or making a concrete plan? Count explicit commitments over vague agreement.",
    [
      "Declines, ends, or avoids continuing",
      "Vague or uncertain willingness",
      "Open to continuing but without a plan",
      "Suggests a concrete next step",
      "Clearly commits to a specific next step",
    ],
  ),
  clarity: score(
    "How clear are Them's visible signals about continuing the conversation? Penalize ambiguity; do not invent unstated motives.",
    ["Signals conflict or are too ambiguous to interpret", "Mostly ambiguous", "Somewhat understandable", "Fairly clear", "Explicitly clear"],
  ),
  vibe: choice("Which observable description best fits this chat? If evidence is thin or mixed, choose unclear.", {
    warm: "Both engage warmly or playfully",
    friendly: "Pleasant conversation without clear flirtation",
    one_sided: "Me does most of the conversational work",
    dry: "Mostly terse or low-effort replies",
    mixed: "Alternating engaged and disengaged signals",
    unclear: "Too little or too ambiguous to characterize",
  }),
  explicit_next_step: noul("Do Them's messages explicitly propose or accept a specific next step, such as a time, place, or concrete follow-up? Mere 'maybe sometime' is no."),
} as const;

export interface JevClient {
  evaluate(turns: Turn[]): Promise<{ evaluation: JevEvaluation; demo: boolean }>;
}

export class TypeSafeJevClient implements JevClient {
  async evaluate(turns: Turn[]) {
    const apiKey = process.env.TYPESAFE_API_KEY?.trim();
    if (!apiKey) return { evaluation: mockEvaluation(turns), demo: true };
    const client = new TypeSafeClient({
      apiKey,
      defaultModel: "jev-latest",
      logLevel: "off",
      timeout: 12_000,
      retry: { maxRetries: 1 },
    });
    const response = await client.systemOne({
      state: { context: "Two-person dating chat", turns },
      model: "jev-latest",
      questions: JEV_QUESTIONS,
    });
    return { evaluation: validateJevResponse(response), demo: false };
  }
}

function scoreAnswer(value: number) {
  const rounded = Math.max(0, Math.min(4, Math.round(value)));
  const probabilities = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 };
  probabilities[String(rounded) as keyof typeof probabilities] = 1;
  return { type: "score" as const, score: rounded, confidence: .72, legend: { "0": "", "1": "", "2": "", "3": "", "4": "" }, probabilities };
}

function vibeAnswer(vibe: Vibe) {
  const probabilities: Record<Vibe, number> = { warm: 0, friendly: 0, one_sided: 0, dry: 0, mixed: 0, unclear: 0 };
  probabilities[vibe] = 1;
  return { type: "choice" as const, choice: vibe, confidence: .72, probabilities };
}

function mockEvaluation(turns: Turn[]): JevEvaluation {
  const theirs = turns.filter((turn) => turn.speaker === "them");
  const mine = turns.filter((turn) => turn.speaker === "me");
  const theirText = theirs.map((turn) => turn.text).join(" ");
  const ratio = theirs.length / Math.max(1, mine.length);
  const questions = (theirText.match(/\?/g) ?? []).length;
  const warmHits = (theirText.match(/\b(lol|haha|love|cute|fun|great|amazing|date|excited|can'?t wait|😂|❤️|😊|😉)\b/gi) ?? []).length;
  const dryHits = theirs.filter((turn) => turn.text.trim().split(/\s+/).length <= 2).length;
  const plan = /\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:tonight|tomorrow|this weekend|at\s+[A-Z][\w’'-]+)\b/i.test(theirText);
  const vague = /\b(maybe|sometime|we'?ll see|not sure|probably)\b/i.test(theirText);
  const reciprocity = Math.min(4, Math.max(0, 1 + ratio + Math.min(2, questions)));
  const warmth = Math.min(4, Math.max(0, 1 + warmHits - dryHits * .5));
  const followThrough = plan ? 4 : vague ? 1 : 2;
  const clarity = plan ? 4 : vague ? 1 : dryHits > theirs.length / 2 ? 1 : 2;
  let vibe: Vibe = "friendly";
  if (turns.length < 4) vibe = "unclear";
  else if (ratio < .7) vibe = "one_sided";
  else if (dryHits > theirs.length / 2) vibe = "dry";
  else if (warmHits >= 2) vibe = "warm";
  else if (vague && warmHits > 0) vibe = "mixed";

  return validateJevResponse({
    model: "mock-jev-fixture-v1",
    answers: {
      reciprocity: scoreAnswer(reciprocity),
      warmth: scoreAnswer(warmth),
      follow_through: scoreAnswer(followThrough),
      clarity: scoreAnswer(clarity),
      vibe: vibeAnswer(vibe),
      explicit_next_step: { type: "noul", noul: plan ? .9 : vague ? .08 : .2 },
    },
  });
}
