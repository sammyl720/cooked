const EVENTS = new Set([
  "landing_view", "input_started", "ocr_completed", "analysis_started", "analysis_scored", "analysis_insufficient",
  "share_card_downloaded", "native_share_opened", "challenge_created", "challenge_opened", "challenge_completed", "feedback",
  "checkout_started", "purchase_completed", "reply_copied",
]);
const ALLOWED_PROPERTIES = new Set(["source", "success", "latencyBucket", "resultVersion", "scoreBucket", "reaction", "packCredits", "tone"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { event?: unknown; properties?: unknown };
    if (typeof body.event !== "string" || !EVENTS.has(body.event)) return new Response(null, { status: 400 });
    const properties: Record<string, string | number | boolean> = {};
    if (body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)) {
      for (const [key, value] of Object.entries(body.properties)) {
        if (ALLOWED_PROPERTIES.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) properties[key] = value;
      }
    }
    console.info(JSON.stringify({ event: body.event, ...properties }));
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
