import { normalizeInput, looksConversational } from "@/lib/conversation";
import { getBillingStatus, refundAnalysisCredit, reserveAnalysisCredit } from "@/lib/billing";
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
  let reservedAccountHash: string | null = null;
  try {
    const input = normalizeInput(await request.json());
    if (!looksConversational(input.turns)) {
      return Response.json({ status: "insufficient", reason: "This doesn’t look like a conversation yet. Add short, ordered messages from both people." });
    }
    const safety = moderateConversation(input.turns);
    if (!safety.safe) return Response.json({ status: "safety", reason: safety.reason, resources: safety.resources });

    const reservation = await reserveAnalysisCredit(request);
    if (reservation.enabled) {
      if (!reservation.reserved) {
        const { status, setCookie } = await getBillingStatus(request);
        return Response.json(
          { error: "You’re out of reads. Add a pack to keep reading the room.", code: "credits_exhausted", billing: status },
          { status: 402, headers: setCookie || reservation.setCookie ? { "Set-Cookie": setCookie || reservation.setCookie! } : undefined },
        );
      }
      reservedAccountHash = reservation.accountHash;
    }

    const { evaluation, demo } = await new TypeSafeJevClient().evaluate(input.turns);
    const outcome = resultFromEvaluation(evaluation, input.turns);
    console.info(JSON.stringify({ event: outcome.status === "scored" ? "analysis_scored" : "analysis_insufficient", model: evaluation.model, rubricVersion: RESULT_VERSION, latencyMs: Date.now() - startedAt, demo }));
    if (outcome.status === "insufficient") {
      if (reservedAccountHash) await refundAnalysisCredit(reservedAccountHash);
      return Response.json(outcome, { headers: reservation.enabled && reservation.setCookie ? { "Set-Cookie": reservation.setCookie } : undefined });
    }
    const proof = await createProof({ index: outcome.result.index, label: outcome.result.label, mode: "dating", resultVersion: RESULT_VERSION });
    return Response.json(
      { status: "scored", result: { ...outcome.result, proof, demo } },
      { headers: reservation.enabled && reservation.setCookie ? { "Set-Cookie": reservation.setCookie } : undefined },
    );
  } catch (error) {
    if (reservedAccountHash) {
      try { await refundAnalysisCredit(reservedAccountHash); }
      catch (refundError) { console.error(JSON.stringify({ event: "billing_refund_failed", errorId, name: refundError instanceof Error ? refundError.name : "Unknown" })); }
    }
    const known = error instanceof Error && /Add |Assign |Only Dating/.test(error.message);
    if (!known) console.error(JSON.stringify({ event: "analysis_failed", errorId, name: error instanceof Error ? error.name : "Unknown", latencyMs: Date.now() - startedAt }));
    return Response.json({ error: known && error instanceof Error ? error.message : `We couldn’t read the room this time. Try again. (${errorId})` }, { status: known ? 400 : 502 });
  }
}
