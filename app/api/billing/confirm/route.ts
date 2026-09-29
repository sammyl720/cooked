import { fulfillCheckoutSession, getBillingConfig, getBillingStatus, getOrCreateBillingAccount, getStripeClient } from "@/lib/billing";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "billing_confirm", 10, 10 * 60_000);
  if (limited) return limited;
  try {
    const config = getBillingConfig();
    if (!config.stripeSecretKey) return Response.json({ error: "Billing is not configured." }, { status: 503 });
    const body = await request.json() as { sessionId?: unknown };
    if (typeof body.sessionId !== "string" || !/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(body.sessionId)) {
      return Response.json({ error: "Invalid checkout session." }, { status: 400 });
    }
    const account = await getOrCreateBillingAccount(request);
    const session = await getStripeClient().checkout.sessions.retrieve(body.sessionId);
    if (session.client_reference_id !== account.accountHash) {
      return Response.json({ error: "That checkout belongs to a different browser." }, { status: 403 });
    }
    if (session.payment_status !== "paid") {
      return Response.json({ pending: true, credits: account.credits }, { headers: account.setCookie ? { "Set-Cookie": account.setCookie } : undefined });
    }
    await fulfillCheckoutSession(session, `confirm:${session.id}`);
    const { status, setCookie } = await getBillingStatus(request);
    console.info(JSON.stringify({ event: "checkout_confirmed", plan: "read_pack" }));
    return Response.json({ pending: false, ...status }, { headers: setCookie || account.setCookie ? { "Set-Cookie": setCookie || account.setCookie! } : undefined });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({ event: "checkout_confirmation_failed", errorId, name: error instanceof Error ? error.name : "Unknown" }));
    return Response.json({ error: `We couldn’t confirm the purchase yet. (${errorId})` }, { status: 502 });
  }
}
