import type { DraftTurn } from "./domain";

export type OcrResult = { text: string; suggestedTurns: DraftTurn[]; warnings: string[] };

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
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Extract only the ordered chat bubble messages from this two-person dating-chat screenshot. Ignore names, avatars, timestamps, read receipts, reactions, UI labels, and status bars. Preserve message wording. Return only JSON: {\"text\":\"messages separated by newlines\",\"turns\":[{\"text\":\"message\"}],\"warnings\":[\"brief uncertainty if any\"]}. Do not guess which person is Me; do not include a speaker field." },
          { type: "input_image", image_url: `data:${mime};base64,${base64(bytes)}`, detail: "high" },
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
    const text = responseText(await response.json()).trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = JSON.parse(text) as { text?: unknown; turns?: unknown; warnings?: unknown };
    const suggestedTurns: DraftTurn[] = Array.isArray(parsed.turns)
      ? parsed.turns.slice(0, 40).flatMap((turn) => turn && typeof turn === "object" && typeof (turn as { text?: unknown }).text === "string" && (turn as { text: string }).text.trim() ? [{ speaker: null, text: (turn as { text: string }).text.trim() }] : [])
      : [];
    if (suggestedTurns.length < 1) throw new Error("OCR_EMPTY");
    return {
      text: typeof parsed.text === "string" ? parsed.text.slice(0, 6_000) : suggestedTurns.map((turn) => turn.text).join("\n"),
      suggestedTurns,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((warning): warning is string => typeof warning === "string").slice(0, 3) : [],
    };
  }
}
