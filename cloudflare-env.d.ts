declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TYPESAFE_API_KEY?: string;
    OPENAI_API_KEY?: string;
    OCR_MODEL?: string;
    CHALLENGE_SIGNING_SECRET?: string;
    RATE_LIMIT_SALT?: string;
    BILLING_ENABLED?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_PRICE_ID?: string;
    BILLING_FREE_READS?: string;
    BILLING_PACK_CREDITS?: string;
    BILLING_PRICE_DISPLAY?: string;
    STRIPE_AUTOMATIC_TAX?: string;
  }
}
