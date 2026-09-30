export type Speaker = "me" | "them";
export type Turn = { speaker: Speaker; text: string };
export type AnalysisInput = { mode: "dating"; turns: Turn[] };

export const VIBES = ["warm", "friendly", "one_sided", "dry", "mixed", "unclear"] as const;
export type Vibe = (typeof VIBES)[number];
export type CookedLabel = "You're good" | "Mixed signals" | "It's complicated" | "Not looking good";
export type DimensionKey = "reciprocity" | "warmth" | "follow_through" | "clarity";

export type Dimension = {
  key: DimensionKey;
  label: string;
  value: number;
};

export type ScoredResult = {
  index: number;
  label: CookedLabel;
  vibe: Vibe;
  dimensions: Dimension[];
  phrase: string;
  resultVersion: "cooked_v1";
  disclaimer: string;
  proof: string;
  demo?: boolean;
};

export type AnalyzeResponse =
  | { status: "scored"; result: ScoredResult }
  | { status: "insufficient"; reason: string }
  | { status: "safety"; reason: string; resources?: string };

export type DraftTurn = { speaker: Speaker | null; text: string };
