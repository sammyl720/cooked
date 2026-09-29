import { normalizeInput, looksConversational } from "@/lib/conversation";
import { TypeSafeJevClient } from "@/lib/jev-client";
import { moderateConversation } from "@/lib/moderation";
import { createProof } from "@/lib/proof";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resultFromEvaluation, RESULT_VERSION } from "@/lib/scoring";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "analyze", 10);
  if (limited) return limited;
  const startedAt = Date.now();
  const errorId = crypto.randomUUID().slice(0, 8);
  try {
    const input = normalizeInput(await request.json());
    if (!looksConversational(input.turns)) {
      return Response.json({ status: "insufficient", reason: "This doesn’t look like a conversation yet. Add short, ordered messages from both people." });
    }
    const safety = moderateConversation(input.turns);
    if (!safety.safe) return Response.json({ status: "safety", reason: safety.reason, resources: safety.resources });

    const { evaluation, demo } = await new TypeSafeJevClient().evaluate(input.turns);
    const outcome = resultFromEvaluation(evaluation, input.turns);
    console.info(JSON.stringify({ event: outcome.status === "scored" ? "analysis_scored" : "analysis_insufficient", model: evaluation.model, rubricVersion: RESULT_VERSION, latencyMs: Date.now() - startedAt, demo }));
    if (outcome.status === "insufficient") return Response.json(outcome);
    const proof = await createProof({ index: outcome.result.index, label: outcome.result.label, mode: "dating", resultVersion: RESULT_VERSION });
    return Response.json({ status: "scored", result: { ...outcome.result, proof, demo } });
  } catch (error) {
    const known = error instanceof Error && /Add |Assign |Only Dating/.test(error.message);
    if (!known) console.error(JSON.stringify({ event: "analysis_failed", errorId, name: error instanceof Error ? error.name : "Unknown", latencyMs: Date.now() - startedAt }));
    return Response.json({ error: known && error instanceof Error ? error.message : `We couldn’t read the room this time. Try again. (${errorId})` }, { status: known ? 400 : 502 });
  }
}
