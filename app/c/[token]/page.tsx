import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { CookedApp } from "@/components/cooked-app";
import { getDb } from "@/db";
import { challenges } from "@/db/schema";
import { sha256 } from "@/lib/proof";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  try {
    const { token } = await params;
    const [challenge] = await getDb().select({ index: challenges.index, label: challenges.label, expiresAt: challenges.expiresAt }).from(challenges).where(eq(challenges.tokenHash, await sha256(token))).limit(1);
    if (!challenge || challenge.expiresAt <= Date.now()) return { title: "Challenge unavailable · Cooked?", description: "Read the visible signals in your dating chat." };
    const title = `Can you beat a Cooked Index of ${challenge.index}?`;
    return { title, description: `${challenge.label}. Lower wins. Try your own chat without sharing either transcript.`, openGraph: { title, description: `Cooked Index ${challenge.index}/100. Lower wins.` } };
  } catch {
    return { title: "Cooked? challenge", description: "Read the visible signals in your dating chat." };
  }
}

export default async function ChallengePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CookedApp challengeToken={token} />;
}
