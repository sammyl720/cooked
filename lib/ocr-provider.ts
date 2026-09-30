import type { DraftTurn } from "./domain";

export type OcrResult = { text: string; suggestedTurns: DraftTurn[]; warnings: string[] };

type OcrSpeaker = "me" | "them" | "unknown";

type OcrTurn = {
  speaker?: unknown;
  text?: unknown;
  confidence?: unknown;
  evidence?: unknown;
};

const LABELED_SPEAKER = /^(me|myself|you|them|they|match|other)\s*[:\-–—]\s*(.+)$/is;

function labeledTurn(text: string) {
  const match = text.match(LABELED_SPEAKER);
  if (!match) return null;
  return {
    speaker: /^(me|myself|you)$/i.test(match[1]) ? "me" as const : "them" as const,
    text: match[2].trim(),
  };
}

function normalizeSpeaker(value: unknown): OcrSpeaker {
  return value === "me" || value === "them" ? value : "unknown";
}

export function parseOcrOutput(value: string): OcrResult {
  const cleaned = value.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(cleaned) as { turns?: unknown; warnings?: unknown };
  const modelTurns = Array.isArray(parsed.turns) ? parsed.turns.slice(0, 40) : [];
  const suggestedTurns: DraftTurn[] = modelTurns.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const turn = candidate as OcrTurn;
    if (typeof turn.text !== "string" || !turn.text.trim()) return [];
    const rawText = turn.text.trim();
    const labeled = labeledTurn(rawText);
    const speaker = labeled?.speaker ?? normalizeSpeaker(turn.speaker);
    const text = (labeled?.text ?? rawText).slice(0, 2_000);
    if (!text) return [];
    return [{ speaker: speaker === "unknown" ? null : speaker, text }];
  });
  if (suggestedTurns.length < 1) throw new Error("OCR_EMPTY");

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === "string" && Boolean(warning.trim())).map((warning) => warning.trim()).slice(0, 3)
    : [];
  const unassigned = suggestedTurns.filter((turn) => turn.speaker === null).length;
  if (unassigned > 0 && warnings.length < 3) warnings.push(`${unassigned} ${unassigned === 1 ? "message needs" : "messages need"} a speaker check.`);

  return {
    text: suggestedTurns.map((turn) => `${turn.speaker === "me" ? "Me: " : turn.speaker === "them" ? "Them: " : ""}${turn.text}`).join("\n").slice(0, 6_000),
    suggestedTurns,
    warnings,
  };
}

function base64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(binary);
}

function responseText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const output = (value as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const part of (item as { content: unknown[] }).content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
    }
  }
  return "";
}

export class OpenAIOcrProvider {
  async extract(bytes: Uint8Array, mime: string): Promise<OcrResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error("OCR_NOT_CONFIGURED");
    const body = {
      model: process.env.OCR_MODEL?.trim() || "gpt-6-astra",
      store: false,
      max_output_tokens: 2_000,
      text: {
        format: {
          type: "json_schema",
          name: "chat_screenshot_transcript",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              turns: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    speaker: { type: "string", enum: ["me", "them", "unknown"] },
                    text: { type: "string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    evidence: { type: "string", enum: ["explicit_label", "bubble_position", "visual_grouping", "unknown"] },
                  },
                  required: ["speaker", "text", "confidence", "evidence"],
                },
              },
              warnings: { type: "array", items: { type: "string" } },
            },
            required: ["turns", "warnings"],
          },
        },
      },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `Extract the ordered messages from this two-person chat screenshot and identify who sent each one.

Speaker rules, in priority order:
1. Explicit transcript labels win: Me/Myself/You means \"me\"; Them/They/Match/Other means \"them\". Remove the label from the message text.
2. In a messaging-app screenshot, outgoing bubbles on the RIGHT are \"me\" and incoming bubbles on the LEFT are \"them\". Use bubble edges, tails, color grouping, and column alignment—not the wording—to determine the side.
3. A continuation bubble may inherit the speaker only when it is visually grouped in the same side/column.
4. If there is no explicit label or reliable visual-side evidence, use \"unknown\". Never infer a speaker from what the message says.

Keep the visual reading order. Preserve wording and emoji. Ignore contact names, avatars, timestamps, date separators, read receipts, reactions, typing indicators, composer text, navigation, and status bars. Put only actual message content in turns. Keep warnings empty unless part of the image is unreadable or speaker placement is genuinely ambiguous.` },
          { type: "input_image", image_url: `data:${mime};base64,${base64(bytes)}`, detail: "original" },
        ],
      }],
    };

    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (response.ok || ![429, 500, 502, 503, 529].includes(response.status) || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!response?.ok) throw new Error("OCR_UPSTREAM_FAILED");
    return parseOcrOutput(responseText(await response.json()));
  }
}
