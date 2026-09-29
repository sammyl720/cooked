import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { challenges } from "@/db/schema";
import { sha256 } from "@/lib/proof";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return Response.json({ error: "Challenge not found." }, { status: 404 });
    const [challenge] = await getDb().select({ index: challenges.index, label: challenges.label, mode: challenges.mode, resultVersion: challenges.resultVersion, expiresAt: challenges.expiresAt }).from(challenges).where(eq(challenges.tokenHash, await sha256(token))).limit(1);
    if (!challenge || challenge.expiresAt <= Date.now()) return Response.json({ error: "This challenge has expired or doesn’t exist." }, { status: 404 });
    console.info(JSON.stringify({ event: "challenge_opened", resultVersion: challenge.resultVersion }));
    return Response.json(challenge, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  } catch {
    return Response.json({ error: "This challenge is unavailable right now." }, { status: 503 });
  }
}
