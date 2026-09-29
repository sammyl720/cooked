import Stripe from "stripe";
import { fulfillCheckoutSession, getBillingConfig, getStripeClient } from "@/lib/billing";

export async function POST(request: Request) {
  const config = getBillingConfig();
  if (!config.stripeWebhookSecret || !config.stripeSecretKey) return new Response("Billing is not configured.", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature.", { status: 400 });

  try {
    const payload = await request.text();
    const event = await getStripeClient().webhooks.constructEventAsync(
      payload,
      signature,
      config.stripeWebhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session, event.id);
      console.info(JSON.stringify({ event: "billing_fulfilled", stripeEventType: event.type }));
    }
    return Response.json({ received: true });
  } catch (error) {
    console.warn(JSON.stringify({ event: "billing_webhook_rejected", name: error instanceof Error ? error.name : "Unknown" }));
    return new Response("Invalid webhook.", { status: 400 });
  }
}
