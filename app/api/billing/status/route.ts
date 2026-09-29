import { getBillingStatus } from "@/lib/billing";

export async function GET(request: Request) {
  try {
    const { status, setCookie } = await getBillingStatus(request);
    return Response.json(status, { headers: setCookie ? { "Set-Cookie": setCookie } : undefined });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({ event: "billing_status_failed", errorId, name: error instanceof Error ? error.name : "Unknown" }));
    return Response.json({ error: `Billing status is temporarily unavailable. (${errorId})` }, { status: 503 });
  }
}
