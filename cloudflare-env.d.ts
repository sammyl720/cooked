declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TYPESAFE_API_KEY?: string;
    OPENAI_API_KEY?: string;
    OCR_MODEL?: string;
    CHALLENGE_SIGNING_SECRET?: string;
    RATE_LIMIT_SALT?: string;
  }
}
