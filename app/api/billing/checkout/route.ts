import { BILLING_PACK_CODE, getBillingConfig, getOrCreateBillingAccount, getStripeClient } from "@/lib/billing";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "billing_checkout", 5, 10 * 60_000);
  if (limited) return limited;
  try {
    const config = getBillingConfig();
    if (!config.enabled || !config.stripePriceId) {
      return Response.json({ error: "Purchases aren’t available yet." }, { status: 503 });
    }
    const account = await getOrCreateBillingAccount(request);
    const origin = new URL(request.url).origin;
    const session = await getStripeClient().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: config.stripePriceId, quantity: 1 }],
      client_reference_id: account.accountHash,
      customer_creation: "always",
      allow_promotion_codes: true,
      automatic_tax: { enabled: config.automaticTax },
      metadata: { plan: BILLING_PACK_CODE },
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=canceled`,
    });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    console.info(JSON.stringify({ event: "checkout_started", plan: BILLING_PACK_CODE }));
    return Response.json({ url: session.url }, { headers: account.setCookie ? { "Set-Cookie": account.setCookie } : undefined });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({ event: "checkout_failed", errorId, name: error instanceof Error ? error.name : "Unknown" }));
    return Response.json({ error: `Checkout couldn’t start. Try again. (${errorId})` }, { status: 502 });
  }
}
