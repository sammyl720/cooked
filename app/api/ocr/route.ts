import { validateImage } from "@/lib/image-validation";
import { OpenAIOcrProvider } from "@/lib/ocr-provider";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "ocr", 6);
  if (limited) return limited;
  const errorId = crypto.randomUUID().slice(0, 8);
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return Response.json({ error: "Choose one image to extract." }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return Response.json({ error: "Keep the screenshot under 8 MB." }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = validateImage(bytes);
    const result = await new OpenAIOcrProvider().extract(bytes, image.type);
    console.info(JSON.stringify({ event: "ocr_completed", success: true, widthBucket: Math.ceil(image.width / 500) * 500, heightBucket: Math.ceil(image.height / 500) * 500 }));
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "OCR_NOT_CONFIGURED") return Response.json({ error: "Automatic extraction isn’t configured in this preview. You can still type the messages into the review step." }, { status: 503 });
    const known = message.startsWith("Use a valid") || message.startsWith("That image") || message.startsWith("The image");
    if (!known) console.error(JSON.stringify({ event: "ocr_completed", success: false, errorId, name: error instanceof Error ? error.name : "Unknown" }));
    return Response.json({ error: known ? message : `We couldn’t extract that screenshot. Try another image or enter the text manually. (${errorId})` }, { status: known ? 400 : 502 });
  }
}
