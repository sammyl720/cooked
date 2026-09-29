import { lte } from "drizzle-orm";
import { getDb } from "@/db";
import { challenges } from "@/db/schema";
import { randomToken, sha256, verifyProof } from "@/lib/proof";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "challenge", 8, 5 * 60_000);
  if (limited) return limited;
  try {
    const payload = await request.json() as { index?: unknown; label?: unknown; mode?: unknown; resultVersion?: unknown; proof?: unknown };
    if (typeof payload.proof !== "string") return Response.json({ error: "Analyze a chat before creating a challenge." }, { status: 400 });
    const claims = await verifyProof(payload.proof);
    if (!claims || claims.index !== payload.index || claims.label !== payload.label || claims.mode !== payload.mode || claims.resultVersion !== payload.resultVersion) {
      return Response.json({ error: "That result proof is invalid or has expired. Analyze again to create a challenge." }, { status: 403 });
    }
    const token = randomToken();
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60_000;
    const db = getDb();
    await db.delete(challenges).where(lte(challenges.expiresAt, now));
    await db.insert(challenges).values({ tokenHash: await sha256(token), index: claims.index, label: claims.label, mode: claims.mode, resultVersion: claims.resultVersion, createdAt: now, expiresAt });
    const url = new URL(`/c/${token}`, request.url).toString();
    console.info(JSON.stringify({ event: "challenge_created", resultVersion: claims.resultVersion }));
    return Response.json({ token, url, expiresAt });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({ event: "challenge_failed", errorId, name: error instanceof Error ? error.name : "Unknown" }));
    return Response.json({ error: `We couldn’t create the challenge. Try again. (${errorId})` }, { status: 503 });
  }
}
